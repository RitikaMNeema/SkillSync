import json
from typing import Any

from shared.database.mysql import get_pool

PAGE_SIZE = 20

PROFILE_DETAIL_TABLES_SQL = [
    """
    CREATE TABLE IF NOT EXISTS experience (
      experience_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      title VARCHAR(255) NOT NULL,
      employment_type VARCHAR(100),
      company VARCHAR(255) NOT NULL,
      is_current TINYINT(1) NOT NULL DEFAULT 0,
      start_month VARCHAR(20),
      start_year SMALLINT UNSIGNED,
      end_month VARCHAR(20),
      end_year SMALLINT UNSIGNED,
      location VARCHAR(255),
      location_type VARCHAR(100),
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_experience_member (member_id, sort_order),
      CONSTRAINT fk_experience_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS education (
      education_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      school VARCHAR(255) NOT NULL,
      degree VARCHAR(255),
      field_of_study VARCHAR(255),
      start_month VARCHAR(20),
      start_year SMALLINT UNSIGNED,
      end_month VARCHAR(20),
      end_year SMALLINT UNSIGNED,
      grade VARCHAR(80),
      activities TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_education_member (member_id, sort_order),
      CONSTRAINT fk_education_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS skills (
      skill_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      skill_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_skills_member (member_id, sort_order),
      KEY idx_skills_name (skill_name),
      CONSTRAINT fk_skills_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
    )
    """,
]

# Column additions required by file-upload / profile-polish flows. Applied
# idempotently at startup because MySQL < 8.0.19 does not support
# "ADD COLUMN IF NOT EXISTS".
MEMBER_FILE_COLUMNS: list[tuple[str, str]] = [
    ("profile_photo_file_id", "VARCHAR(64)"),
    ("resume_file_id", "VARCHAR(64)"),
    ("resume_file_name", "VARCHAR(255)"),
    ("resume_content_type", "VARCHAR(100)"),
    ("resume_uploaded_at", "TIMESTAMP NULL DEFAULT NULL"),
    ("open_to", "VARCHAR(32)"),
    ("profile_language", "VARCHAR(64)"),
    ("profile_slug", "VARCHAR(160)"),
]

OPEN_TO_VALUES = {"job", "hiring", "services", "volunteer"}


def build_profile_slug(first_name: str | None, last_name: str | None, member_id: int) -> str:
    """LinkedIn-style slug: `{first-name}-{last-name}-{memberId}` — lowercase, dash-separated."""
    parts: list[str] = []
    for value in (first_name, last_name):
        if not value:
            continue
        token = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
        token = "-".join(segment for segment in token.split("-") if segment)
        if token:
            parts.append(token)
    prefix = "-".join(parts) if parts else f"user-{member_id}"
    return f"{prefix}-{member_id}"


def _safe_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _first(entry: dict, *keys: str):
    """Return first non-empty value for camelCase / snake_case aliases."""
    for key in keys:
        if key not in entry:
            continue
        val = entry.get(key)
        if val is None:
            continue
        if isinstance(val, str) and not val.strip():
            continue
        return val
    return None


def _normalize_experience(entries: Any) -> list[dict]:
    if not isinstance(entries, list):
        return []

    normalized: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        title = _safe_str(_first(entry, "title"))
        company = _safe_str(_first(entry, "company", "organization"))
        if not title and not company:
            continue

        normalized.append(
            {
                "title": title or "Untitled role",
                "employment_type": _safe_str(_first(entry, "employment_type", "employmentType")),
                "company": company or "Unknown organization",
                "is_current": bool(_first(entry, "is_current", "isCurrent")),
                "start_month": _safe_str(_first(entry, "start_month", "startMonth")),
                "start_year": _safe_int(_first(entry, "start_year", "startYear")),
                "end_month": _safe_str(_first(entry, "end_month", "endMonth")),
                "end_year": _safe_int(_first(entry, "end_year", "endYear")),
                "location": _safe_str(_first(entry, "location")),
                "location_type": _safe_str(_first(entry, "location_type", "locationType")),
                "description": _safe_str(_first(entry, "description")),
            }
        )
    return normalized


def _normalize_education(entries: Any) -> list[dict]:
    if not isinstance(entries, list):
        return []

    normalized: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        school = _safe_str(_first(entry, "school"))
        if not school:
            continue

        end_y = _first(entry, "end_year", "endYear")
        grad_y = _first(entry, "year", "graduationYear", "graduation_year")
        end_year_val = _safe_int(end_y if end_y is not None else grad_y)

        normalized.append(
            {
                "school": school,
                "degree": _safe_str(_first(entry, "degree")),
                "field_of_study": _safe_str(_first(entry, "field_of_study", "fieldOfStudy", "field")),
                "start_month": _safe_str(_first(entry, "start_month", "startMonth")),
                "start_year": _safe_int(_first(entry, "start_year", "startYear")),
                "end_month": _safe_str(_first(entry, "end_month", "endMonth")),
                "end_year": end_year_val,
                "grade": _safe_str(_first(entry, "grade")),
                "activities": _safe_str(_first(entry, "activities", "activities_and_societies", "activitiesAndSocieties")),
            }
        )
    return normalized


