import json
from typing import Any

from shared.database.mysql import get_pool

PAGE_SIZE = 20

# Must match `skills.skill_name` / `member_skill_mappings.skill_name` in PROFILE_DETAIL_TABLES_SQL and init.sql.
SKILL_NAME_MAX_CHARS = 255


def _clamp_skill_name(value: Any) -> str:
    """Résumé parsers and CSV cells can emit phrases longer than the VARCHAR cap."""
    raw = _safe_str(value) if value is not None else None
    s = raw or ""
    if len(s) <= SKILL_NAME_MAX_CHARS:
        return s
    return s[:SKILL_NAME_MAX_CHARS].rstrip()


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
    """
    CREATE TABLE IF NOT EXISTS member_skill_mappings (
      mapping_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      member_id BIGINT UNSIGNED NOT NULL,
      skill_name VARCHAR(255) NOT NULL,
      source_type VARCHAR(20) NOT NULL,
      source_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_skill_map_member (member_id, source_type, source_order),
      KEY idx_skill_map_skill (member_id, skill_name),
      CONSTRAINT fk_skill_map_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE CASCADE
    )
    """,
]

# Column additions required by file-upload / profile-polish flows. Applied
# idempotently at startup because MySQL < 8.0.19 does not support
# "ADD COLUMN IF NOT EXISTS".
MEMBER_FILE_COLUMNS: list[tuple[str, str]] = [
    ("profile_photo_file_id", "VARCHAR(64)"),
    ("cover_photo_file_id", "VARCHAR(64)"),
    ("resume_file_id", "VARCHAR(64)"),
    ("resume_file_name", "VARCHAR(255)"),
    ("resume_content_type", "VARCHAR(100)"),
    ("resume_uploaded_at", "TIMESTAMP NULL DEFAULT NULL"),
    ("resume_text", "MEDIUMTEXT NULL"),
    ("open_to", "VARCHAR(32)"),
    ("profile_status", "VARCHAR(32)"),
    ("profile_language", "VARCHAR(64)"),
    ("profile_slug", "VARCHAR(160)"),
    ("cover_photo_url", "VARCHAR(512)"),
    ("birthday", "DATE NULL"),
    ("website", "VARCHAR(512)"),
]

OPEN_TO_VALUES = {"job", "hiring", "services", "volunteer"}
PROFILE_STATUS_VALUES = {"none", "open_to_work", "hiring"}
SKILL_CANONICAL_MAP = {
    "power bi": "Microsoft Power BI",
    "microsoft power bi": "Microsoft Power BI",
    "css": "Cascading Style Sheets (CSS)",
    "js": "JavaScript",
}


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


def normalize_profile_slug(raw_slug: Any, member_id: int) -> str:
    token = str(raw_slug or "").strip().lower()
    slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in token)
    slug = "-".join(piece for piece in slug.split("-") if piece)
    if not slug:
        return f"user-{member_id}"
    suffix = f"-{member_id}"
    return slug if slug.endswith(suffix) else f"{slug}{suffix}"


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


def _clamp_varchar(value: Any, max_chars: int) -> str | None:
    """Truncate to match MySQL VARCHAR(n); keeps persistence safe for scraped/parsed profiles."""
    raw = _safe_str(value)
    if not raw:
        return None
    if len(raw) <= max_chars:
        return raw
    trimmed = raw[:max_chars].rstrip()
    return trimmed or None


# Limits aligned with PROFILE_DETAIL_TABLES_SQL / database/mysql/init.sql
_EXP_TITLE_MAX = 255
_EXP_COMPANY_MAX = 255
_EXP_EMPLOYMENT_MAX = 100
_EXP_MONTH_MAX = 20
_EXP_LOCATION_MAX = 255
_EXP_LOCATION_TYPE_MAX = 100
_EDU_SCHOOL_MAX = 255
_EDU_DEGREE_MAX = 255
_EDU_FIELD_MAX = 255
_EDU_GRADE_MAX = 80
_EDU_MONTH_MAX = 20


