from datetime import datetime, timedelta
from shared.database.mongo import get_db


async def insert_event(envelope: dict) -> None:
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


async def top_jobs_by_applications(month: str) -> list:
    db = get_db()
    start = datetime.fromisoformat(month)
    end   = datetime(start.year + (start.month // 12), ((start.month % 12) + 1), 1)
    return await db.events.aggregate([
        {"$match": {"event_type": "application.submitted", "timestamp": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": "$payload.job_id", "count": {"$sum": 1}}},
        {"$sort":  {"count": -1}},
        {"$limit": 10},
    ]).to_list(length=10)


async def low_traction_jobs() -> list:
    db = get_db()
    return await db.events.aggregate([
        {"$match": {"event_type": "application.submitted"}},
        {"$group": {"_id": "$payload.job_id", "count": {"$sum": 1}}},
        {"$sort":  {"count": 1}},
        {"$limit": 5},
    ]).to_list(length=5)


async def job_clicks() -> list:
    db = get_db()
    return await db.events.aggregate([
        {"$match": {"event_type": "job.viewed"}},
        {"$group": {"_id": "$entity.entity_id", "clicks": {"$sum": 1}}},
        {"$sort":  {"clicks": -1}},
    ]).to_list(length=100)


async def saved_jobs_per_period(period: str) -> list:
    db = get_db()
    fmt = "%Y-W%V" if period == "week" else "%Y-%m-%d"
    return await db.events.aggregate([
        {"$match": {"event_type": "job.saved"}},
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


async def geo_distribution() -> list:
    db = get_db()
    return await db.events.aggregate([
        {"$match":  {"event_type": "application.submitted"}},
        {"$group":  {"_id": {"city": "$payload.city", "state": "$payload.state"}, "count": {"$sum": 1}}},
        {"$sort":   {"count": -1}},
    ]).to_list(length=200)


async def member_dashboard(member_id) -> dict:
    db = get_db()
    since = datetime.utcnow() - timedelta(days=30)
    views, breakdown = await __import__("asyncio").gather(
        db.events.count_documents({"event_type": "profile.updated", "actor_id": str(member_id), "timestamp": {"$gte": since}}),
        db.events.aggregate([
            {"$match":  {"event_type": "application.statusChanged", "payload.member_id": str(member_id)}},
            {"$group":  {"_id": "$payload.new_status", "count": {"$sum": 1}}},
        ]).to_list(length=10),
    )
    return {"profile_views_30d": views, "application_status_breakdown": breakdown}


async def recruiter_dashboard(recruiter_id) -> list:
    db = get_db()
    return await db.events.aggregate([
        {"$match":  {"event_type": {"$in": ["job.viewed", "application.submitted", "application.statusChanged"]}, "actor_id": str(recruiter_id)}},
        {"$group":  {"_id": "$event_type", "count": {"$sum": 1}}},
    ]).to_list(length=10)
