import asyncio
import logging

from fastapi import HTTPException
from models.member_mysql import (
    member_exists,
    user_exists,
    create_member,
    get_member_by_id,
    update_member,
    soft_delete_member,
    update_resume_url,
    search_members,
    PAGE_SIZE,
    get_member_resume_meta,
    set_resume_file,
    clear_resume_file,
    get_member_photo_file_id,
    set_photo_file,
    get_member_cover_file_id,
    set_cover_file,
    clear_cover_file,
)
from models.profile_mongo import create_profile, get_profile, update_profile
from models import files_mongo
from producers.profile_producer import emit_member_search_appeared, emit_profile_updated, emit_profile_viewed
from shared.redis_utils.cache import cache_get, cache_set, cache_del

PROFILE_TTL = 300
SEARCH_TTL = 120
log = logging.getLogger(__name__)


def _profile_key(member_id):
    return f"profile:{member_id}"


def _search_key(params):
    return f"profile:search:{params}"


async def _emit_profile_view_event(actor_id: int | None, member_id: int) -> None:
    if actor_id is None or str(actor_id) == str(member_id):
        return
    try:
        await emit_profile_viewed(actor_id, member_id)
    except Exception:
        log.exception("emit_profile_viewed failed for member_id=%s actor_id=%s", member_id, actor_id)


async def _emit_search_appearance_events(actor_id: int | None, rows: list, keyword, skill, location) -> None:
    if actor_id is None or not rows:
        return
    tasks = [
        emit_member_search_appeared(
            actor_id,
            row.get("member_id"),
            keyword=keyword,
            skill=skill,
            location=location,
        )
        for row in rows
        if row.get("member_id") is not None and str(row.get("member_id")) != str(actor_id)
    ]
    if tasks:
        outcomes = await asyncio.gather(*tasks, return_exceptions=True)
        for outcome in outcomes:
            if isinstance(outcome, Exception):
                log.exception("emit_member_search_appeared failed", exc_info=outcome)


async def create(body: dict, actor_id: int) -> dict:
    member_id = body["member_id"]
    if member_id != actor_id:
        raise HTTPException(403, "Cannot create profile for another member")
    if not await user_exists(member_id):
        raise HTTPException(404, "User account not found for this member_id")
    if await member_exists(member_id):
        raise HTTPException(409, "Member profile already exists")
    await create_member(member_id, body)
    await create_profile(member_id, body)
    return {"member_id": member_id}


async def get(member_id: int, actor_id: int | None = None) -> dict:
    cached = await cache_get(_profile_key(member_id))
    # Drop pre-migration cached entries that don't have the new columns yet so
    # the sidebar URL / open-to / language flow through on the first read.
    if cached and "profile_slug" in cached and "open_to" in cached and "profile_status" in cached:
        await _emit_profile_view_event(actor_id, member_id)
        return cached
    if cached:
        await cache_del(_profile_key(member_id))
    mysql_data = await get_member_by_id(member_id)
    if not mysql_data:
        raise HTTPException(404, "Member not found")
    mongo_data = await get_profile(member_id)
    profile = {**mysql_data, "unstructured": mongo_data or {}}
    await cache_set(_profile_key(member_id), profile, PROFILE_TTL)
    await _emit_profile_view_event(actor_id, member_id)
    return profile


async def update(body: dict, actor_id) -> dict:
    member_id = body["member_id"]
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")

    fields_set: set = body.pop("__pydantic_fields_set__", set())
    if not isinstance(fields_set, set):
        fields_set = set(fields_set) if fields_set is not None else set()

    # Keep `open_to` explicit even when null so clearing works.
    always_pass_through = {"open_to", "profile_status"}
    mysql_fields = {
        k: v
        for k, v in body.items()
        if k
        not in (
            "member_id",
            "about",
            "freeform_experience",
            "followed_skills",
        )
        and (v is not None or k in always_pass_through)
    }
    if mysql_fields:
        await update_member(member_id, mysql_fields)

    mongo_update = {k: body[k] for k in ("about", "freeform_experience", "languages") if body.get(k) is not None}
    if "followed_skills" in fields_set:
        fs = body.get("followed_skills")
        mongo_update["followed_skills"] = [] if fs is None else fs
    if mongo_update:
        await update_profile(member_id, mongo_update)

    await cache_del(_profile_key(member_id))
    try:
        await emit_profile_updated(actor_id, member_id, list(body.keys()))
    except Exception:
        # Profile persistence should not fail just because analytics/eventing is down.
        log.exception("emit_profile_updated failed for member_id=%s actor_id=%s", member_id, actor_id)
    return {"member_id": member_id, "updated": True}


async def delete(member_id: int) -> dict:
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")
    await soft_delete_member(member_id)
    await cache_del(_profile_key(member_id))
    return {"member_id": member_id, "deleted": True}


