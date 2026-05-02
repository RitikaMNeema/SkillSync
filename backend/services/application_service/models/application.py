import json
from shared.database.mysql import get_pool

PAGE_SIZE = 20

# Class doc §4.4: optional résumé text on the application row (keep bounded for DB + Kafka metadata).
MAX_APPLICATION_RESUME_TEXT_CHARS = 49152

VALID_TRANSITIONS = {
    "submitted": ["reviewing", "rejected", "withdrawn"],
    "reviewing": ["interview", "rejected", "withdrawn"],
    "interview": ["offer",    "rejected", "withdrawn"],
    "offer":     ["rejected", "withdrawn"],
    "rejected":  [],
    "withdrawn": [],
}


def _normalize_incoming_resume_url(resume_url) -> str | None:
    if resume_url is None:
        return None
    s = str(resume_url).strip()
    return s if s else None


def _normalize_resume_text(resume_text) -> str | None:
    if resume_text is None:
        return None
    s = str(resume_text).strip()
    if not s:
        return None
    if len(s) > MAX_APPLICATION_RESUME_TEXT_CHARS:
        s = s[:MAX_APPLICATION_RESUME_TEXT_CHARS]
    return s


def _incoming_resume_link(resume_url, resume_ref) -> str | None:
    """Prefer explicit resume_url; fall back to course-doc resume_ref (same semantics)."""
    u = _normalize_incoming_resume_url(resume_url)
    if u:
        return u
    return _normalize_incoming_resume_url(resume_ref)


async def _resume_url_after_submit(cur, member_id: int, application_id: int, incoming: str | None) -> str | None:
    """Prefer explicit URL; otherwise link to GridFS resume via profile-service GET route."""
    if incoming:
        return incoming
    await cur.execute(
        "SELECT resume_file_id FROM members WHERE member_id=%s AND is_deleted=0",
        (member_id,),
    )
    mem = await cur.fetchone()
    if mem and mem.get("resume_file_id"):
        return f"/members/resume/application/{application_id}"
    return None


async def submit_application_transaction(
    job_id, member_id, resume_url, resume_ref, resume_text, cover_letter, answers
) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.begin()
        try:
            async with conn.cursor() as cur:
                # Lock job row and verify it's open
                await cur.execute("SELECT status FROM jobs WHERE job_id=%s FOR UPDATE", (job_id,))
                job = await cur.fetchone()
                if not job:
                    raise ValueError("JOB_NOT_FOUND")
                if job["status"] != "open":
                    raise ValueError("JOB_CLOSED")

                incoming_resume = _incoming_resume_link(resume_url, resume_ref)
                stored_resume_text = _normalize_resume_text(resume_text)

                await cur.execute(
                    "SELECT resume_file_id FROM members WHERE member_id=%s AND is_deleted=0",
                    (member_id,),
                )
                mem_for_resume = await cur.fetchone()
                has_member_pdf = bool(mem_for_resume and mem_for_resume.get("resume_file_id"))
                # Class doc §4.4: application must carry résumé URL/ref and/or text and/or member PDF.
                if not incoming_resume and not stored_resume_text and not has_member_pdf:
                    raise ValueError("RESUME_REQUIRED")

                # Check duplicate (row is unique by job_id + member_id).
                await cur.execute(
                    "SELECT application_id, status FROM applications WHERE job_id=%s AND member_id=%s FOR UPDATE",
                    (job_id, member_id),
                )
                existing = await cur.fetchone()
                if existing:
                    if existing["status"] != "withdrawn":
                        raise ValueError("DUPLICATE")
                    # Re-apply path: revive withdrawn application in place.
                    app_id = existing["application_id"]
                    stored_resume = await _resume_url_after_submit(cur, member_id, app_id, incoming_resume)
                    await cur.execute(
                        """
                        UPDATE applications
                        SET resume_url=%s,
                            resume_text=%s,
                            cover_letter=%s,
                            answers=%s,
                            status='submitted',
                            application_datetime=CURRENT_TIMESTAMP
                        WHERE application_id=%s
                        """,
                        (
                            stored_resume,
                            stored_resume_text,
                            cover_letter,
                            json.dumps(answers) if answers else None,
                            app_id,
                        ),
                    )
                    await conn.commit()
                    return app_id

                await cur.execute(
                    """INSERT INTO applications (job_id,member_id,resume_url,resume_text,cover_letter,answers,status)
                       VALUES(%s,%s,%s,%s,%s,%s,'submitted')""",
                    (
                        job_id,
                        member_id,
                        None,
                        stored_resume_text,
                        cover_letter,
                        json.dumps(answers) if answers else None,
                    ),
                )
                app_id = cur.lastrowid
                stored_resume = await _resume_url_after_submit(cur, member_id, app_id, incoming_resume)
                if stored_resume:
                    await cur.execute(
                        "UPDATE applications SET resume_url=%s WHERE application_id=%s",
                        (stored_resume, app_id),
                    )
                await cur.execute(
                    "UPDATE jobs SET applicants_count=applicants_count+1 WHERE job_id=%s", (job_id,)
                )
            await conn.commit()
            return app_id
        except Exception:
            await conn.rollback()
            raise


