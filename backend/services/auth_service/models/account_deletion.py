"""Purge MongoDB data tied to a user account."""

from __future__ import annotations

import logging

from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from shared.database.mongo import get_db

logger = logging.getLogger(__name__)


async def purge_mongodb_for_user(user_id: int, role: str) -> None:
    """Remove messaging data and (for members) profile/posts. Recruiter GridFS cleanup is best-effort."""
    db = get_db()
    uid_s = str(user_id)

    try:
        thread_filter = {
            "$or": [
                {"participant_ids": {"$in": [uid_s]}},
                {"participant_ids": uid_s},
            ]
        }
        thread_docs = await db.threads.find(thread_filter, {"thread_id": 1, "_id": 0}).to_list(length=5000)
        tids = [t["thread_id"] for t in thread_docs if t.get("thread_id")]
        if tids:
            await db.messages.delete_many({"thread_id": {"$in": tids}})
        await db.threads.delete_many(thread_filter)
        await db.thread_preferences.delete_many({"user_id": uid_s})
    except Exception:
        logger.exception("messaging mongo purge failed user_id=%s", user_id)
        raise

    r = str(role).lower()
    if r == "member":
        try:
            await db.profiles_unstructured.delete_many({"member_id": user_id})
            posts = await db.posts.find({"member_id": user_id}, {"post_id": 1, "_id": 0}).to_list(5000)
            pids = [p["post_id"] for p in posts if p.get("post_id")]
            if pids:
                await db.post_likes.delete_many({"post_id": {"$in": pids}})
                await db.post_comments.delete_many({"post_id": {"$in": pids}})
            await db.posts.delete_many({"member_id": user_id})
            await db.post_likes.delete_many({"member_id": user_id})
        except Exception:
            logger.exception("profile/posts mongo purge failed user_id=%s", user_id)
            raise

    if r == "recruiter":
        try:
            files_coll = db["recruiter_photos.files"]
            bucket = AsyncIOMotorGridFSBucket(db, bucket_name="recruiter_photos")
            async for doc in files_coll.find({"metadata.recruiter_id": user_id}, {"_id": 1}):
                oid = doc.get("_id")
                if oid is not None:
                    try:
                        await bucket.delete(oid)
                    except Exception:
                        pass
            await files_coll.delete_many({"metadata.recruiter_id": user_id})
        except Exception:
            logger.warning("recruiter gridfs purge failed user_id=%s (ignored)", user_id)