def _legacy_json_field(value: Any) -> Any:
    """Parse legacy JSON text columns on members; tolerate empty or invalid JSON."""
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        return None


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
        title = _clamp_varchar(_first(entry, "title"), _EXP_TITLE_MAX)
        company = _clamp_varchar(_first(entry, "company", "organization"), _EXP_COMPANY_MAX)
        if not title and not company:
            continue

        normalized.append(
            {
                "title": title or "Untitled role",
                "employment_type": _clamp_varchar(
                    _first(entry, "employment_type", "employmentType"), _EXP_EMPLOYMENT_MAX
                ),
                "company": company or "Unknown organization",
                "is_current": bool(_first(entry, "is_current", "isCurrent")),
                "start_month": _clamp_varchar(_first(entry, "start_month", "startMonth"), _EXP_MONTH_MAX),
                "start_year": _safe_int(_first(entry, "start_year", "startYear")),
                "end_month": _clamp_varchar(_first(entry, "end_month", "endMonth"), _EXP_MONTH_MAX),
                "end_year": _safe_int(_first(entry, "end_year", "endYear")),
                "location": _clamp_varchar(_first(entry, "location"), _EXP_LOCATION_MAX),
                "location_type": _clamp_varchar(
                    _first(entry, "location_type", "locationType"), _EXP_LOCATION_TYPE_MAX
                ),
                "description": _safe_str(_first(entry, "description")),
                "skill_ids": _normalize_skill_ids(entry),
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
        school = _clamp_varchar(_first(entry, "school"), _EDU_SCHOOL_MAX)
        if not school:
            continue

        end_y = _first(entry, "end_year", "endYear")
        grad_y = _first(entry, "year", "graduationYear", "graduation_year")
        end_year_val = _safe_int(end_y if end_y is not None else grad_y)

        normalized.append(
            {
                "school": school,
                "degree": _clamp_varchar(_first(entry, "degree"), _EDU_DEGREE_MAX),
                "field_of_study": _clamp_varchar(
                    _first(entry, "field_of_study", "fieldOfStudy", "field"), _EDU_FIELD_MAX
                ),
                "start_month": _clamp_varchar(_first(entry, "start_month", "startMonth"), _EDU_MONTH_MAX),
                "start_year": _safe_int(_first(entry, "start_year", "startYear")),
                "end_month": _clamp_varchar(_first(entry, "end_month", "endMonth"), _EDU_MONTH_MAX),
                "end_year": end_year_val,
                "grade": _clamp_varchar(_first(entry, "grade"), _EDU_GRADE_MAX),
                "activities": _safe_str(_first(entry, "activities", "activities_and_societies", "activitiesAndSocieties")),
                "skill_ids": _normalize_skill_ids(entry),
            }
        )
    return normalized


def _normalize_skills(entries: Any) -> list[str]:
    if not isinstance(entries, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        skill = _safe_str(entry)
        if skill:
            canonical = SKILL_CANONICAL_MAP.get(skill.lower(), skill)
            canonical = _clamp_skill_name(canonical)
            if not canonical:
                continue
            key = canonical.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(canonical)
    return normalized


def _normalize_skill_ids(entry: dict) -> list[str]:
    raw = _first(entry, "skill_ids", "skillIds", "skills")
    if raw is None:
        return []
    if isinstance(raw, str):
        tokens = [piece.strip() for piece in raw.split(",")]
    elif isinstance(raw, list):
        tokens = [str(piece).strip() for piece in raw if piece is not None]
    else:
        return []
    return _normalize_skills(tokens)


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
        "skill_ids": entry.get("skill_ids") or [],
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
        "skill_ids": entry.get("skill_ids") or [],
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


async def apply_connection_delta(member_id: int, delta: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE members
                SET connections_count = GREATEST(connections_count + %s, 0)
                WHERE member_id = %s AND is_deleted = 0
                """,
                (delta, member_id),
            )


async def user_exists(user_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            return await cur.fetchone() is not None


def _experience_insert_tuple(member_id: int, sort_order: int, entry: dict) -> tuple:
    """Clamp again at INSERT so stale consumers or odd JSON never exceeds VARCHAR caps."""
    title = _clamp_varchar(entry.get("title"), _EXP_TITLE_MAX) or "Untitled role"
    company = _clamp_varchar(entry.get("company"), _EXP_COMPANY_MAX) or "Unknown organization"
    return (
        member_id,
        sort_order,
        title,
        _clamp_varchar(entry.get("employment_type"), _EXP_EMPLOYMENT_MAX),
        company,
        1 if entry.get("is_current") else 0,
        _clamp_varchar(entry.get("start_month"), _EXP_MONTH_MAX),
        entry.get("start_year"),
        _clamp_varchar(entry.get("end_month"), _EXP_MONTH_MAX),
        entry.get("end_year"),
        _clamp_varchar(entry.get("location"), _EXP_LOCATION_MAX),
        _clamp_varchar(entry.get("location_type"), _EXP_LOCATION_TYPE_MAX),
        entry.get("description"),
    )


def _education_insert_tuple(member_id: int, sort_order: int, entry: dict) -> tuple:
    school = _clamp_varchar(entry.get("school"), _EDU_SCHOOL_MAX) or "School"
    return (
        member_id,
        sort_order,
        school,
        _clamp_varchar(entry.get("degree"), _EDU_DEGREE_MAX),
        _clamp_varchar(entry.get("field_of_study"), _EDU_FIELD_MAX),
        _clamp_varchar(entry.get("start_month"), _EDU_MONTH_MAX),
        entry.get("start_year"),
        _clamp_varchar(entry.get("end_month"), _EDU_MONTH_MAX),
        entry.get("end_year"),
        _clamp_varchar(entry.get("grade"), _EDU_GRADE_MAX),
        entry.get("activities"),
    )


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
        [_experience_insert_tuple(member_id, index, entry) for index, entry in enumerate(experience_entries)],
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
        [_education_insert_tuple(member_id, index, entry) for index, entry in enumerate(education_entries)],
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


async def _replace_member_skill_mappings(
    cur,
    member_id: int,
    experience_entries: list[dict],
    education_entries: list[dict],
) -> None:
    await cur.execute("DELETE FROM member_skill_mappings WHERE member_id = %s", (member_id,))
    values: list[tuple[int, str, str, int]] = []
    for index, entry in enumerate(experience_entries):
        for skill in entry.get("skill_ids") or []:
            sn = _clamp_skill_name(skill)
            if sn:
                values.append((member_id, sn, "experience", index))
    for index, entry in enumerate(education_entries):
        for skill in entry.get("skill_ids") or []:
            sn = _clamp_skill_name(skill)
            if sn:
                values.append((member_id, sn, "education", index))
    if not values:
        return
    await cur.executemany(
        """
        INSERT INTO member_skill_mappings (member_id, skill_name, source_type, source_order)
        VALUES (%s, %s, %s, %s)
        """,
        values,
    )


async def create_member(member_id: int, fields: dict) -> None:
    await ensure_member_profile_tables()
    experience_entries = _normalize_experience(fields.get("experience"))
    education_entries = _normalize_education(fields.get("education"))
    mapped_skills = [
        skill
        for entry in [*experience_entries, *education_entries]
        for skill in (entry.get("skill_ids") or [])
    ]
    skills = _normalize_skills([*(fields.get("skills") or []), *mapped_skills])

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO members
                   (member_id, first_name, last_name, phone, location_city, location_state,
                    location_country, headline, summary, birthday, website, experience, education, skills, profile_photo_url, open_to, profile_status, profile_language, profile_slug)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
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
                    fields.get("birthday"),
                    fields.get("website"),
                    _serialize_json(experience_entries),
                    _serialize_json(education_entries),
                    _serialize_json(skills),
                    fields.get("profile_photo_url"),
                    fields.get("open_to"),
                    (
                        fields.get("profile_status")
                        if fields.get("profile_status") in PROFILE_STATUS_VALUES
                        else "hiring"
                        if fields.get("open_to") == "hiring"
                        else "open_to_work"
                        if fields.get("open_to") == "job"
                        else "none"
                    ),
                    fields.get("profile_language") or "English",
                    normalize_profile_slug(
                        fields.get("profile_slug")
                        or build_profile_slug(fields.get("first_name"), fields.get("last_name"), member_id),
                        member_id,
                    ),
                ),
            )
            await _replace_member_experience(cur, member_id, experience_entries)
            await _replace_member_education(cur, member_id, education_entries)
            await _replace_member_skills(cur, member_id, skills)
            await _replace_member_skill_mappings(cur, member_id, experience_entries, education_entries)


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


async def _get_member_skill_mappings(cur, member_id: int) -> list[dict]:
    await cur.execute(
        """
        SELECT skill_name, source_type, source_order
        FROM member_skill_mappings
        WHERE member_id = %s
        ORDER BY mapping_id ASC
        """,
        (member_id,),
    )
    return await cur.fetchall()


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

            legacy_experience = _legacy_json_field(row.get("experience"))
            legacy_education = _legacy_json_field(row.get("education"))
            legacy_skills = _legacy_json_field(row.get("skills"))
            legacy_experience_entries = [_experience_response_entry(entry) for entry in _normalize_experience(legacy_experience)]
            legacy_education_entries = [_education_response_entry(entry) for entry in _normalize_education(legacy_education)]
            legacy_skill_entries = _normalize_skills(legacy_skills)

            experience_entries = await _get_member_experience(cur, member_id)
            education_entries = await _get_member_education(cur, member_id)
            skill_entries = await _get_member_skills(cur, member_id)
            mapping_rows = await _get_member_skill_mappings(cur, member_id)

            row["experience"] = experience_entries or legacy_experience_entries
            row["education"] = education_entries or legacy_education_entries
            row["skills"] = skill_entries or legacy_skill_entries
            effective_experience = row["experience"] or []
            effective_education = row["education"] or []
            skill_map: dict[tuple[str, int], list[str]] = {}
            for mapping in mapping_rows:
                source_type = mapping.get("source_type")
                source_order = int(mapping.get("source_order") or 0)
                key = (source_type, source_order)
                skill_map.setdefault(key, []).append(mapping.get("skill_name"))
            for index, entry in enumerate(effective_experience):
                entry["skill_ids"] = skill_map.get(("experience", index), entry.get("skill_ids") or [])
            for index, entry in enumerate(effective_education):
                entry["skill_ids"] = skill_map.get(("education", index), entry.get("skill_ids") or [])

            skill_sources: dict[str, list[str]] = {}
            for index, entry in enumerate(effective_experience):
                label = entry.get("company") or "Experience"
                for skill in entry.get("skill_ids") or []:
                    skill_sources.setdefault(skill, [])
                    if label not in skill_sources[skill]:
                        skill_sources[skill].append(label)
            for index, entry in enumerate(effective_education):
                label = entry.get("school") or "Education"
                for skill in entry.get("skill_ids") or []:
                    skill_sources.setdefault(skill, [])
                    if label not in skill_sources[skill]:
                        skill_sources[skill].append(label)
            row["skill_mappings"] = skill_sources

            if not row.get("profile_slug"):
                slug = build_profile_slug(row.get("first_name"), row.get("last_name"), member_id)
                await cur.execute(
                    "UPDATE members SET profile_slug = %s WHERE member_id = %s AND (profile_slug IS NULL OR profile_slug = '') AND is_deleted = 0",
                    (slug, member_id),
                )
                row["profile_slug"] = slug
            if not row.get("profile_language"):
                row["profile_language"] = "English"
            if row.get("profile_status") not in PROFILE_STATUS_VALUES:
                # Backfill from legacy open_to when possible.
                if row.get("open_to") == "hiring":
                    row["profile_status"] = "hiring"
                elif row.get("open_to") == "job":
                    row["profile_status"] = "open_to_work"
                else:
                    row["profile_status"] = "none"
            return row


async def update_member(member_id: int, fields: dict) -> None:
    await ensure_member_profile_tables()
    experience_entries = _normalize_experience(fields.get("experience")) if "experience" in fields else None
    education_entries = _normalize_education(fields.get("education")) if "education" in fields else None
    skills = _normalize_skills(fields.get("skills")) if "skills" in fields else None
    if experience_entries is not None or education_entries is not None:
        exp_for_map = experience_entries or []
        edu_for_map = education_entries or []
        mapped_skills = [skill for entry in [*exp_for_map, *edu_for_map] for skill in (entry.get("skill_ids") or [])]
        if skills is None:
            skills = _normalize_skills(mapped_skills)
            fields = {**fields, "skills": skills}
        else:
            skills = _normalize_skills([*skills, *mapped_skills])
            fields = {**fields, "skills": skills}

    if "open_to" in fields:
        value = fields["open_to"]
        if value not in (None, "") and value not in OPEN_TO_VALUES:
            fields = {**fields, "open_to": None}
    if "profile_status" in fields:
        value = fields["profile_status"]
        if value not in PROFILE_STATUS_VALUES:
            fields = {**fields, "profile_status": "none"}
    if "profile_slug" in fields and fields.get("profile_slug") is not None:
        fields = {**fields, "profile_slug": normalize_profile_slug(fields.get("profile_slug"), member_id)}

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
        "birthday",
        "website",
        "experience",
        "education",
        "skills",
        "profile_photo_url",
        "open_to",
        "profile_status",
        "profile_language",
        "profile_slug",
    }
    nullable_clearable = {
        "open_to",
        "phone",
        "location_city",
        "location_state",
        "location_country",
        "birthday",
        "website",
    }
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
            if experience_entries is not None or education_entries is not None:
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
                exp_rows = [_experience_response_entry(row) for row in await cur.fetchall()]
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
                edu_rows = [_education_response_entry(row) for row in await cur.fetchall()]
                existing_mappings = await _get_member_skill_mappings(cur, member_id)
                existing_skill_map: dict[tuple[str, int], list[str]] = {}
                for mapping in existing_mappings:
                    key = (mapping.get("source_type"), int(mapping.get("source_order") or 0))
                    existing_skill_map.setdefault(key, []).append(mapping.get("skill_name"))
                for idx, entry in enumerate(exp_rows):
                    entry["skill_ids"] = existing_skill_map.get(("experience", idx), [])
                for idx, entry in enumerate(edu_rows):
                    entry["skill_ids"] = existing_skill_map.get(("education", idx), [])
                if experience_entries is not None:
                    for idx, entry in enumerate(exp_rows):
                        entry["skill_ids"] = (experience_entries[idx].get("skill_ids") if idx < len(experience_entries) else []) or []
                if education_entries is not None:
                    for idx, entry in enumerate(edu_rows):
                        entry["skill_ids"] = (education_entries[idx].get("skill_ids") if idx < len(education_entries) else []) or []
                await _replace_member_skill_mappings(cur, member_id, exp_rows, edu_rows)


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
    resume_text: str = "",
) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET resume_file_id = %s, resume_file_name = %s,
                       resume_content_type = %s, resume_uploaded_at = CURRENT_TIMESTAMP,
                       resume_text = %s
                   WHERE member_id = %s AND is_deleted = 0""",
                (file_id, file_name, content_type, resume_text or None, member_id),
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


async def recruiter_may_access_member_resume(recruiter_user_id: int, member_id: int) -> bool:
    """True if this recruiter (user id) owns a job this member has applied to — may stream résumé file."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT 1 AS ok
                FROM applications a
                INNER JOIN jobs j ON j.job_id = a.job_id
                WHERE a.member_id = %s AND j.recruiter_id = %s
                LIMIT 1
                """,
                (member_id, recruiter_user_id),
            )
            row = await cur.fetchone()
            return bool(row)


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


async def get_member_cover_file_id(member_id: int) -> str | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT cover_photo_file_id FROM members WHERE member_id = %s AND is_deleted = 0",
                (member_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            fid = (row or {}).get("cover_photo_file_id")
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


async def set_cover_file(member_id: int, file_id: str, url: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET cover_photo_file_id = %s, cover_photo_url = %s
                   WHERE member_id = %s AND is_deleted = 0""",
                (file_id, url, member_id),
            )


async def clear_cover_file(member_id: int) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """UPDATE members
                   SET cover_photo_file_id = NULL, cover_photo_url = NULL
                   WHERE member_id = %s AND is_deleted = 0""",
                (member_id,),
            )


async def search_members(
    keyword, skill, location, page, page_size=PAGE_SIZE, *, exclude_member_id=None
) -> tuple[list, int]:
    conditions = ["m.is_deleted = 0"]
    values = []

    if exclude_member_id is not None:
        conditions.append("m.member_id <> %s")
        values.append(exclude_member_id)

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
                           m.skills, m.connections_count, m.profile_photo_url
                    FROM members m {where}
                    ORDER BY m.member_id DESC LIMIT %s OFFSET %s""",
                [*values, page_size, offset],
            )
            rows = await cur.fetchall()
            for row in rows:
                if isinstance(row.get("skills"), str):
                    parsed = _legacy_json_field(row.get("skills"))
                    row["skills"] = parsed if parsed is not None else []
            await cur.execute(f"SELECT COUNT(*) as total FROM members m {where}", values)
            total = (await cur.fetchone())["total"]
    return rows, total
