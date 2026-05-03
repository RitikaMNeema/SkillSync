"""Lightweight recruiter reads for profile_service (posts / comments author hydration)."""

from pymysql.err import OperationalError

from shared.database.mysql import get_pool


async def apply_recruiter_connection_delta(recruiter_id: int, delta: int) -> None:
    """Keep `recruiters.connections_count` in sync when the social graph changes (mirrors members table)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE recruiters
                SET connections_count = GREATEST(connections_count + %s, 0)
                WHERE recruiter_id = %s
                """,
                (delta, recruiter_id),
            )


async def get_recruiter_row_for_author(recruiter_id: int) -> dict | None:
    """Return fields needed to render post/comment author cards."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    """
                    SELECT r.recruiter_id, r.name, r.first_name, r.last_name, r.headline,
                           r.profile_photo_url, COALESCE(c.name, '') AS company_name
                    FROM recruiters r
                    LEFT JOIN companies c ON r.company_id = c.company_id
                    WHERE r.recruiter_id = %s
                    """,
                    (recruiter_id,),
                )
            except OperationalError:
                await cur.execute(
                    """
                    SELECT r.recruiter_id, r.name, COALESCE(c.name, '') AS company_name
                    FROM recruiters r
                    LEFT JOIN companies c ON r.company_id = c.company_id
                    WHERE r.recruiter_id = %s
                    """,
                    (recruiter_id,),
                )
            row = await cur.fetchone()
            if not row:
                return None
            if not isinstance(row, dict):
                return None
            return row
