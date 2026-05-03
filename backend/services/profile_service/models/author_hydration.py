from models.member_mysql import get_member_by_id
from models.recruiters_mysql import get_recruiter_row_for_author


def recruiter_row_to_author_snapshot(row: dict) -> dict:
    fn = (row.get("first_name") or "").strip()
    ln = (row.get("last_name") or "").strip()
    if not fn and not ln:
        raw = (row.get("name") or "").strip()
        parts = raw.split(maxsplit=1) if raw else []
        fn = parts[0] if parts else "Recruiter"
        ln = parts[1] if len(parts) > 1 else ""
    company = (row.get("company_name") or "").strip()
    headline = (row.get("headline") or "").strip()
    if not headline:
        headline = f"Recruiter at {company}" if company else "Recruiter"
    return {
        "first_name": fn,
        "last_name": ln,
        "headline": headline,
        "profile_photo_url": row.get("profile_photo_url"),
    }


async def hydrate_author_for_user_id(user_id: int) -> dict | None:
    """Return author card fields for a `users.id` (member or recruiter)."""
    m = await get_member_by_id(user_id)
    if m:
        return {
            "first_name": m.get("first_name"),
            "last_name": m.get("last_name"),
            "headline": m.get("headline"),
            "profile_photo_url": m.get("profile_photo_url"),
        }
    r = await get_recruiter_row_for_author(user_id)
    if r:
        return recruiter_row_to_author_snapshot(r)
    return None
