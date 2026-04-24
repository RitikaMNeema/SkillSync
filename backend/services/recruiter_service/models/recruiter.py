from datetime import date, datetime
from decimal import Decimal

from pymysql.err import OperationalError

from shared.database.mysql import get_pool

PAGE_SIZE = 20


def _json_safe_row(row: dict | None) -> dict | None:
    """Ensure recruiter rows JSON-encode cleanly (Decimal/datetime from MySQL drivers)."""
    if row is None:
        return None
    out: dict = {}
    for k, v in row.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = int(v) if v == int(v) else float(v)
        elif isinstance(v, (bytes, bytearray)):
            out[k] = v.decode("utf-8", errors="replace")
        else:
            out[k] = v
    return out


async def find_company(company_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM companies WHERE company_id = %s", (company_id,))
            return await cur.fetchone()


async def create_company(
    name: str, industry: str = None, size: str = None, location: str = None
) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    "INSERT INTO companies (name, industry, size, location) VALUES (%s,%s,%s,%s)",
                    (name, industry, size, location),
                )
            except OperationalError as exc:
                # Older DB volumes without `companies.location` (1054 = unknown column)
                if exc.args and exc.args[0] == 1054 and "location" in str(exc).lower():
                    await cur.execute(
                        "INSERT INTO companies (name, industry, size) VALUES (%s,%s,%s)",
                        (name, industry, size),
                    )
                else:
                    raise
            return cur.lastrowid


async def update_company(company_id: int, fields: dict) -> None:
    allowed = {"name", "industry", "size", "location"}
    clauses = [f"{k}=%s" for k in fields if k in allowed]
    if not clauses:
        return
    values = [fields[k] for k in fields if k in allowed] + [company_id]
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE companies SET {','.join(clauses)} WHERE company_id=%s", values)


async def recruiter_exists(recruiter_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT recruiter_id FROM recruiters WHERE recruiter_id=%s", (recruiter_id,))
            return await cur.fetchone() is not None


async def create_recruiter(recruiter_id, company_id, name, email, phone=None, role=None, access_level=None) -> None:
    pool = await get_pool()
    phone_val = (phone or "").strip() or None
    if phone_val and len(phone_val) > 30:
        phone_val = phone_val[:30]
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO recruiters (recruiter_id,company_id,name,email,phone,role,access_level) VALUES(%s,%s,%s,%s,%s,%s,%s)",
                (recruiter_id, company_id, name, email, phone_val, role, access_level),
            )


async def get_recruiter(recruiter_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    """SELECT r.*, c.name AS company_name, c.industry, c.size, c.location AS company_location
                       FROM recruiters r JOIN companies c ON r.company_id=c.company_id
                       WHERE r.recruiter_id=%s""",
                    (recruiter_id,),
                )
            except OperationalError as exc:
                if exc.args and exc.args[0] == 1054 and "location" in str(exc).lower():
                    await cur.execute(
                        """SELECT r.*, c.name AS company_name, c.industry, c.size
                           FROM recruiters r JOIN companies c ON r.company_id=c.company_id
                           WHERE r.recruiter_id=%s""",
                        (recruiter_id,),
                    )
                else:
                    raise
            return _json_safe_row(await cur.fetchone())


async def update_recruiter(recruiter_id: int, fields: dict) -> None:
    allowed = {"name", "email", "phone", "role", "access_level", "company_id"}
    clauses = [f"{k}=%s" for k in fields if k in allowed]
    if not clauses:
        return
    values = [fields[k] for k in fields if k in allowed] + [recruiter_id]
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE recruiters SET {','.join(clauses)} WHERE recruiter_id=%s", values)


async def delete_recruiter(recruiter_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM recruiters WHERE recruiter_id=%s", (recruiter_id,))


async def search_recruiters(name, company, industry, page) -> tuple[list, int]:
    conditions, values = [], []
    if name:
        conditions.append("r.name LIKE %s"); values.append(f"%{name}%")
    if company:
        conditions.append("c.name LIKE %s"); values.append(f"%{company}%")
    if industry:
        conditions.append("c.industry LIKE %s"); values.append(f"%{industry}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT r.*,c.name AS company_name,c.industry,c.size FROM recruiters r JOIN companies c ON r.company_id=c.company_id {where} ORDER BY r.recruiter_id DESC LIMIT %s OFFSET %s",
                [*values, PAGE_SIZE, offset],
            )
            rows = await cur.fetchall()
            await cur.execute(f"SELECT COUNT(*) as total FROM recruiters r JOIN companies c ON r.company_id=c.company_id {where}", values)
            total = (await cur.fetchone())["total"]
    return rows, total


async def recruiters_by_company(company_id: int, page: int) -> tuple[list, int]:
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT r.*,c.name AS company_name,c.industry,c.size FROM recruiters r JOIN companies c ON r.company_id=c.company_id WHERE r.company_id=%s ORDER BY r.recruiter_id DESC LIMIT %s OFFSET %s",
                (company_id, PAGE_SIZE, offset),
            )
            rows = await cur.fetchall()
            await cur.execute("SELECT COUNT(*) as total FROM recruiters WHERE company_id=%s", (company_id,))
            total = (await cur.fetchone())["total"]
    return rows, total
