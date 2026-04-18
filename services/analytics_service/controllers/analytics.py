import json
from shared.redis_utils.cache import cache_get, cache_set
from shared.utils.idempotency import is_duplicate
from models.event import (
    insert_event,
    top_jobs_by_applications,
    low_traction_jobs,
    job_clicks,
    saved_jobs_per_period,
    funnel_data,
    geo_distribution,
    member_dashboard,
    recruiter_dashboard,
)

TTL = 300


async def ingest(envelope: dict) -> dict:
    key = envelope.get("idempotency_key")
    if key and await is_duplicate(f"analytics:{key}"):
        return {"status": "duplicate"}
    await insert_event(envelope)
    return {"status": "ok"}


async def get_top_jobs(month: str) -> list:
    ck = f"analytics:top_jobs:{month}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await top_jobs_by_applications(month)
    result = [{"job_id": str(r["_id"]), "applications": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_low_traction() -> list:
    ck = "analytics:low_traction"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await low_traction_jobs()
    result = [{"job_id": str(r["_id"]), "applications": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_job_clicks() -> list:
    ck = "analytics:job_clicks"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await job_clicks()
    result = [{"job_id": str(r["_id"]), "clicks": r["clicks"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_saved_jobs(period: str) -> list:
    ck = f"analytics:saved_jobs:{period}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await saved_jobs_per_period(period)
    result = [{"period": r["_id"], "count": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_funnel() -> dict:
    ck = "analytics:funnel"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await funnel_data()
    await cache_set(ck, data, TTL)
    return data


async def get_geo() -> list:
    ck = "analytics:geo"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await geo_distribution()
    result = [{"city": r["_id"].get("city"), "state": r["_id"].get("state"), "count": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_member_dashboard(member_id: int) -> dict:
    ck = f"analytics:member:{member_id}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await member_dashboard(member_id)
    data["application_status_breakdown"] = [
        {"status": r["_id"], "count": r["count"]}
        for r in data.get("application_status_breakdown", [])
    ]
    await cache_set(ck, data, TTL)
    return data


async def get_recruiter_dashboard(recruiter_id: int) -> list:
    ck = f"analytics:recruiter:{recruiter_id}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await recruiter_dashboard(recruiter_id)
    result = [{"event_type": r["_id"], "count": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result