def _normalize_skills(entries: Any) -> list[str]:
    if not isinstance(entries, list):
        return []
    normalized: list[str] = []
    for entry in entries:
        skill = _safe_str(entry)
        if skill:
            normalized.append(skill)
    return normalized


def _serialize_json(value: Any) -> str | None:
    return json.dumps(value) if value else None


def _experience_display_start(entry: dict) -> str | None:
    month = entry.get("start_month")
    year = entry.get("start_year")
    return " ".join(part for part in [month, str(year) if year else None] if part) or None


def _experience_display_end(entry: dict) -> str | None:
    if entry.get("is_current"):
        return None
    month = entry.get("end_month")
    year = entry.get("end_year")
    return " ".join(part for part in [month, str(year) if year else None] if part) or None


def _experience_response_entry(entry: dict) -> dict:
    return {
        "title": entry.get("title"),
        "employment_type": entry.get("employment_type"),
        "company": entry.get("company"),
        "is_current": bool(entry.get("is_current")),
        "start_month": entry.get("start_month"),
        "start_year": entry.get("start_year"),
        "end_month": entry.get("end_month"),
        "end_year": entry.get("end_year"),
        "location": entry.get("location"),
        "location_type": entry.get("location_type"),
        "description": entry.get("description"),
        "start": _experience_display_start(entry),
        "end": "Present" if entry.get("is_current") else _experience_display_end(entry),
    }


def _education_response_entry(entry: dict) -> dict:
    end_year = entry.get("end_year")
    return {
        "school": entry.get("school"),
        "degree": entry.get("degree"),
        "field": entry.get("field_of_study"),
        "field_of_study": entry.get("field_of_study"),
        "start_month": entry.get("start_month"),
        "start_year": entry.get("start_year"),
        "end_month": entry.get("end_month"),
        "end_year": end_year,
        "year": end_year,
        "grade": entry.get("grade"),
        "activities": entry.get("activities"),
    }


async def ensure_member_profile_tables() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name = 'members' LIMIT 1
                """
            )
            if await cur.fetchone() is None:
                raise RuntimeError("Missing MySQL table `members`; run `database/mysql/init.sql`.")
            for sql in PROFILE_DETAIL_TABLES_SQL:
                await cur.execute(sql)

            await cur.execute(
                """SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members'"""
            )
            rows = await cur.fetchall() or []
            existing: set[str] = set()
            for row in rows:
                name = row.get("COLUMN_NAME") or row.get("column_name")
                if name:
                    existing.add(name.lower())
            for col, col_type in MEMBER_FILE_COLUMNS:
                if col.lower() not in existing:
                    await cur.execute(f"ALTER TABLE members ADD COLUMN {col} {col_type}")


async def member_exists(member_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT member_id FROM members WHERE member_id = %s", (member_id,))
            return await cur.fetchone() is not None


async def _replace_member_experience(cur, member_id: int, experience_entries: list[dict]) -> None:
    await cur.execute("DELETE FROM experience WHERE member_id = %s", (member_id,))
    if not experience_entries:
        return

    await cur.executemany(
        """
        INSERT INTO experience
            (member_id, sort_order, title, employment_type, company, is_current,
             start_month, start_year, end_month, end_year, location, location_type, description)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                member_id,
                index,
                entry["title"],
                entry.get("employment_type"),
                entry["company"],
                1 if entry.get("is_current") else 0,
                entry.get("start_month"),
                entry.get("start_year"),
                entry.get("end_month"),
                entry.get("end_year"),
                entry.get("location"),
                entry.get("location_type"),
                entry.get("description"),
            )
            for index, entry in enumerate(experience_entries)
        ],
    )


async def _replace_member_education(cur, member_id: int, education_entries: list[dict]) -> None:
    await cur.execute("DELETE FROM education WHERE member_id = %s", (member_id,))
    if not education_entries:
        return

    await cur.executemany(
        """
        INSERT INTO education
            (member_id, sort_order, school, degree, field_of_study, start_month,
             start_year, end_month, end_year, grade, activities)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                member_id,
                index,
                entry["school"],
                entry.get("degree"),
                entry.get("field_of_study"),
                entry.get("start_month"),
                entry.get("start_year"),
                entry.get("end_month"),
                entry.get("end_year"),
                entry.get("grade"),
                entry.get("activities"),
            )
            for index, entry in enumerate(education_entries)
        ],
    )


