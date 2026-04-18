import asyncio
from fastapi import HTTPException
from models.job import (
    create_job, get_job, update_job, close_job, increment_views,
    search_jobs, jobs_by_recruiter, save_job, unsave_job, saved_by_member, PAGE_SIZE,
)
from producers.job_producer import emit_job_viewed, emit_job_saved, emit_job_closed
from shared.redis_utils.cache import cache_get, cache_set, cache_del, cache_del_pattern

JOB_TTL    = 300
SEARCH_TTL = 120

_job_key    = lambda jid: f"job:{jid}"
_search_key = lambda p:   f"job:search:{p}"


async def create(body: dict) -> dict:
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


async def update(job_id: int, fields: dict) -> dict:
    if not await get_job(job_id):
        raise HTTPException(404, "Job not found")
    await update_job(job_id, fields)
    await cache_del(_job_key(job_id))
    await cache_del_pattern("job:search:*")
    return await get_job(job_id)


async def search(keyword, location, employment_type, work_mode, industry, page) -> dict:
    key = _search_key(f"{keyword}-{location}-{employment_type}-{work_mode}-{industry}-{page}")
    cached = await cache_get(key)
    if cached:
        return cached
    rows, total = await search_jobs(keyword, location, employment_type, work_mode, industry, page)
    result = {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}
    await cache_set(key, result, SEARCH_TTL)
    return result


async def close(job_id: int, actor_id) -> dict:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] == "closed":
        raise HTTPException(400, "Job is already closed")
    if not await close_job(job_id):
        raise HTTPException(400, "Failed to close job")
    await cache_del(_job_key(job_id))
    await cache_del_pattern("job:search:*")
    await emit_job_closed(actor_id or job["recruiter_id"], job_id)
    return {"job_id": job_id, "status": "closed"}


async def by_recruiter(recruiter_id: int, page: int) -> dict:
    rows, total = await jobs_by_recruiter(recruiter_id, page)
    return {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def save(member_id: int, job_id: int) -> dict:
    if not await get_job(job_id):
        raise HTTPException(404, "Job not found")
    if not await save_job(member_id, job_id):
        raise HTTPException(409, "Job already saved")
    await emit_job_saved(member_id, job_id)
    return {"member_id": member_id, "job_id": job_id, "saved": True}


async def unsave(member_id: int, job_id: int) -> dict:
    if not await unsave_job(member_id, job_id):
        raise HTTPException(404, "Saved job not found")
    return {"member_id": member_id, "job_id": job_id, "saved": False}


async def saved_jobs(member_id: int, page: int) -> dict:
    rows, total = await saved_by_member(member_id, page)
    return {"jobs": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def track_view(job_id: int, viewer_id) -> dict:
    if not await get_job(job_id):
        raise HTTPException(404, "Job not found")
    await increment_views(job_id)
    await cache_del(_job_key(job_id))
    asyncio.create_task(emit_job_viewed(viewer_id or "anonymous", job_id))
    return {"job_id": job_id, "tracked": True}
