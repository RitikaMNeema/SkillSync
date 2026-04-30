import asyncio
from fastapi import HTTPException
from models.job import (
    create_job, get_job, update_job, close_job, delete_job, increment_views,
    search_jobs, jobs_by_recruiter, save_job, unsave_job, saved_by_member, PAGE_SIZE,
)
from producers.job_producer import emit_job_viewed, emit_job_saved, emit_job_closed
from producers.job_command_producer import enqueue_job_command
from models.command_status import get_command_status
from shared.redis_utils.cache import cache_get, cache_set, cache_del, cache_del_pattern

JOB_TTL    = 300
SEARCH_TTL = 120

_job_key    = lambda jid: f"job:{jid}"
_search_key = lambda p:   f"job:search:{p}"


async def create(body: dict, actor_id=None) -> dict:
    if actor_id and str(body.get("recruiter_id")) != str(actor_id):
        raise HTTPException(403, "Not authorized to create postings for another recruiter")
    job_id = await create_job(body)
    return await get_job(job_id)


async def get(job_id: int) -> dict:
    cached = await cache_get(_job_key(job_id))
    if cached:
        return cached
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    await cache_set(_job_key(job_id), job, JOB_TTL)
    return job


async def update(job_id: int, fields: dict, actor_id=None) -> dict:
    existing = await get_job(job_id)
    if not existing:
        raise HTTPException(404, "Job not found")
    if actor_id and str(existing.get("recruiter_id")) != str(actor_id):
        raise HTTPException(403, "Not authorized to update this job")
    await update_job(job_id, fields)
    await cache_del(_job_key(job_id))
    await cache_del_pattern("job:search:*")
    return await get_job(job_id)


async def search(keyword, location, employment_type, work_mode, industry, seniority_level, page) -> dict:
    key = _search_key(f"{keyword}-{location}-{employment_type}-{work_mode}-{industry}-{seniority_level}-{page}")
    cached = await cache_get(key)
    if cached:
        return cached
    rows, total = await search_jobs(keyword, location, employment_type, work_mode, industry, seniority_level, page)
    result = {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
    await cache_set(key, result, SEARCH_TTL)
    return result


async def close(job_id: int, actor_id) -> dict:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if actor_id and str(actor_id) != str(job["recruiter_id"]):
        raise HTTPException(403, "Not authorized to close this job")
    if job["status"] == "closed":
        raise HTTPException(400, "Job is already closed")
    if not await close_job(job_id):
        raise HTTPException(400, "Failed to close job")
    await cache_del(_job_key(job_id))
    await cache_del_pattern("job:search:*")
    await emit_job_closed(actor_id or job["recruiter_id"], job_id)
    return {"job_id": job_id, "status": "closed"}


async def delete(job_id: int, actor_id) -> dict:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if str(actor_id) != str(job["recruiter_id"]):
        raise HTTPException(403, "Not authorized to delete this job")
    if not await delete_job(job_id):
        raise HTTPException(400, "Failed to delete job")
    await cache_del(_job_key(job_id))
    await cache_del_pattern("job:search:*")
    return {"job_id": job_id, "deleted": True}


async def by_recruiter(recruiter_id: int, page: int) -> dict:
    rows, total = await jobs_by_recruiter(recruiter_id, page)
    return {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def save(member_id: int, job_id: int) -> dict:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not await save_job(member_id, job_id):
        raise HTTPException(409, "Job already saved")
    await emit_job_saved(member_id, job_id, job.get("recruiter_id"))
    return {"member_id": member_id, "job_id": job_id, "saved": True}


async def unsave(member_id: int, job_id: int) -> dict:
    if not await unsave_job(member_id, job_id):
        raise HTTPException(404, "Saved job not found")
    return {"member_id": member_id, "job_id": job_id, "saved": False}


async def saved_jobs(member_id: int, page: int) -> dict:
    rows, total = await saved_by_member(member_id, page)
    return {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def track_view(job_id: int, viewer_id) -> dict:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    await increment_views(job_id)
    await cache_del(_job_key(job_id))
    asyncio.create_task(emit_job_viewed(viewer_id or "anonymous", job_id, job.get("recruiter_id")))
    return {"job_id": job_id, "tracked": True}


def _is_recruiter(actor: dict) -> bool:
    return str(actor.get("role", "")).lower() == "recruiter"


async def enqueue_create(body: dict, actor: dict) -> dict:
    if not _is_recruiter(actor):
        raise HTTPException(403, "Only recruiters can create jobs")
    if str(body.get("recruiter_id")) != str(actor["user_id"]):
        raise HTTPException(403, "Not authorized to create postings for another recruiter")
    return await enqueue_job_command("create", actor, {"body": body})


async def enqueue_update(job_id: int, fields: dict, actor: dict) -> dict:
    if not _is_recruiter(actor):
        raise HTTPException(403, "Only recruiters can update jobs")
    return await enqueue_job_command("update", actor, {"job_id": job_id, "fields": fields})


async def enqueue_close(job_id: int, actor: dict) -> dict:
    if not _is_recruiter(actor):
        raise HTTPException(403, "Only recruiters can close jobs")
    return await enqueue_job_command("close", actor, {"job_id": job_id})


async def enqueue_delete(job_id: int, actor: dict) -> dict:
    if not _is_recruiter(actor):
        raise HTTPException(403, "Only recruiters can delete jobs")
    return await enqueue_job_command("delete", actor, {"job_id": job_id})


def _is_member(actor: dict) -> bool:
    return str(actor.get("role", "")).lower() == "member"


async def enqueue_save(member_id: int, job_id: int, actor: dict) -> dict:
    if not _is_member(actor) or str(actor["user_id"]) != str(member_id):
        raise HTTPException(403, "Members may only save jobs for themselves")
    return await enqueue_job_command("save", actor, {"member_id": member_id, "job_id": job_id})


async def enqueue_unsave(member_id: int, job_id: int, actor: dict) -> dict:
    if not _is_member(actor) or str(actor["user_id"]) != str(member_id):
        raise HTTPException(403, "Members may only unsave jobs for themselves")
    return await enqueue_job_command("unsave", actor, {"member_id": member_id, "job_id": job_id})


async def enqueue_track_view(job_id: int, viewer_id: int | None, actor: dict) -> dict:
    if viewer_id is not None and str(viewer_id) != str(actor["user_id"]):
        raise HTTPException(403, "Cannot track a view for another user")
    return await enqueue_job_command(
        "track_view",
        actor,
        {"job_id": job_id, "viewer_id": viewer_id or actor["user_id"]},
    )


async def get_command(command_id: str, actor: dict) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    return status
