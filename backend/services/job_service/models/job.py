import json
from datetime import datetime, date
from decimal import Decimal
from shared.database.mysql import get_pool


def _serialize_row(row: dict) -> dict:
    """Convert non-JSON-native MySQL types to safe Python primitives."""
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out

PAGE_SIZE = 20


async def create_job(f: dict) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO jobs (company_id,recruiter_id,title,description,seniority_level,
                   employment_type,location,work_mode,skills_required,salary_min,salary_max,status)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open')""",
                (f["company_id"], f["recruiter_id"], f["title"], f.get("description"),
                 f.get("seniority_level"), f.get("employment_type"), f.get("location"), f["work_mode"],
                 json.dumps(f["skills_required"]) if f.get("skills_required") else None,
                 f.get("salary_min"), f.get("salary_max")),
            )
            return cur.lastrowid


async def get_job(job_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT j.*,c.name AS company_name,c.industry FROM jobs j JOIN companies c ON j.company_id=c.company_id WHERE j.job_id=%s",
                (job_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            if isinstance(row.get("skills_required"), str):
                row["skills_required"] = json.loads(row["skills_required"])
            return _serialize_row(row)


async def update_job(job_id: int, fields: dict) -> None:
    allowed = {"title","description","seniority_level","employment_type","location","work_mode","skills_required","salary_min","salary_max"}
    clauses, values = [], []
    for k, v in fields.items():
        if k in allowed and v is not None:
            clauses.append(f"{k}=%s")
            values.append(json.dumps(v) if k == "skills_required" else v)
    if not clauses:
        return
    values.append(job_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE jobs SET {','.join(clauses)} WHERE job_id=%s", values)


async def close_job(job_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE jobs SET status='closed' WHERE job_id=%s AND status='open'", (job_id,))
            return cur.rowcount > 0


async def delete_job(job_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM jobs WHERE job_id=%s", (job_id,))
            return cur.rowcount > 0


async def increment_views(job_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE jobs SET views_count=views_count+1 WHERE job_id=%s", (job_id,))


async def search_jobs(keyword, location, employment_type, work_mode, industry, seniority_level, page) -> tuple[list, int]:
    conditions = ["j.status='open'"]
    values = []
    if keyword:
        conditions.append("(j.title LIKE %s OR j.description LIKE %s OR c.name LIKE %s OR j.location LIKE %s)")
        values += [f"%{keyword}%", f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"]
    if location:
        conditions.append("j.location LIKE %s"); values.append(f"%{location}%")
    if employment_type:
        conditions.append("j.employment_type=%s"); values.append(employment_type)
    if work_mode:
        conditions.append("j.work_mode=%s"); values.append(work_mode)
    if industry:
        conditions.append("c.industry LIKE %s"); values.append(f"%{industry}%")
    if seniority_level:
        conditions.append("j.seniority_level=%s"); values.append(seniority_level)
    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT j.job_id,j.title,j.location,j.work_mode,j.employment_type,j.seniority_level,j.salary_min,j.salary_max,j.posted_datetime,j.views_count,j.applicants_count,c.name AS company_name,c.industry FROM jobs j JOIN companies c ON j.company_id=c.company_id {where} ORDER BY j.posted_datetime DESC LIMIT %s OFFSET %s",
                [*values, PAGE_SIZE, offset],
            )
            rows = await cur.fetchall()
            await cur.execute(f"SELECT COUNT(*) as total FROM jobs j JOIN companies c ON j.company_id=c.company_id {where}", values)
            total = (await cur.fetchone())["total"]
    return rows, total


async def jobs_by_recruiter(recruiter_id: int, page: int) -> tuple[list, int]:
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT j.*,c.name AS company_name,c.industry FROM jobs j JOIN companies c ON j.company_id=c.company_id WHERE j.recruiter_id=%s ORDER BY j.posted_datetime DESC LIMIT %s OFFSET %s",
                (recruiter_id, PAGE_SIZE, offset),
            )
            rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM jobs WHERE recruiter_id=%s", (recruiter_id,))
            total = (await cur.fetchone())["total"]
    return rows, total


async def save_job(member_id: int, job_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("INSERT IGNORE INTO saved_jobs (member_id,job_id) VALUES(%s,%s)", (member_id, job_id))
            return cur.rowcount > 0


async def unsave_job(member_id: int, job_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM saved_jobs WHERE member_id=%s AND job_id=%s", (member_id, job_id))
            return cur.rowcount > 0


async def saved_by_member(member_id: int, page: int) -> tuple[list, int]:
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT j.job_id,j.title,j.location,j.work_mode,j.employment_type,j.status,j.posted_datetime,sj.saved_at,c.name AS company_name,c.industry FROM saved_jobs sj JOIN jobs j ON sj.job_id=j.job_id JOIN companies c ON j.company_id=c.company_id WHERE sj.member_id=%s ORDER BY sj.saved_at DESC LIMIT %s OFFSET %s",
                (member_id, PAGE_SIZE, offset),
            )
            rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM saved_jobs WHERE member_id=%s", (member_id,))
            total = (await cur.fetchone())["total"]
    return rows, total
