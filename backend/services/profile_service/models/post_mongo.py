from datetime import datetime, timezone
from uuid import uuid4

from shared.database.mongo import get_db
from models.member_mysql import get_member_by_id

PAGE_SIZE = 10


def _posts():
    return get_db().posts


def _likes():
    return get_db().post_likes


def _comments():
    return get_db().post_comments


async def ensure_post_indexes() -> None:
    """Idempotent index creation. Call from main.py lifespan."""
    await _posts().create_index([("created_at", -1)])
    await _posts().create_index("member_id")
    await _posts().create_index("post_id", unique=True)
    await _likes().create_index([("post_id", 1), ("member_id", 1)], unique=True)
    await _likes().create_index("post_id")
    await _comments().create_index([("post_id", 1), ("created_at", 1)])


async def create_post(
    member_id: int,
    author: dict,
    content: str,
    post_type: str,
    media_url: str | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "post_id": uuid4().hex,
        "member_id": member_id,
        "post_type": post_type,
        "content": content,
        "media_url": media_url,
        "author": {  # snapshot — kept for backward compat; feed re-hydrates
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


async def _hydrate(rows: list[dict], viewer_id: int | None) -> list[dict]:
    """Attach live author info + like/comment counts + viewer_has_liked."""
    if not rows:
        return rows

    # 1. Live author info from MySQL (fixes stale-snapshot bug)
    member_ids = list({r["member_id"] for r in rows})
    for r in rows:
        current = await get_member_by_id(r["member_id"])
        if current:
            r["author"] = {
                "first_name": current.get("first_name"),
                "last_name": current.get("last_name"),
                "headline": current.get("headline"),
                "profile_photo_url": current.get("profile_photo_url"),
            }

    # 2. Like & comment counts (batched)
    post_ids = [r["post_id"] for r in rows]
    like_counts = {
        d["_id"]: d["count"]
        async for d in _likes().aggregate([
            {"$match": {"post_id": {"$in": post_ids}}},
            {"$group": {"_id": "$post_id", "count": {"$sum": 1}}},
        ])
    }
    comment_counts = {
        d["_id"]: d["count"]
        async for d in _comments().aggregate([
            {"$match": {"post_id": {"$in": post_ids}}},
            {"$group": {"_id": "$post_id", "count": {"$sum": 1}}},
        ])
    }

    # 3. Viewer's like state (batched)
    viewer_liked: set[str] = set()
    if viewer_id is not None:
        async for d in _likes().find(
            {"post_id": {"$in": post_ids}, "member_id": viewer_id},
            {"_id": 0, "post_id": 1},
        ):
            viewer_liked.add(d["post_id"])

    for r in rows:
        pid = r["post_id"]
        r["like_count"] = like_counts.get(pid, 0)
        r["comment_count"] = comment_counts.get(pid, 0)
        r["viewer_has_liked"] = pid in viewer_liked
        ca = r.get("created_at")
        if isinstance(ca, datetime):
            r["created_at"] = ca.isoformat()

    return rows


async def list_feed_posts(page: int, viewer_id: int | None = None) -> dict:
    skip = (page - 1) * PAGE_SIZE
    cursor = (
        _posts()
        .find({}, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(PAGE_SIZE)
    )
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents({})
    rows = await _hydrate(rows, viewer_id)
    return {"posts": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def list_member_posts(member_id: int, page: int, viewer_id: int | None = None) -> dict:
    skip = (page - 1) * PAGE_SIZE
    cursor = (
        _posts()
        .find({"member_id": member_id}, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(PAGE_SIZE)
    )
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents({"member_id": member_id})
    rows = await _hydrate(rows, viewer_id)
    return {"posts": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def post_exists(post_id: str) -> bool:
    return await _posts().count_documents({"post_id": post_id}, limit=1) > 0

async def delete_post(post_id: str) -> dict:
    """
    Hard-delete a post + cascade to likes, comments, and its GridFS image.
    Returns counts of what was removed.
    """
    # Fetch the post first to get the image id (if any)
    post = await _posts().find_one({"post_id": post_id}, {"_id": 0, "media_url": 1})
    if not post:
        return {"deleted": False}

    # Cascade cleanup
    likes_result = await _likes().delete_many({"post_id": post_id})
    comments_result = await _comments().delete_many({"post_id": post_id})
    post_result = await _posts().delete_one({"post_id": post_id})

    # Delete image from GridFS if one was attached
    media_url = post.get("media_url")
    if media_url and isinstance(media_url, str) and media_url.startswith("/posts/image/"):
        try:
            from models.post_media_mongo import delete_image
            image_id = media_url.rsplit("/", 1)[-1]
            await delete_image(image_id)
        except Exception:
            pass  # non-fatal

    return {
        "deleted": post_result.deleted_count > 0,
        "likes_removed": likes_result.deleted_count,
        "comments_removed": comments_result.deleted_count,
    }


async def get_post_owner(post_id: str) -> int | None:
    """Return the member_id that owns this post, or None if not found."""
    post = await _posts().find_one({"post_id": post_id}, {"_id": 0, "member_id": 1})
    return post["member_id"] if post else None