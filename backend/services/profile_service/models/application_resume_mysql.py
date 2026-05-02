"""MySQL lookup for application ↔ job parties (resume download authorization)."""

from shared.database.mysql import get_pool


async def get_application_resume_parties(application_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT a.member_id AS applicant_member_id, j.recruiter_id AS job_recruiter_id
                FROM applications a
                INNER JOIN jobs j ON a.job_id = j.job_id
                WHERE a.application_id = %s
                """,
                (application_id,),
            )
            row = await cur.fetchone()
            return row if row else None
