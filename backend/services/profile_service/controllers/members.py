from fastapi import HTTPException
from models.member_mysql import (
    member_exists, create_member, get_member_by_id, update_member,
    soft_delete_member, update_resume_url, search_members, PAGE_SIZE,
)
from models.profile_mongo import create_profile, get_profile, update_profile, delete_profile
from producers.profile_producer import emit_profile_updated
from shared.redis_utils.cache import cache_get, cache_set, cache_del

PROFILE_TTL = 300
SEARCH_TTL  = 120


def _profile_key(member_id): return f"profile:{member_id}"
def _search_key(params):     return f"profile:search:{params}"


async def create(body: dict) -> dict:
    if await member_exists(body["member_id"]):
        raise HTTPException(409, "Member profile already exists")
    await create_member(body["member_id"], body)
    await create_profile(body["member_id"], body)
    return {"member_id": body["member_id"]}


async def get(member_id: int) -> dict:
    cached = await cache_get(_profile_key(member_id))
    if cached and cached.get("email"):
        return cached
    if cached and not cached.get("email"):
        await cache_del(_profile_key(member_id))
    mysql_data = await get_member_by_id(member_id)
    if not mysql_data:
        raise HTTPException(404, "Member not found")
    mongo_data = await get_profile(member_id)
    profile = {**mysql_data, "unstructured": mongo_data or {}}
    await cache_set(_profile_key(member_id), profile, PROFILE_TTL)
    return profile


async def update(body: dict, actor_id) -> dict:
    member_id = body["member_id"]
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")

    mysql_fields = {k: v for k, v in body.items()
                    if k not in ("member_id", "about", "freeform_experience") and v is not None}
    if mysql_fields:
        await update_member(member_id, mysql_fields)

    mongo_update = {k: body[k] for k in ("about", "freeform_experience") if body.get(k) is not None}
    if mongo_update:
        await update_profile(member_id, mongo_update)

    await cache_del(_profile_key(member_id))
    await emit_profile_updated(actor_id, member_id, list(body.keys()))
    return {"member_id": member_id, "updated": True}


async def delete(member_id: int) -> dict:
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")
    await soft_delete_member(member_id)
    await cache_del(_profile_key(member_id))
    return {"member_id": member_id, "deleted": True}


async def search(keyword, skill, location, page) -> dict:
    key = _search_key(f"{keyword}-{skill}-{location}-{page}")
    cached = await cache_get(key)
    if cached:
        return cached
    rows, total = await search_members(keyword, skill, location, page)
    result = {"members": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
    await cache_set(key, result, SEARCH_TTL)
    return result


async def upload_resume(member_id: int, resume_url: str) -> dict:
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")
    await update_resume_url(member_id, resume_url)
    await cache_del(_profile_key(member_id))
    return {"member_id": member_id, "resume_url": resume_url}


async def get_resume(member_id: int) -> dict:
    member = await get_member_by_id(member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    if not member.get("resume_url"):
        raise HTTPException(404, "No resume uploaded")
    return {"member_id": member_id, "resume_url": member["resume_url"]}
