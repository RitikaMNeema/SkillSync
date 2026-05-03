import logging

from fastapi import APIRouter, Depends, HTTPException
from schemas.analytics import (
    IngestRequest, TopJobsRequest, LowTractionJobsRequest, SavedJobsRequest, JobClicksRequest, GeoRequest,
    MemberDashboardRequest, RecruiterDashboardRequest, RecruiterProfileDashboardRequest,
    EventCountsRequest,
)
import controllers.analytics as ctrl
from shared.middleware.auth import get_current_user

log = logging.getLogger(__name__)

events_router    = APIRouter()
analytics_router = APIRouter()


@events_router.post("/ingest", status_code=201)
async def ingest(body: IngestRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.ingest(body.model_dump())}


@analytics_router.post("/jobs/top")
async def top_jobs(body: TopJobsRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_top_jobs(body.month, recruiter_id)}


@analytics_router.post("/jobs/lowTraction")
async def low_traction(body: LowTractionJobsRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_low_traction(body.month, recruiter_id)}


@analytics_router.post("/jobs/clicks")
async def clicks(body: JobClicksRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_job_clicks(body.month, recruiter_id)}


@analytics_router.post("/jobs/saves")
async def saves(body: SavedJobsRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_saved_jobs(body.period, body.month, recruiter_id)}


@analytics_router.post("/funnel")
async def funnel(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_funnel()}


@analytics_router.post("/geo")
async def geo(body: GeoRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_geo(body.month, recruiter_id, body.job_id)}


@analytics_router.post("/member/dashboard")
async def member_dash(body: MemberDashboardRequest, u=Depends(get_current_user)):
    if str(body.member_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another member's dashboard")
    return {"success": True, "data": await ctrl.get_member_dashboard(body.member_id)}


@analytics_router.post("/recruiter/dashboard")
async def recruiter_dash(body: RecruiterDashboardRequest, u=Depends(get_current_user)):
    if str(body.recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's dashboard")
    return {"success": True, "data": await ctrl.get_recruiter_dashboard(body.recruiter_id, body.month)}


@analytics_router.post("/recruiter/profileDashboard")
async def recruiter_profile_dash(body: RecruiterProfileDashboardRequest, u=Depends(get_current_user)):
    if str(body.recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's profile analytics")
    try:
        return {"success": True, "data": await ctrl.get_recruiter_profile_dashboard(body.recruiter_id)}
    except Exception:
        log.exception("recruiter profileDashboard recruiter_id=%s", body.recruiter_id)
        raise HTTPException(503, "Could not load recruiter profile analytics — check MongoDB and analytics-service logs.") from None


@analytics_router.post("/debug/eventCounts")
async def event_counts(body: EventCountsRequest, u=Depends(get_current_user)):
    recruiter_id = body.recruiter_id
    if recruiter_id is not None and str(recruiter_id) != str(u["user_id"]):
        raise HTTPException(403, "Not authorized to access another recruiter's analytics")
    return {"success": True, "data": await ctrl.get_event_counts(body.month, recruiter_id, body.job_id)}
