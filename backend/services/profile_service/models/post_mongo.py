import logging
from datetime import datetime, timezone
from uuid import uuid4

from shared.database.mongo import get_db
from models.author_hydration import hydrate_author_for_user_id

PAGE_SIZE = 10
_log = logging.getLogger(__name__)


def _public_text(value) -> str | None:
    """JSON-safe author fields from MySQL (bytes / odd driver types)."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        text = value.decode("utf-8", errors="replace").strip()
    else:
        text = str(value).strip()
    return text or None


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
    await _posts().create_index("user_id")
    await _posts().create_index("post_id", unique=True)
    await _likes().create_index([("post_id", 1), ("member_id", 1)], unique=True)
    await _likes().create_index("post_id")
    await _comments().create_index([("post_id", 1), ("created_at", 1)])


def _author_user_id(row: dict) -> int | None:
    raw = row.get("user_id")
    if raw is not None:
        return int(raw)
    mid = row.get("member_id")
    return int(mid) if mid is not None else None


async def create_post(
    author_user_id: int,
    author: dict,
    content: str,
    post_type: str,
    media_url: str | None = None,
    *,
    is_member: bool,
) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "post_id": uuid4().hex,
        "user_id": author_user_id,
        "post_type": post_type,
        "content": content,
        "media_url": media_url,
        "author": {  # snapshot — kept for backward compat; feed re-hydrates
            "first_name": _public_text(author.get("first_name")),
            "last_name": _public_text(author.get("last_name")),
            "headline": _public_text(author.get("headline")),
            "profile_photo_url": _public_text(author.get("profile_photo_url")),
        },
        "created_at": now,
    }
    if is_member:
        doc["member_id"] = author_user_id
    await _posts().insert_one(doc)
    doc.pop("_id", None)  # insert_one mutates doc; ObjectId is not JSON-serializable
    doc["created_at"] = now.isoformat()
    # Match feed shape so clients can render immediately after create.
    doc["like_count"] = 0
    doc["comment_count"] = 0
    doc["viewer_has_liked"] = False
    return doc


async def _hydrate(rows: list[dict], viewer_id: int | None) -> list[dict]:
    """Attach live author info + like/comment counts + viewer_has_liked."""
    if not rows:
        return rows

    # 1. Live author info from MySQL (member or recruiter)
    for r in rows:
        aid = _author_user_id(r)
        if aid is None:
            continue
        snap = await hydrate_author_for_user_id(aid)
        if snap:
            r["author"] = snap

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
    """Posts from accepted MySQL `connections` rows + the viewer's own posts only."""
    skip = (page - 1) * PAGE_SIZE
    empty = {"posts": [], "total": 0, "page": page, "page_size": PAGE_SIZE}

    if viewer_id is None:
        return empty

    vid = int(viewer_id)

    # DictCursor rows are dicts — never use row[0]; that raised KeyError and dropped all edges.
    connected_ids: list[int] = []
    try:
        from shared.database.mysql import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT CASE
                        WHEN user_id_1 = %s THEN user_id_2
                        ELSE user_id_1
                    END AS connected_user_id
                    FROM connections
                    WHERE user_id_1 = %s OR user_id_2 = %s
                    """,
                    (vid, vid, vid),
                )
                rows = await cur.fetchall()
                for row in rows:
                    raw = row["connected_user_id"] if isinstance(row, dict) else row[0]
                    if raw is not None:
                        connected_ids.append(int(raw))
    except Exception as exc:
        _log.warning("Could not load connections for feed (viewer=%s): %s", vid, exc)

    connected_ids = list(dict.fromkeys(connected_ids))
    allowed_user_ids = list(dict.fromkeys([*connected_ids, vid]))
    legacy_posts = {"$and": [{"user_id": {"$exists": False}}, {"member_id": {"$in": allowed_user_ids}}]}
    filter_query = {"$or": [{"user_id": {"$in": allowed_user_ids}}, legacy_posts]}

    cursor = (
        _posts()
        .find(filter_query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(PAGE_SIZE)
    )
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents(filter_query)
    rows = await _hydrate(rows, vid)
    return {"posts": rows, "total": total, "page": page, "page_size": PAGE_SIZE}

async def list_member_posts(member_id: int, page: int, viewer_id: int | None = None) -> dict:
    skip = (page - 1) * PAGE_SIZE
    author_query = {"$or": [{"member_id": member_id}, {"user_id": member_id}]}
    cursor = (
        _posts()
        .find(author_query, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(PAGE_SIZE)
    )
    rows = await cursor.to_list(length=PAGE_SIZE)
    total = await _posts().count_documents(author_query)
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
    """Return the author's `users.id` (member or recruiter), or None if not found."""
    post = await _posts().find_one({"post_id": post_id}, {"_id": 0, "member_id": 1, "user_id": 1})
    if not post:
        return None
    uid = post.get("user_id")
    if uid is not None:
        return int(uid)
    mid = post.get("member_id")
    return int(mid) if mid is not None else None