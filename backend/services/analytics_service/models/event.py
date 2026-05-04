import asyncio
from datetime import datetime, timedelta, timezone
from shared.database.mongo import get_db

# Distinct viewers returned for profile dashboards (member + recruiter).
PROFILE_VIEWERS_RECENT_LIMIT = 5


def _recruiter_profile_view_match(recruiter_id: int) -> dict:
    """profile.viewed events for recruiter-owned profiles (producer + legacy shapes)."""
    rid = str(recruiter_id)
    return {
        "$or": [
            {"payload.recruiter_id": {"$in": [rid, recruiter_id]}},
            {"entity.entity_type": "recruiter", "entity.entity_id": rid},
        ]
    }


def _month_window(month: str) -> tuple[datetime, datetime]:
    """Inclusive start, exclusive end, UTC — matches timezone-aware event timestamps."""
    raw = datetime.fromisoformat(month)
    if raw.tzinfo is None:
        raw = raw.replace(tzinfo=timezone.utc)
    else:
        raw = raw.astimezone(timezone.utc)
    y, m = raw.year, raw.month
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    if m == 12:
        end = datetime(y + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(y, m + 1, 1, tzinfo=timezone.utc)
    return start, end


def _recruiter_payload_match(recruiter_id: int) -> dict:
    """Events may store recruiter_id as str or int depending on producer version."""
    return {"payload.recruiter_id": {"$in": [str(recruiter_id), recruiter_id]}}


def _job_payload_match(job_id: str) -> dict:
    ids = [str(job_id)]
    try:
        ids.append(int(job_id))
    except ValueError:
        pass
    return {"payload.job_id": {"$in": ids}}


def _not_actor_is_profile_owner(profile_owner_id: int) -> dict:
    """Exclude profile.viewed rows where the viewer is the profile owner (self-views)."""
    pid = profile_owner_id
    return {"$nor": [{"actor_id": str(pid)}, {"actor_id": pid}]}


def _is_self_profile_view_event(envelope: dict) -> bool:
    """True when profile.viewed represents the owner opening their own profile."""
    if envelope.get("event_type") != "profile.viewed":
        return False
    actor = envelope.get("actor_id")
    if actor is None:
        return False
    ent = envelope.get("entity") or {}
    payload = envelope.get("payload") or {}
    raw_subject = ent.get("entity_id") or payload.get("member_id") or payload.get("recruiter_id")
    if raw_subject is None:
        return False
    try:
        return int(actor) == int(raw_subject)
    except (TypeError, ValueError):
        return str(actor).strip() == str(raw_subject).strip()


async def _invalidate_profile_view_analytics_cache(envelope: dict) -> None:
    """Drop cached dashboard aggregates so the next read reflects the new profile.viewed row."""
    if envelope.get("event_type") != "profile.viewed":
        return
    ent = envelope.get("entity") or {}
    et = str(ent.get("entity_type") or "").lower()
    eid = ent.get("entity_id")
    if not eid:
        return
    try:
        oid = int(eid)
    except (TypeError, ValueError):
        return
    try:
        from shared.redis_utils.cache import cache_del

        if et == "recruiter":
            await cache_del(f"analytics:recruiter_profile:v1:{oid}")
        else:
            await cache_del(f"analytics:member:v3:{oid}")
    except Exception:
        return


async def insert_event(envelope: dict) -> None:
    if _is_self_profile_view_event(envelope):
        return
    db = get_db()
    await db.events.insert_one({
        "event_type":      envelope["event_type"],
        "trace_id":        envelope.get("trace_id"),
        "timestamp":       datetime.fromisoformat(envelope["timestamp"].replace("Z", "+00:00")),
        "actor_id":        envelope.get("actor_id"),
        "entity":          envelope.get("entity"),
        "payload":         envelope.get("payload"),
        "idempotency_key": envelope["idempotency_key"],
    })
    await _invalidate_profile_view_analytics_cache(envelope)


async def top_jobs_by_applications(month: str, recruiter_id: int | None = None) -> list:
    db = get_db()
    start, end = _month_window(month)
    match = {"event_type": "application.submitted", "timestamp": {"$gte": start, "$lt": end}, "payload.job_id": {"$ne": None}}
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": "$payload.job_id", "count": {"$sum": 1}}},
        {"$sort":  {"count": -1}},
        {"$limit": 10},
    ]).to_list(length=10)


