import json
from shared.database.mysql import get_pool

PAGE_SIZE = 20


async def member_exists(member_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT member_id FROM members WHERE member_id = %s", (member_id,))
            return await cur.fetchone() is not None


async def create_member(member_id: int, fields: dict) -> None:
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
                    fields.get("first_name"), fields.get("last_name"),
                    fields.get("phone"),
                    fields.get("location_city"), fields.get("location_state"), fields.get("location_country"),
                    fields.get("headline"), fields.get("summary"),
                    json.dumps(fields["experience"]) if fields.get("experience") is not None else None,
                    json.dumps(fields["education"])  if fields.get("education")  is not None else None,
                    json.dumps(fields["skills"])     if fields.get("skills")     is not None else None,
                    fields.get("profile_photo_url"),
                ),
            )


async def get_member_by_id(member_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM members WHERE member_id = %s AND is_deleted = 0", (member_id,)
            )
            row = await cur.fetchone()
            if row:
                for f in ("experience", "education", "skills"):
                    if isinstance(row.get(f), str):
                        row[f] = json.loads(row[f])
            return row


async def update_member(member_id: int, fields: dict) -> None:
    json_fields = {"experience", "education", "skills"}
    allowed = {
        "first_name", "last_name", "phone", "location_city", "location_state",
        "location_country", "headline", "summary", "experience", "education",
        "skills", "profile_photo_url",
    }
    clauses, values = [], []
    for k, v in fields.items():
        if k in allowed and v is not None:
            clauses.append(f"{k} = %s")
            values.append(json.dumps(v) if k in json_fields else v)
    if not clauses:
        return
    values.append(member_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"UPDATE members SET {', '.join(clauses)} WHERE member_id = %s AND is_deleted = 0",
                values,
            )


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


async def search_members(keyword, skill, location, page, page_size=PAGE_SIZE) -> tuple[list, int]:
    conditions = ["m.is_deleted = 0"]
    values = []

    if keyword:
        conditions.append("(m.headline LIKE %s OR m.summary LIKE %s OR m.first_name LIKE %s OR m.last_name LIKE %s)")
        like = f"%{keyword}%"
        values += [like, like, like, like]
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
            await cur.execute(f"SELECT COUNT(*) as total FROM members m {where}", values)
            total = (await cur.fetchone())["total"]
    return rows, total