async def _replace_member_skills(cur, member_id: int, skills: list[str]) -> None:
    await cur.execute("DELETE FROM skills WHERE member_id = %s", (member_id,))
    if not skills:
        return

    await cur.executemany(
        """
        INSERT INTO skills (member_id, sort_order, skill_name)
        VALUES (%s, %s, %s)
        """,
        [(member_id, index, skill) for index, skill in enumerate(skills)],
    )


async def create_member(member_id: int, fields: dict) -> None:
    await ensure_member_profile_tables()
    experience_entries = _normalize_experience(fields.get("experience"))
    education_entries = _normalize_education(fields.get("education"))
    skills = _normalize_skills(fields.get("skills"))

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO members
                   (member_id, first_name, last_name, phone, location_city, location_state,
                    location_country, headline, summary, experience, education, skills, profile_photo_url)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    member_id,
                    fields.get("first_name"),
                    fields.get("last_name"),
                    fields.get("phone"),
                    fields.get("location_city"),
                    fields.get("location_state"),
                    fields.get("location_country"),
                    fields.get("headline"),
                    fields.get("summary"),
                    _serialize_json(experience_entries),
                    _serialize_json(education_entries),
                    _serialize_json(skills),
                    fields.get("profile_photo_url"),
                ),
            )
            await _replace_member_experience(cur, member_id, experience_entries)
            await _replace_member_education(cur, member_id, education_entries)
            await _replace_member_skills(cur, member_id, skills)


async def _get_member_experience(cur, member_id: int) -> list[dict]:
    await cur.execute(
        """
        SELECT title, employment_type, company, is_current, start_month, start_year,
               end_month, end_year, location, location_type, description
        FROM experience
        WHERE member_id = %s
        ORDER BY sort_order ASC, experience_id ASC
        """,
        (member_id,),
    )
    rows = await cur.fetchall()
    return [_experience_response_entry(row) for row in rows]


async def _get_member_education(cur, member_id: int) -> list[dict]:
    await cur.execute(
        """
        SELECT school, degree, field_of_study, start_month, start_year,
               end_month, end_year, grade, activities
        FROM education
        WHERE member_id = %s
        ORDER BY sort_order ASC, education_id ASC
        """,
        (member_id,),
    )
    rows = await cur.fetchall()
    return [_education_response_entry(row) for row in rows]


async def _get_member_skills(cur, member_id: int) -> list[str]:
    await cur.execute(
        """
        SELECT skill_name
        FROM skills
        WHERE member_id = %s
        ORDER BY sort_order ASC, skill_id ASC
        """,
        (member_id,),
    )
    rows = await cur.fetchall()
    return [row["skill_name"] for row in rows]