async def low_traction_jobs(month: str, recruiter_id: int | None = None) -> list:
    db = get_db()
    start, end = _month_window(month)
    match = {
        "event_type": "application.submitted",
        "timestamp": {"$gte": start, "$lt": end},
        "payload.job_id": {"$ne": None},
    }
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": "$payload.job_id", "count": {"$sum": 1}}},
        {"$sort":  {"count": 1}},
        {"$limit": 5},
    ]).to_list(length=5)


async def job_clicks(month: str | None = None, recruiter_id: int | None = None) -> list:
    db = get_db()
    match = {"event_type": "job.viewed"}
    if month:
        start, end = _month_window(month)
        match["timestamp"] = {"$gte": start, "$lt": end}
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": "$entity.entity_id", "clicks": {"$sum": 1}}},
        {"$sort":  {"clicks": -1}},
    ]).to_list(length=100)


async def saved_jobs_per_period(period: str, month: str | None = None, recruiter_id: int | None = None) -> list:
    db = get_db()
    fmt = "%Y-W%V" if period == "week" else "%Y-%m-%d"
    match = {"event_type": "job.saved"}
    if month:
        start, end = _month_window(month)
        match["timestamp"] = {"$gte": start, "$lt": end}
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$timestamp"}}, "count": {"$sum": 1}}},
        {"$sort":  {"_id": 1}},
    ]).to_list(length=500)


async def funnel_data() -> dict:
    db = get_db()
    stages = ["job.viewed", "job.saved", "application.submitted"]
    results = await db.events.aggregate([
        {"$match":  {"event_type": {"$in": stages}}},
        {"$group":  {"_id": "$event_type", "count": {"$sum": 1}}},
    ]).to_list(length=10)
    m = {r["_id"]: r["count"] for r in results}
    return {"viewed": m.get("job.viewed", 0), "saved": m.get("job.saved", 0), "submitted": m.get("application.submitted", 0)}


async def geo_distribution(month: str | None = None, recruiter_id: int | None = None, job_id: str | None = None) -> list:
    db = get_db()
    match = {"event_type": "application.submitted"}
    if month:
        start, end = _month_window(month)
        match["timestamp"] = {"$gte": start, "$lt": end}
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    if job_id:
        match.update(_job_payload_match(job_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group":  {"_id": {"city": "$payload.city", "state": "$payload.state"}, "count": {"$sum": 1}}},
        {"$sort":   {"count": -1}},
    ]).to_list(length=200)


async def member_dashboard(member_id) -> dict:
    db = get_db()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    view_base = {
        "event_type": "profile.viewed",
        "timestamp": {"$gte": since},
        "$or": [{"payload.member_id": str(member_id)}, {"entity.entity_id": str(member_id)}],
        **_not_actor_is_profile_owner(int(member_id)),
    }
    views_total, views_daily, search_appearances, status_changed, submitted = await __import__("asyncio").gather(
        db.events.count_documents(view_base),
        db.events.aggregate([
            {"$match": view_base},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "count": {"$sum": 1}}},
        ]).to_list(length=60),
        db.events.count_documents({
            "event_type": "member.searchAppeared",
            "timestamp": {"$gte": since},
            "$or": [{"payload.member_id": str(member_id)}, {"entity.entity_id": str(member_id)}],
        }),
        db.events.aggregate([
            {"$match":  {"event_type": "application.statusChanged", "payload.member_id": str(member_id)}},
            {"$group":  {"_id": "$payload.new_status", "count": {"$sum": 1}}},
        ]).to_list(length=10),
        db.events.count_documents({
            "event_type": "application.submitted",
            "payload.member_id": str(member_id),
        }),
    )
    daily_map = {row["_id"]: row["count"] for row in views_daily}
    profile_views_daily = []
    for i in range(30):
        day = (since + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        profile_views_daily.append({"date": day, "count": daily_map.get(day, 0)})
    statuses = {row["_id"]: row["count"] for row in status_changed}
    statuses["submitted"] = statuses.get("submitted", 0) + submitted
    breakdown = [{"_id": status, "count": count} for status, count in statuses.items() if status]

    viewers_rows = await db.events.aggregate(
        [
            {"$match": view_base},
            {"$sort": {"timestamp": -1}},
            {"$group": {"_id": "$actor_id", "last_viewed_at": {"$first": "$timestamp"}}},
            {"$sort": {"last_viewed_at": -1}},
            {"$limit": PROFILE_VIEWERS_RECENT_LIMIT},
        ]
    ).to_list(length=PROFILE_VIEWERS_RECENT_LIMIT + 1)
    profile_viewers_recent = []
    for row in viewers_rows:
        ts = row.get("last_viewed_at")
        profile_viewers_recent.append(
            {
                "viewer_user_id": row.get("_id"),
                "last_viewed_at": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            }
        )

    return {
        "profile_views_30d": views_total,
        "profile_views_daily_30d": profile_views_daily,
        "search_appearances_30d": search_appearances,
        "application_status_breakdown": breakdown,
        "profile_viewers_recent": profile_viewers_recent,
    }


async def recruiter_dashboard(recruiter_id, month: str | None = None) -> list:
    db = get_db()
    match: dict = {
        "event_type": {"$in": ["job.viewed", "application.submitted", "application.statusChanged"]},
        **_recruiter_payload_match(recruiter_id),
    }
    if month:
        start, end = _month_window(month)
        match["timestamp"] = {"$gte": start, "$lt": end}
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
    ]).to_list(length=10)