async def get_application(application_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT a.*,j.title AS job_title,j.status AS job_status,
                          j.recruiter_id AS job_recruiter_id,c.name AS company_name
                   FROM applications a
                   JOIN jobs j ON a.job_id=j.job_id
                   JOIN companies c ON j.company_id=c.company_id
                   WHERE a.application_id=%s""",
                (application_id,),
            )
            return await cur.fetchone()


async def get_member_location(member_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT location_city, location_state FROM members WHERE member_id=%s",
                (member_id,),
            )
            return await cur.fetchone()


async def get_job_recruiter_id(job_id: int) -> int | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT recruiter_id FROM jobs WHERE job_id=%s", (job_id,))
            row = await cur.fetchone()
            if not row:
                return None
            return row["recruiter_id"]


async def apps_by_job(job_id: int, page: int) -> tuple[list, int]:
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT application_id,member_id,status,application_datetime,resume_url,resume_text,cover_letter FROM applications WHERE job_id=%s ORDER BY application_datetime DESC LIMIT %s OFFSET %s",
                (job_id, PAGE_SIZE, offset),
            )
            rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM applications WHERE job_id=%s", (job_id,))
            total = (await cur.fetchone())["total"]
    return rows, total


async def apps_by_member(member_id: int, page: int) -> tuple[list, int]:
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT a.application_id,a.job_id,a.status,a.application_datetime,j.title AS job_title,c.name AS company_name FROM applications a JOIN jobs j ON a.job_id=j.job_id JOIN companies c ON j.company_id=c.company_id WHERE a.member_id=%s ORDER BY a.application_datetime DESC LIMIT %s OFFSET %s",
                (member_id, PAGE_SIZE, offset),
            )
            rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM applications WHERE member_id=%s", (member_id,))
            total = (await cur.fetchone())["total"]
    return rows, total


async def update_status(application_id: int, new_status: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE applications SET status=%s WHERE application_id=%s", (new_status, application_id)
            )


async def auto_reject_by_job(job_id: int) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE applications SET status='rejected' WHERE job_id=%s AND status IN ('submitted','reviewing','interview')",
                (job_id,),
            )
            return cur.rowcount


async def withdraw_application(application_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE applications SET status='withdrawn' WHERE application_id=%s AND status NOT IN ('rejected','withdrawn')",
                (application_id,),
            )
            return cur.rowcount > 0


async def add_note(application_id: int, recruiter_id: int, note_text: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO application_notes (application_id,recruiter_id,note_text) VALUES(%s,%s,%s)",
                (application_id, recruiter_id, note_text),
            )
            return cur.lastrowid


async def get_notes(application_id: int) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM application_notes WHERE application_id=%s ORDER BY created_at ASC",
                (application_id,),
            )
            return await cur.fetchall()
