import uuid
from shared.database.mongo import get_db

PAGE_SIZE = 20


async def find_thread_by_participants(participant_ids: list) -> dict | None:
    db = get_db()
    sorted_ids = sorted(str(p) for p in participant_ids)
    return await db.threads.find_one(
        {"participant_ids": {"$all": sorted_ids, "$size": len(sorted_ids)}},
        {"_id": 0},
    )


async def create_thread(participant_ids: list) -> dict:
    db = get_db()
    sorted_ids = sorted(str(p) for p in participant_ids)
    doc = {
        "thread_id":       str(uuid.uuid4()),
        "participant_ids": sorted_ids,
        "created_at":      __import__("datetime").datetime.utcnow(),
        "last_message_at": __import__("datetime").datetime.utcnow(),
    }
    await db.threads.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def get_thread(thread_id: str) -> dict | None:
    db = get_db()
    return await db.threads.find_one({"thread_id": thread_id}, {"_id": 0})


async def threads_by_user(user_id, page: int) -> tuple[list, int]:
    db = get_db()
    offset = (page - 1) * PAGE_SIZE
    cursor = db.threads.find(
        {"participant_ids": str(user_id)}, {"_id": 0}
    ).sort("last_message_at", -1).skip(offset).limit(PAGE_SIZE)
    threads = await cursor.to_list(length=PAGE_SIZE)
    total   = await db.threads.count_documents({"participant_ids": str(user_id)})
    return threads, total


async def update_last_message_at(thread_id: str, ts) -> None:
    db = get_db()
    await db.threads.update_one({"thread_id": thread_id}, {"$set": {"last_message_at": ts}})
