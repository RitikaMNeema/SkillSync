import uuid
from datetime import datetime
from shared.database.mongo import get_db

PAGE_SIZE = 20


async def create_message(thread_id: str, sender_id, text: str) -> dict:
    db = get_db()
    doc = {
        "message_id": str(uuid.uuid4()),
        "thread_id":  thread_id,
        "sender_id":  str(sender_id),
        "text":       text,
        "timestamp":  datetime.utcnow(),
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
    total    = await db.messages.count_documents({"thread_id": thread_id})
    return messages, total


async def mark_read(thread_id: str, user_id) -> int:
    db = get_db()
    result = await db.messages.update_many(
        {"thread_id": thread_id, "read_by": {"$ne": str(user_id)}},
        {"$addToSet": {"read_by": str(user_id)}},
    )
    return result.modified_count
