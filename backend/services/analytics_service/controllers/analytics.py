import json
from shared.redis_utils.cache import cache_del_pattern, cache_get, cache_set
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
    recruiter_profile_dashboard,
    event_counts_by_type,
)

TTL = 300


async def ingest(envelope: dict) -> dict:
    key = envelope.get("idempotency_key")
    if key and await is_duplicate(f"analytics:{key}"):
        return {"status": "duplicate"}
    await insert_event(envelope)
    # Keep dashboard data fresh after new events arrive.
    await cache_del_pattern("analytics:*")
    return {"status": "ok"}


async def get_top_jobs(month: str, recruiter_id: int | None = None) -> list:
    ck = f"analytics:top_jobs:{month}:{recruiter_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await top_jobs_by_applications(month, recruiter_id)
    result = [{"job_id": str(r["_id"]), "applications": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_low_traction(month: str, recruiter_id: int | None = None) -> list:
    ck = f"analytics:low_traction:{month}:{recruiter_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await low_traction_jobs(month, recruiter_id)
    result = [{"job_id": str(r["_id"]), "applications": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_job_clicks(month: str | None = None, recruiter_id: int | None = None) -> list:
    ck = f"analytics:job_clicks:{month or 'all'}:{recruiter_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await job_clicks(month, recruiter_id)
    result = [{"job_id": str(r["_id"]), "clicks": r["clicks"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_saved_jobs(period: str, month: str | None = None, recruiter_id: int | None = None) -> list:
    ck = f"analytics:saved_jobs:{period}:{month or 'all'}:{recruiter_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await saved_jobs_per_period(period, month, recruiter_id)
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


async def get_geo(month: str | None = None, recruiter_id: int | None = None, job_id: str | None = None) -> list:
    ck = f"analytics:geo:{month or 'all'}:{recruiter_id or 'all'}:{job_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await geo_distribution(month, recruiter_id, job_id)
    result = [{"city": r["_id"].get("city"), "state": r["_id"].get("state"), "count": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_member_dashboard(member_id: int) -> dict:
    # Version cache key so old dashboard shape/count logic does not keep stale zeros.
    ck = f"analytics:member:v3:{member_id}"
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


async def get_recruiter_dashboard(recruiter_id: int, month: str | None = None) -> list:
    ck = f"analytics:recruiter:v2:{recruiter_id}:{month or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await recruiter_dashboard(recruiter_id, month)
    result = [{"event_type": r["_id"], "count": r["count"]} for r in data]
    await cache_set(ck, result, TTL)
    return result


async def get_recruiter_profile_dashboard(recruiter_id: int) -> dict:
    ck = f"analytics:recruiter_profile:v1:{recruiter_id}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    data = await recruiter_profile_dashboard(recruiter_id)
    data["application_status_breakdown"] = [
        {"status": r["_id"], "count": r["count"]}
        for r in data.get("application_status_breakdown", [])
    ]
    await cache_set(ck, data, TTL)
    return data


async def get_event_counts(month: str | None = None, recruiter_id: int | None = None, job_id: str | None = None) -> list:
    ck = f"analytics:event_counts:{month or 'all'}:{recruiter_id or 'all'}:{job_id or 'all'}"
    hit = await cache_get(ck)
    if hit is not None:
        return hit
    rows = await event_counts_by_type(month, recruiter_id, job_id)
    result = [{"event_type": r["_id"], "count": r["count"]} for r in rows]
    await cache_set(ck, result, TTL)
    return result