async def get_member_by_id(member_id: int) -> dict | None:
    await ensure_member_profile_tables()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT m.*, u.email
                FROM members m
                LEFT JOIN users u ON u.id = m.member_id
                WHERE m.member_id = %s AND m.is_deleted = 0
                """,
                (member_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None

            legacy_experience = json.loads(row["experience"]) if isinstance(row.get("experience"), str) else row.get("experience")
            legacy_education = json.loads(row["education"]) if isinstance(row.get("education"), str) else row.get("education")
            legacy_skills = json.loads(row["skills"]) if isinstance(row.get("skills"), str) else row.get("skills")
            legacy_experience_entries = [_experience_response_entry(entry) for entry in _normalize_experience(legacy_experience)]
            legacy_education_entries = [_education_response_entry(entry) for entry in _normalize_education(legacy_education)]
            legacy_skill_entries = _normalize_skills(legacy_skills)

            experience_entries = await _get_member_experience(cur, member_id)
            education_entries = await _get_member_education(cur, member_id)
            skill_entries = await _get_member_skills(cur, member_id)

            row["experience"] = experience_entries or legacy_experience_entries
            row["education"] = education_entries or legacy_education_entries
            row["skills"] = skill_entries or legacy_skill_entries

            if not row.get("profile_slug"):
                slug = build_profile_slug(row.get("first_name"), row.get("last_name"), member_id)
                await cur.execute(
                    "UPDATE members SET profile_slug = %s WHERE member_id = %s AND (profile_slug IS NULL OR profile_slug = '') AND is_deleted = 0",
                    (slug, member_id),
                )
                row["profile_slug"] = slug
            if not row.get("profile_language"):
                row["profile_language"] = "English"
            return row


async def update_member(member_id: int, fields: dict) -> None:
    await ensure_member_profile_tables()
    experience_entries = _normalize_experience(fields.get("experience")) if "experience" in fields else None
    education_entries = _normalize_education(fields.get("education")) if "education" in fields else None
    skills = _normalize_skills(fields.get("skills")) if "skills" in fields else None

    if "open_to" in fields:
        value = fields["open_to"]
        if value not in (None, "") and value not in OPEN_TO_VALUES:
            fields = {**fields, "open_to": None}

    json_fields = {"experience", "education", "skills"}
    allowed = {
        "first_name",
        "last_name",
        "phone",
        "location_city",
        "location_state",
        "location_country",
        "headline",
        "summary",
        "experience",
        "education",
        "skills",
        "profile_photo_url",
        "open_to",
        "profile_language",
        "profile_slug",
    }
    nullable_clearable = {"open_to"}
    clauses: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        if value is None and key not in nullable_clearable:
            continue

        if key == "experience":
            value = experience_entries
        elif key == "education":
            value = education_entries
        elif key == "skills":
            value = skills

        clauses.append(f"{key} = %s")
        values.append(json.dumps(value) if key in json_fields else value)

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            if clauses:
                values.append(member_id)
                await cur.execute(
                    f"UPDATE members SET {', '.join(clauses)} WHERE member_id = %s AND is_deleted = 0",
                    values,
                )

            if experience_entries is not None:
                await _replace_member_experience(cur, member_id, experience_entries)
            if education_entries is not None:
                await _replace_member_education(cur, member_id, education_entries)
            if skills is not None:
                await _replace_member_skills(cur, member_id, skills)


async def soft_delete_member(member_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("UPDATE members SET is_deleted = 1 WHERE member_id = %s", (member_id,))


async def update_resume_url(member_id: int, resume_url: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE members SET resume_url = %s WHERE member_id = %s", (resume_url, member_id)
            )


async def get_member_resume_meta(member_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT resume_file_id, resume_file_name, resume_content_type, resume_uploaded_at
                   FROM members WHERE member_id = %s AND is_deleted = 0""",
                (member_id,),
            )
            row = await cur.fetchone()
            return dict(row) if row else None


async def set_resume_file(
    member_id: int,
    file_id: str,
    file_name: str,
    content_type: str,
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET resume_file_id = %s, resume_file_name = %s,
                       resume_content_type = %s, resume_uploaded_at = CURRENT_TIMESTAMP
                   WHERE member_id = %s AND is_deleted = 0""",
                (file_id, file_name, content_type, member_id),
            )


async def clear_resume_file(member_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET resume_file_id = NULL, resume_file_name = NULL,
                       resume_content_type = NULL, resume_uploaded_at = NULL
                   WHERE member_id = %s AND is_deleted = 0""",
                (member_id,),
            )


async def get_member_photo_file_id(member_id: int) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT profile_photo_file_id FROM members WHERE member_id = %s AND is_deleted = 0",
                (member_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            fid = (row or {}).get("profile_photo_file_id")
            return str(fid) if fid else None


async def set_photo_file(member_id: int, file_id: str, url: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET profile_photo_file_id = %s, profile_photo_url = %s
                   WHERE member_id = %s AND is_deleted = 0""",
                (file_id, url, member_id),
            )


async def search_members(keyword, skill, location, page, page_size=PAGE_SIZE) -> tuple[list, int]:
    conditions = ["m.is_deleted = 0"]
    values = []

    if keyword:
        conditions.append("(m.headline LIKE %s OR m.summary LIKE %s OR m.first_name LIKE %s OR m.last_name LIKE %s OR JSON_SEARCH(LOWER(m.skills), 'one', %s) IS NOT NULL)")
        like = f"%{keyword}%"
        values += [like, like, like, like, keyword.lower()]
    if skill:
        conditions.append('JSON_SEARCH(m.skills, "one", %s) IS NOT NULL')
        values.append(skill)
    if location:
        conditions.append("(m.location_city LIKE %s OR m.location_state LIKE %s OR m.location_country LIKE %s)")
        like = f"%{location}%"
        values += [like, like, like]

    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * page_size

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT m.member_id, m.first_name, m.last_name, m.headline,
                           m.location_city, m.location_state, m.location_country,
                           m.skills, m.connections_count
                    FROM members m {where}
                    ORDER BY m.member_id DESC LIMIT %s OFFSET %s""",
                [*values, page_size, offset],
            )
            rows = await cur.fetchall()
            for row in rows:
                if isinstance(row.get("skills"), str):
                    row["skills"] = json.loads(row["skills"])
            await cur.execute(f"SELECT COUNT(*) as total FROM members m {where}", values)
            total = (await cur.fetchone())["total"]
    return rows, total
