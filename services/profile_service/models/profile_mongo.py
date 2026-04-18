from shared.database.mongo import get_db


async def create_profile(member_id: int, data: dict = None) -> None:
    db = get_db()
    await db.profiles_unstructured.insert_one({
        "member_id":           member_id,
        "about":               (data or {}).get("about", ""),
        "freeform_experience": (data or {}).get("freeform_experience", {}),
    })


async def get_profile(member_id: int) -> dict | None:
    db = get_db()
    doc = await db.profiles_unstructured.find_one({"member_id": member_id}, {"_id": 0})
    return doc


async def update_profile(member_id: int, data: dict) -> None:
    db = get_db()
    await db.profiles_unstructured.update_one(
        {"member_id": member_id},
        {"$set": data},
        upsert=True,
    )


async def delete_profile(member_id: int) -> None:
    db = get_db()
    await db.profiles_unstructured.delete_one({"member_id": member_id})