async def search(keyword, skill, location, page, actor_id: int | None = None) -> dict:
    key = _search_key(f"{keyword}-{skill}-{location}-{page}")
    cached = await cache_get(key)
    if cached:
        await _emit_search_appearance_events(actor_id, cached.get("members") or [], keyword, skill, location)
        return cached
    rows, total = await search_members(keyword, skill, location, page)
    result = {"members": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
    await cache_set(key, result, SEARCH_TTL)
    await _emit_search_appearance_events(actor_id, rows, keyword, skill, location)
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


# ── File-upload (GridFS) controllers ───────────────────────────────────────────
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_RESUME_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_RESUME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


async def upload_photo_file(
    member_id: int,
    actor_id: int,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict:
    if member_id != actor_id:
        raise HTTPException(403, "Cannot upload photo for another member")
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WEBP images are allowed")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image exceeds 5MB limit")
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")

    existing = await get_member_photo_file_id(member_id)
    new_file_id = await files_mongo.upload_photo(member_id, filename, content_type, data)
    # URL the frontend can use directly; cache-buster ensures immediate refresh.
    url = f"/api/members/photo/{member_id}?v={new_file_id}"
    await set_photo_file(member_id, new_file_id, url)
    if existing and existing != new_file_id:
        await files_mongo.delete_photo(existing)
    await cache_del(_profile_key(member_id))
    return {
        "member_id": member_id,
        "profile_photo_url": url,
        "profile_photo_file_id": new_file_id,
    }


async def stream_photo_file(member_id: int):
    file_id = await get_member_photo_file_id(member_id)
    if not file_id:
        raise HTTPException(404, "No profile photo")
    try:
        return await files_mongo.stream_photo(file_id)
    except FileNotFoundError:
        raise HTTPException(404, "Profile photo missing in storage")


async def upload_cover_file(
    member_id: int,
    actor_id: int,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict:
    if member_id != actor_id:
        raise HTTPException(403, "Cannot upload cover for another member")
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WEBP images are allowed")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image exceeds 5MB limit")
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")

    existing = await get_member_cover_file_id(member_id)
    new_file_id = await files_mongo.upload_photo(member_id, filename, content_type, data)
    url = f"/api/members/cover/{member_id}?v={new_file_id}"
    await set_cover_file(member_id, new_file_id, url)
    if existing and existing != new_file_id:
        await files_mongo.delete_photo(existing)
    await cache_del(_profile_key(member_id))
    return {
        "member_id": member_id,
        "cover_photo_url": url,
        "cover_photo_file_id": new_file_id,
    }


async def stream_cover_file(member_id: int):
    file_id = await get_member_cover_file_id(member_id)
    if not file_id:
        raise HTTPException(404, "No cover photo")
    try:
        return await files_mongo.stream_photo(file_id)
    except FileNotFoundError:
        raise HTTPException(404, "Cover photo missing in storage")


async def delete_cover_file(member_id: int, actor_id: int) -> dict:
    if member_id != actor_id:
        raise HTTPException(403, "Forbidden")
    file_id = await get_member_cover_file_id(member_id)
    if file_id:
        await files_mongo.delete_photo(file_id)
    await clear_cover_file(member_id)
    await cache_del(_profile_key(member_id))
    return {"member_id": member_id, "deleted": True}


async def upload_resume_file(
    member_id: int,
    actor_id: int,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict:
    if member_id != actor_id:
        raise HTTPException(403, "Cannot upload resume for another member")
    if content_type not in ALLOWED_RESUME_TYPES:
        raise HTTPException(400, "Only PDF or DOCX files are allowed")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(413, "Resume exceeds 5MB limit")
    if not await get_member_by_id(member_id):
        raise HTTPException(404, "Member not found")

    existing = await get_member_resume_meta(member_id)
    new_file_id = await files_mongo.upload_resume(member_id, filename, content_type, data)
    await set_resume_file(member_id, new_file_id, filename, content_type)
    if existing and existing.get("resume_file_id") and existing["resume_file_id"] != new_file_id:
        await files_mongo.delete_resume(existing["resume_file_id"])
    await cache_del(_profile_key(member_id))
    meta = await get_member_resume_meta(member_id)
    return {
        "member_id": member_id,
        "resume_file_id": new_file_id,
        "resume_file_name": filename,
        "resume_content_type": content_type,
        "resume_uploaded_at": (meta or {}).get("resume_uploaded_at"),
    }


async def stream_resume_file(member_id: int, actor_id: int):
    # Only the owner can download their own resume here.
    if member_id != actor_id:
        raise HTTPException(403, "Forbidden")
    meta = await get_member_resume_meta(member_id)
    if not meta or not meta.get("resume_file_id"):
        raise HTTPException(404, "No resume uploaded")
    try:
        stream, info = await files_mongo.stream_resume(meta["resume_file_id"])
    except FileNotFoundError:
        raise HTTPException(404, "Resume missing in storage")
    return stream, info, meta


async def get_resume_meta(member_id: int) -> dict | None:
    return await get_member_resume_meta(member_id)


async def delete_resume_file(member_id: int, actor_id: int) -> dict:
    if member_id != actor_id:
        raise HTTPException(403, "Forbidden")
    meta = await get_member_resume_meta(member_id)
    if meta and meta.get("resume_file_id"):
        await files_mongo.delete_resume(meta["resume_file_id"])
    await clear_resume_file(member_id)
    await cache_del(_profile_key(member_id))
    return {"member_id": member_id, "deleted": True}
