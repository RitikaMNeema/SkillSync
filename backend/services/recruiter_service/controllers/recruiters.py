import asyncio
import logging
from fastapi import HTTPException
from pymysql.err import IntegrityError
from models import files_mongo

from models.recruiter import (
    find_company, create_company, update_company,
    recruiter_exists, create_recruiter, get_recruiter,
    update_recruiter, delete_recruiter, search_recruiters,
    recruiters_by_company, PAGE_SIZE,
    get_recruiter_photo_file_id, set_recruiter_photo_file,
    get_recruiter_cover_file_id, set_recruiter_cover_file, clear_recruiter_cover_file,
)
from models.command_status import get_command_status
from producers.recruiter_command_producer import enqueue_recruiter_command
from producers.recruiter_analytics_producer import emit_recruiter_profile_viewed, emit_recruiter_search_appeared
from shared.redis_utils.client import get_redis

log = logging.getLogger(__name__)
PROFILE_VIEW_DEDUP_TTL_SEC = 86400


async def _emit_recruiter_search_appearance_events(
    actor_id: int | None,
    rows: list,
    name: str | None,
    company: str | None,
    industry: str | None,
) -> None:
    if actor_id is None or not rows:
        return
    tasks = [
        emit_recruiter_search_appeared(
            actor_id,
            int(row["recruiter_id"]),
            name=name,
            company=company,
            industry=industry,
        )
        for row in rows
        if row.get("recruiter_id") is not None and str(row.get("recruiter_id")) != str(actor_id)
    ]
    if not tasks:
        return
    outcomes = await asyncio.gather(*tasks, return_exceptions=True)
    for outcome in outcomes:
        if isinstance(outcome, Exception):
            log.exception("emit_recruiter_search_appeared failed", exc_info=outcome)


async def create(body: dict) -> dict:
    rid = body["recruiter_id"]
    if await recruiter_exists(rid):
        raise HTTPException(409, "Recruiter profile already exists")

    company_id = body.get("company_id")
    try:
        if not company_id:
            if not body.get("company"):
                raise HTTPException(400, "Provide company_id or company object")
            c = body["company"]
            loc = (c.get("location") or "").strip() or None
            if loc and len(loc) > 255:
                loc = loc[:255]
            company_id = await create_company(
                c["name"],
                (c.get("industry") or "").strip() or None,
                (c.get("size") or "").strip() or None,
                loc,
            )
        else:
            if not await find_company(company_id):
                raise HTTPException(404, "Company not found")

        await create_recruiter(
            rid,
            company_id,
            body["name"],
            body["email"],
            body.get("phone"),
            body.get("role"),
            body.get("access_level"),
        )
        profile_fields = {
            key: body.get(key)
            for key in (
                "first_name",
                "last_name",
                "location_city",
                "location_state",
                "location_country",
                "headline",
                "summary",
                "birthday",
                "website",
                "profile_photo_url",
                "cover_photo_url",
                "open_to",
                "profile_status",
                "profile_language",
                "profile_slug",
                "experience",
                "education",
                "skills",
                "about",
                "languages",
                "followed_skills",
            )
            if key in body
        }
        if profile_fields:
            await update_recruiter(rid, profile_fields)
    except IntegrityError as exc:
        raise HTTPException(
            409,
            "Could not create recruiter profile (duplicate or invalid reference). Check company and account data.",
        ) from exc

    row = await get_recruiter(rid)
    if not row:
        raise HTTPException(500, "Recruiter profile was created but could not be loaded")
    return row


async def get(recruiter_id: int, actor: dict | None = None) -> dict:
    """Load recruiter profile. View analytics use ``record_profile_view``, not this GET."""
    _ = actor
    r = await get_recruiter(recruiter_id)
    if not r:
        raise HTTPException(404, "Recruiter not found")
    return r


async def record_profile_view(viewer_id: int, recruiter_id: int) -> dict:
    if int(viewer_id) == int(recruiter_id):
        return {"recorded": False, "reason": "self_view"}
    if not await get_recruiter(recruiter_id):
        raise HTTPException(404, "Recruiter not found")

    dedupe_key = f"profile_view_dedupe:v1:{viewer_id}:{recruiter_id}"
    try:
        redis = await get_redis()
        first_time = await redis.set(dedupe_key, "1", nx=True, ex=PROFILE_VIEW_DEDUP_TTL_SEC)
        if not first_time:
            return {"recorded": False, "reason": "deduplicated_24h"}
    except Exception:
        log.warning("recruiter profile view dedupe redis unavailable; emitting anyway", exc_info=True)

    try:
        await emit_recruiter_profile_viewed(viewer_id, recruiter_id)
    except Exception:
        log.exception("emit_recruiter_profile_viewed failed recruiter_id=%s viewer_id=%s", recruiter_id, viewer_id)
        raise HTTPException(503, "Could not record profile view — try again later.") from None
    return {"recorded": True}


async def update(body: dict) -> dict:
    raw_fs = body.pop("__pydantic_fields_set__", None)
    fields_set: set = set(raw_fs) if raw_fs is not None else set()
    rid = body.pop("recruiter_id")
    existing = await get_recruiter(rid)
    if not existing:
        raise HTTPException(404, "Recruiter not found")
    # Kafka / JSON may drop or empty fields_set; without this, recruiter_patch is {} and UI never updates.
    if not fields_set:
        fields_set = set(body.keys())
    company = body.pop("company", None) if "company" in fields_set else None
    recruiter_patch = {k: v for k, v in body.items() if k in fields_set}
    if recruiter_patch:
        await update_recruiter(rid, recruiter_patch)
    if company:
        await update_company(existing["company_id"], company)
    return await get_recruiter(rid)


