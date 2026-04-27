from datetime import datetime
from shared.database.mongo import get_db


async def get_preferences_for_user(user_id: int) -> dict[str, dict]:
    db = get_db()
    rows = await db.thread_preferences.find({"user_id": str(user_id)}, {"_id": 0}).to_list(length=5000)
    return {row["thread_id"]: row for row in rows}


async def upsert_preferences(
    thread_id: str,
    user_id: int,
    *,
    starred: bool | None = None,
    muted: bool | None = None,
    archived: bool | None = None,
    force_unread: bool | None = None,
    hidden: bool | None = None,
) -> dict:
    db = get_db()
    updates: dict = {"updated_at": datetime.utcnow()}
    for key, value in (
        ("starred", starred),
        ("muted", muted),
        ("archived", archived),
        ("force_unread", force_unread),
        ("hidden", hidden),
    ):
        if value is not None:
            updates[key] = bool(value)

    await db.thread_preferences.update_one(
        {"thread_id": thread_id, "user_id": str(user_id)},
        {
            "$set": updates,
            "$setOnInsert": {
                "thread_id": thread_id,
                "user_id": str(user_id),
                "created_at": datetime.utcnow(),
            },
        },
        upsert=True,
    )
    return await db.thread_preferences.find_one(
        {"thread_id": thread_id, "user_id": str(user_id)},
        {"_id": 0},
    )
