from datetime import date, datetime
from decimal import Decimal
import json

from pymysql.err import OperationalError

from shared.database.mysql import get_pool

PAGE_SIZE = 20
OPEN_TO_VALUES = {"job", "hiring", "services", "volunteer"}
PROFILE_STATUS_VALUES = {"none", "open_to_work", "hiring"}
RECRUITER_PROFILE_COLUMNS: list[tuple[str, str]] = [
    ("profile_photo_file_id", "VARCHAR(64)"),
    ("cover_photo_file_id", "VARCHAR(64)"),
    ("first_name", "VARCHAR(120)"),
    ("last_name", "VARCHAR(120)"),
    ("location_city", "VARCHAR(120)"),
    ("location_state", "VARCHAR(120)"),
    ("location_country", "VARCHAR(120)"),
    ("headline", "VARCHAR(220)"),
    ("summary", "TEXT"),
    ("birthday", "DATE NULL"),
    ("website", "VARCHAR(512)"),
    ("profile_photo_url", "VARCHAR(512)"),
    ("cover_photo_url", "VARCHAR(512)"),
    ("open_to", "VARCHAR(32)"),
    ("profile_status", "VARCHAR(32)"),
    ("profile_language", "VARCHAR(64)"),
    ("profile_slug", "VARCHAR(160)"),
    ("experience", "LONGTEXT"),
    ("education", "LONGTEXT"),
    ("skills", "LONGTEXT"),
    ("about", "TEXT"),
    ("languages", "LONGTEXT"),
    ("followed_skills", "LONGTEXT"),
    ("connections_count", "INT NOT NULL DEFAULT 0"),
    ("profile_views", "INT NOT NULL DEFAULT 0"),
]


def _json_load_if_needed(value, fallback):
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return fallback
    return value


def build_profile_slug(first_name: str | None, last_name: str | None, recruiter_id: int) -> str:
    parts: list[str] = []
    for value in (first_name, last_name):
        if not value:
            continue
        token = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
        token = "-".join(segment for segment in token.split("-") if segment)
        if token:
            parts.append(token)
    prefix = "-".join(parts) if parts else f"user-{recruiter_id}"
    return f"{prefix}-{recruiter_id}"


def normalize_profile_slug(raw_slug, recruiter_id: int) -> str:
    token = str(raw_slug or "").strip().lower()
    slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in token)
    slug = "-".join(piece for piece in slug.split("-") if piece)
    if not slug:
        return f"user-{recruiter_id}"
    suffix = f"-{recruiter_id}"
    return slug if slug.endswith(suffix) else f"{slug}{suffix}"


async def ensure_recruiter_profile_columns() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recruiters'"""
            )
            rows = await cur.fetchall() or []
            existing: set[str] = set()
            for row in rows:
                name = row.get("COLUMN_NAME") or row.get("column_name")
                if name:
                    existing.add(name.lower())
            for col, col_type in RECRUITER_PROFILE_COLUMNS:
                if col.lower() not in existing:
                    await cur.execute(f"ALTER TABLE recruiters ADD COLUMN {col} {col_type}")


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
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT recruiter_id FROM recruiters WHERE recruiter_id=%s", (recruiter_id,))
            return await cur.fetchone() is not None


async def create_recruiter(recruiter_id, company_id, name, email, phone=None, role=None, access_level=None) -> None:
    await ensure_recruiter_profile_columns()
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
    await ensure_recruiter_profile_columns()
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
            row = _json_safe_row(await cur.fetchone())
            if not row:
                return None
            row["experience"] = _json_load_if_needed(row.get("experience"), [])
            row["education"] = _json_load_if_needed(row.get("education"), [])
            row["skills"] = _json_load_if_needed(row.get("skills"), [])
            row["languages"] = _json_load_if_needed(row.get("languages"), [])
            row["followed_skills"] = _json_load_if_needed(row.get("followed_skills"), [])
            if row.get("profile_status") not in PROFILE_STATUS_VALUES:
                if row.get("open_to") == "hiring":
                    row["profile_status"] = "hiring"
                elif row.get("open_to") == "job":
                    row["profile_status"] = "open_to_work"
                else:
                    row["profile_status"] = "none"
            if not row.get("profile_language"):
                row["profile_language"] = "English"
            if not row.get("profile_slug"):
                row["profile_slug"] = normalize_profile_slug(
                    build_profile_slug(row.get("first_name"), row.get("last_name"), recruiter_id),
                    recruiter_id,
                )
            return row