async def recruiter_profile_dashboard(recruiter_id: int) -> dict:
    """30d aggregates for a recruiter’s profile + owned jobs + outbound messages."""
    db = get_db()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    tmatch = {"timestamp": {"$gte": since}}
    profile_m = _recruiter_profile_view_match(recruiter_id)
    job_m = _recruiter_payload_match(recruiter_id)
    rid_str = str(recruiter_id)

    profile_views_match = {
        "event_type": "profile.viewed",
        **tmatch,
        **profile_m,
        **_not_actor_is_profile_owner(int(recruiter_id)),
    }
    views_total, views_daily, job_views, job_saves, applicants, messages_sent, status_changed, search_appearances = (
        await asyncio.gather(
            db.events.count_documents(profile_views_match),
            db.events.aggregate([
                {"$match": profile_views_match},
                {
                    "$group": {
                        "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                        "count": {"$sum": 1},
                    }
                },
            ]).to_list(length=32),
            db.events.count_documents({"event_type": "job.viewed", **tmatch, **job_m}),
            db.events.count_documents({"event_type": "job.saved", **tmatch, **job_m}),
            db.events.count_documents({"event_type": "application.submitted", **tmatch, **job_m}),
            db.events.count_documents({
                "event_type": "message.sent",
                **tmatch,
                "actor_id": {"$in": [rid_str, recruiter_id]},
            }),
            db.events.aggregate([
                {"$match": {"event_type": "application.statusChanged", **tmatch, **job_m}},
                {"$group": {"_id": "$payload.new_status", "count": {"$sum": 1}}},
            ]).to_list(length=20),
            db.events.count_documents({"event_type": "recruiter.searchAppeared", **tmatch, **profile_m}),
        )
    )

    daily_map = {row["_id"]: row["count"] for row in views_daily}
    profile_views_daily = []
    for i in range(30):
        day = (since + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        profile_views_daily.append({"date": day, "count": daily_map.get(day, 0)})

    statuses = {row["_id"]: row["count"] for row in status_changed if row.get("_id")}
    statuses["submitted"] = statuses.get("submitted", 0) + applicants
    breakdown = [{"_id": status, "count": count} for status, count in statuses.items() if status]

    viewers_rows = await db.events.aggregate(
        [
            {"$match": profile_views_match},
            {"$sort": {"timestamp": -1}},
            {"$group": {"_id": "$actor_id", "last_viewed_at": {"$first": "$timestamp"}}},
            {"$sort": {"last_viewed_at": -1}},
            {"$limit": PROFILE_VIEWERS_RECENT_LIMIT},
        ]
    ).to_list(length=PROFILE_VIEWERS_RECENT_LIMIT + 1)
    profile_viewers_recent = []
    for row in viewers_rows:
        ts = row.get("last_viewed_at")
        profile_viewers_recent.append(
            {
                "viewer_user_id": row.get("_id"),
                "last_viewed_at": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            }
        )

    return {
        "profile_views_30d": views_total,
        "profile_views_daily_30d": profile_views_daily,
        "search_appearances_30d": search_appearances,
        "job_views_30d": job_views,
        "job_saves_30d": job_saves,
        "applicants_30d": applicants,
        "messages_sent_30d": messages_sent,
        "application_status_breakdown": breakdown,
        "profile_viewers_recent": profile_viewers_recent,
    }


async def event_counts_by_type(
    month: str | None = None,
    recruiter_id: int | None = None,
    job_id: str | None = None,
) -> list:
    db = get_db()
    match: dict = {}
    if month:
        start, end = _month_window(month)
        match["timestamp"] = {"$gte": start, "$lt": end}
    if recruiter_id is not None:
        match.update(_recruiter_payload_match(recruiter_id))
    if job_id:
        match.update(_job_payload_match(job_id))
    return await db.events.aggregate([
        {"$match": match},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(length=200)
