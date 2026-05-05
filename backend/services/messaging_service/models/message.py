import re
import uuid
from datetime import datetime, timezone

from shared.database.mongo import get_db

PAGE_SIZE = 20

_TS_HAS_OFFSET = re.compile(r"(?:Z|[+-]\d{2}:\d{2})$")


def timestamp_to_rfc3339_z(value) -> str:
    """Serialize message timestamps as RFC 3339 UTC with Z for JSON clients."""
    if value is None:
        return ""
    if isinstance(value, str):
        v = value.strip()
        if not v:
            return v
        if _TS_HAS_OFFSET.search(v):
            return v
        return f"{v}Z"
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.isoformat() + "Z"
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def serialize_message(doc: dict) -> dict:
    out = dict(doc)
    if "timestamp" in out:
        out["timestamp"] = timestamp_to_rfc3339_z(out["timestamp"])
    return out


async def create_message(thread_id: str, sender_id, text: str) -> dict:
    db = get_db()
    doc = {
        "message_id": str(uuid.uuid4()),
        "thread_id":  thread_id,
        "sender_id":  str(sender_id),
        "text":       text,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
        "read_by":    [str(sender_id)],
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def list_messages(thread_id: str, page: int) -> tuple[list, int]:
    db = get_db()
    offset = (page - 1) * PAGE_SIZE
    cursor = db.messages.find(
        {"thread_id": thread_id}, {"_id": 0}
    ).sort("timestamp", 1).skip(offset).limit(PAGE_SIZE)
    messages = await cursor.to_list(length=PAGE_SIZE)
    messages = [serialize_message(m) for m in messages]
    total    = await db.messages.count_documents({"thread_id": thread_id})
    return messages, total


async def mark_read(thread_id: str, user_id) -> int:
    db = get_db()
    result = await db.messages.update_many(
        {"thread_id": thread_id, "read_by": {"$ne": str(user_id)}},
        {"$addToSet": {"read_by": str(user_id)}},
    )
    return result.modified_count


async def count_unread_messages_for_user(user_id) -> int:
    """Messages this user has not yet read — same predicate as `mark_read` (`read_by` / `$ne`)."""
    db = get_db()
    uid = str(user_id)
    thread_ids = await db.threads.distinct("thread_id", {"participant_ids": uid})
    if not thread_ids:
        return 0
    # Match `mark_read`: count rows `update_many` would touch (per-thread filter is thread_id + read_by $ne).
    return await db.messages.count_documents({"thread_id": {"$in": thread_ids}, "read_by": {"$ne": uid}})