async def delete(recruiter_id: int) -> dict:
    if not await get_recruiter(recruiter_id):
        raise HTTPException(404, "Recruiter not found")
    await delete_recruiter(recruiter_id)
    return {"recruiter_id": recruiter_id, "deleted": True}


async def search(name, company, industry, page, actor_id: int | None = None) -> dict:
    rows, total = await search_recruiters(name, company, industry, page, exclude_recruiter_id=actor_id)
    await _emit_recruiter_search_appearance_events(actor_id, rows, name, company, industry)
    return {"recruiters": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def by_company(company_id: int, page: int) -> dict:
    company = await find_company(company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    rows, total = await recruiters_by_company(company_id, page)
    return {"company": company, "recruiters": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


async def upload_photo_file(
    recruiter_id: int,
    actor_id: int,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict:
    if recruiter_id != actor_id:
        raise HTTPException(403, "Cannot upload photo for another recruiter")
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WEBP images are allowed")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image exceeds 5MB limit")
    if not await get_recruiter(recruiter_id):
        raise HTTPException(404, "Recruiter not found")

    existing = await get_recruiter_photo_file_id(recruiter_id)
    new_file_id = await files_mongo.upload_photo(recruiter_id, filename, content_type, data)
    url = f"/api/recruiters/photo/{recruiter_id}?v={new_file_id}"
    await set_recruiter_photo_file(recruiter_id, new_file_id, url)
    if existing and existing != new_file_id:
        await files_mongo.delete_photo(existing)
    return {
        "recruiter_id": recruiter_id,
        "profile_photo_url": url,
        "profile_photo_file_id": new_file_id,
    }


async def stream_photo_file(recruiter_id: int):
    file_id = await get_recruiter_photo_file_id(recruiter_id)
    if not file_id:
        raise HTTPException(404, "No profile photo")
    try:
        return await files_mongo.stream_photo(file_id)
    except FileNotFoundError:
        raise HTTPException(404, "Profile photo missing in storage")


async def upload_cover_file(
    recruiter_id: int,
    actor_id: int,
    filename: str,
    content_type: str,
    data: bytes,
) -> dict:
    if recruiter_id != actor_id:
        raise HTTPException(403, "Cannot upload cover for another recruiter")
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(400, "Only JPEG, PNG, or WEBP images are allowed")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Image exceeds 5MB limit")
    if not await get_recruiter(recruiter_id):
        raise HTTPException(404, "Recruiter not found")

    existing = await get_recruiter_cover_file_id(recruiter_id)
    new_file_id = await files_mongo.upload_photo(recruiter_id, filename, content_type, data)
    url = f"/api/recruiters/cover/{recruiter_id}?v={new_file_id}"
    await set_recruiter_cover_file(recruiter_id, new_file_id, url)
    if existing and existing != new_file_id:
        await files_mongo.delete_photo(existing)
    return {
        "recruiter_id": recruiter_id,
        "cover_photo_url": url,
        "cover_photo_file_id": new_file_id,
    }


async def stream_cover_file(recruiter_id: int):
    file_id = await get_recruiter_cover_file_id(recruiter_id)
    if not file_id:
        raise HTTPException(404, "No cover photo")
    try:
        return await files_mongo.stream_photo(file_id)
    except FileNotFoundError:
        raise HTTPException(404, "Cover photo missing in storage")


async def delete_cover_file(recruiter_id: int, actor_id: int) -> dict:
    if recruiter_id != actor_id:
        raise HTTPException(403, "Forbidden")
    file_id = await get_recruiter_cover_file_id(recruiter_id)
    if file_id:
        await files_mongo.delete_photo(file_id)
    await clear_recruiter_cover_file(recruiter_id)
    return {"recruiter_id": recruiter_id, "deleted": True}


async def enqueue_create(body: dict, actor: dict) -> dict:
    if body.get("recruiter_id") != actor.get("user_id"):
        raise HTTPException(403, "You can only create a recruiter profile for your own account")
    return await enqueue_recruiter_command("create", actor, {"body": body})


async def enqueue_update(body: dict, actor: dict) -> dict:
    if body.get("recruiter_id") != actor.get("user_id"):
        raise HTTPException(403, "You can only update your own recruiter profile")
    if isinstance(body.get("__pydantic_fields_set__"), set):
        body["__pydantic_fields_set__"] = sorted(body["__pydantic_fields_set__"])
    return await enqueue_recruiter_command("update", actor, {"body": body})


async def enqueue_delete(recruiter_id: int, actor: dict) -> dict:
    if recruiter_id != actor.get("user_id"):
        raise HTTPException(403, "You can only delete your own recruiter profile")
    return await enqueue_recruiter_command("delete", actor, {"recruiter_id": recruiter_id})


async def enqueue_delete_cover(recruiter_id: int, actor: dict) -> dict:
    if recruiter_id != actor.get("user_id"):
        raise HTTPException(403, "Forbidden")
    return await enqueue_recruiter_command(
        "delete_cover",
        actor,
        {"recruiter_id": recruiter_id, "actor_id": actor["user_id"]},
    )


async def get_command(command_id: str) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    return status
