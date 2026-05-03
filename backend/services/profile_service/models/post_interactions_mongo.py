from datetime import datetime, timezone
from uuid import uuid4

from pymongo.errors import DuplicateKeyError

from shared.database.mongo import get_db
from models.author_hydration import hydrate_author_for_user_id

COMMENTS_PAGE_SIZE = 20


def _likes():
    return get_db().post_likes


def _comments():
    return get_db().post_comments


# ---------- Likes ----------

async def toggle_like(post_id: str, member_id: int) -> dict:
    """Idempotent toggle. Uses unique index for race safety."""
    try:
        await _likes().insert_one({
            "post_id": post_id,
            "member_id": member_id,
            "created_at": datetime.now(timezone.utc),
        })
        liked = True
    except DuplicateKeyError:
        await _likes().delete_one({"post_id": post_id, "member_id": member_id})
        liked = False

    count = await _likes().count_documents({"post_id": post_id})
    return {"post_id": post_id, "liked": liked, "like_count": count}


# ---------- Comments ----------

async def create_comment(post_id: str, member_id: int, content: str) -> dict:
    author = await hydrate_author_for_user_id(int(member_id))
    now = datetime.now(timezone.utc)
    doc = {
        "comment_id": uuid4().hex,
        "post_id": post_id,
        "member_id": member_id,
        "content": content,
        "author": {
            "first_name": (author or {}).get("first_name"),
            "last_name": (author or {}).get("last_name"),
            "profile_photo_url": (author or {}).get("profile_photo_url"),
        } if author else None,
        "created_at": now,
    }
    await _comments().insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = now.isoformat()
    return doc


async def list_comments(post_id: str, page: int = 1) -> dict:
    skip = (page - 1) * COMMENTS_PAGE_SIZE
    cursor = (
        _comments()
        .find({"post_id": post_id}, {"_id": 0})
        .sort("created_at", 1)
        .skip(skip)
        .limit(COMMENTS_PAGE_SIZE)
    )
    rows = await cursor.to_list(length=COMMENTS_PAGE_SIZE)
    total = await _comments().count_documents({"post_id": post_id})

    # Re-hydrate author info (current name/photo)
    for r in rows:
        author = await hydrate_author_for_user_id(int(r["member_id"]))
        if author:
            r["author"] = {
                "first_name": author.get("first_name"),
                "last_name": author.get("last_name"),
                "profile_photo_url": author.get("profile_photo_url"),
            }
        ca = r.get("created_at")
        if hasattr(ca, "isoformat"):
            r["created_at"] = ca.isoformat()

    return {
        "comments": rows,
        "total": total,
        "page": page,
        "page_size": COMMENTS_PAGE_SIZE,
    }