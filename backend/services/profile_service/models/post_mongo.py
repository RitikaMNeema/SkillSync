from datetime import datetime, timezone
from uuid import uuid4

from shared.database.mongo import get_db

PAGE_SIZE = 10


def _posts():
    return get_db().posts


async def create_post(member_id: int, author: dict, content: str, post_type: str, media_url: str | None = None) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "post_id": uuid4().hex,
        "member_id": member_id,
        "post_type": post_type,
        "content": content,
        "media_url": media_url,
        "author": {
            "first_name": author.get("first_name"),
            "last_name": author.get("last_name"),
            "headline": author.get("headline"),
            "profile_photo_url": author.get("profile_photo_url"),
        },
        "created_at": now,
    }
    await _posts().insert_one(doc)
    doc["created_at"] = now.isoformat()
    return doc


async def list_feed_posts(page: int) -> dict:
    skip = (page - 1) * PAGE_SIZE
    cursor = _posts().find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(PAGE_SIZE)
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents({})
    for row in rows:
        created_at = row.get("created_at")
        if isinstance(created_at, datetime):
            row["created_at"] = created_at.isoformat()
    return {"posts": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def list_member_posts(member_id: int, page: int) -> dict:
    skip = (page - 1) * PAGE_SIZE
    cursor = _posts().find({"member_id": member_id}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(PAGE_SIZE)
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents({"member_id": member_id})
    for row in rows:
        created_at = row.get("created_at")
        if isinstance(created_at, datetime):
            row["created_at"] = created_at.isoformat()
    return {"posts": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