async def update_recruiter(recruiter_id: int, fields: dict) -> None:
    await ensure_recruiter_profile_columns()
    if "profile_status" in fields and fields.get("profile_status") not in PROFILE_STATUS_VALUES:
        fields["profile_status"] = "none"
    if "open_to" in fields and fields.get("open_to") not in (None, "") and fields.get("open_to") not in OPEN_TO_VALUES:
        fields["open_to"] = None
    if "profile_slug" in fields and fields.get("profile_slug") is not None:
        fields["profile_slug"] = normalize_profile_slug(fields.get("profile_slug"), recruiter_id)
    json_fields = {"experience", "education", "skills", "languages", "followed_skills"}
    allowed = {
        "name",
        "email",
        "phone",
        "role",
        "access_level",
        "company_id",
        "first_name",
        "last_name",
        "location_city",
        "location_state",
        "location_country",
        "headline",
        "summary",
        "birthday",
        "website",
        "profile_photo_url",
        "cover_photo_url",
        "open_to",
        "profile_status",
        "profile_language",
        "profile_slug",
        "experience",
        "education",
        "skills",
        "about",
        "languages",
        "followed_skills",
        "profile_photo_file_id",
        "cover_photo_file_id",
    }
    clauses = [f"{k}=%s" for k in fields if k in allowed]
    if not clauses:
        return
    values = [json.dumps(fields[k]) if k in json_fields else fields[k] for k in fields if k in allowed] + [recruiter_id]
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"UPDATE recruiters SET {','.join(clauses)} WHERE recruiter_id=%s", values)


async def delete_recruiter(recruiter_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM recruiters WHERE recruiter_id=%s", (recruiter_id,))


async def get_recruiter_photo_file_id(recruiter_id: int) -> str | None:
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT profile_photo_file_id FROM recruiters WHERE recruiter_id = %s",
                (recruiter_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            fid = (row or {}).get("profile_photo_file_id")
            return str(fid) if fid else None


async def get_recruiter_cover_file_id(recruiter_id: int) -> str | None:
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT cover_photo_file_id FROM recruiters WHERE recruiter_id = %s",
                (recruiter_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            fid = (row or {}).get("cover_photo_file_id")
            return str(fid) if fid else None


async def set_recruiter_photo_file(recruiter_id: int, file_id: str, url: str) -> None:
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE recruiters
                   SET profile_photo_file_id = %s, profile_photo_url = %s
                   WHERE recruiter_id = %s""",
                (file_id, url, recruiter_id),
            )


async def set_recruiter_cover_file(recruiter_id: int, file_id: str, url: str) -> None:
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE recruiters
                   SET cover_photo_file_id = %s, cover_photo_url = %s
                   WHERE recruiter_id = %s""",
                (file_id, url, recruiter_id),
            )


async def clear_recruiter_cover_file(recruiter_id: int) -> None:
    await ensure_recruiter_profile_columns()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE recruiters
                   SET cover_photo_file_id = NULL, cover_photo_url = NULL
                   WHERE recruiter_id = %s""",
                (recruiter_id,),
            )


async def search_recruiters(name, company, industry, page, *, exclude_recruiter_id=None) -> tuple[list, int]:
    conditions, values = [], []
    if name:
        conditions.append("r.name LIKE %s"); values.append(f"%{name}%")
    if company:
        conditions.append("c.name LIKE %s"); values.append(f"%{company}%")
    if industry:
        conditions.append("c.industry LIKE %s"); values.append(f"%{industry}%")
    if exclude_recruiter_id is not None:
        conditions.append("r.recruiter_id <> %s")
        values.append(exclude_recruiter_id)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * PAGE_SIZE
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT r.*,c.name AS company_name,c.industry,c.size,c.location AS company_location FROM recruiters r JOIN companies c ON r.company_id=c.company_id {where} ORDER BY r.recruiter_id DESC LIMIT %s OFFSET %s",
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
