from fastapi import APIRouter, Depends
from schemas.analytics import (
    IngestRequest, TopJobsRequest, SavedJobsRequest,
    MemberDashboardRequest, RecruiterDashboardRequest,
)
import controllers.analytics as ctrl
from shared.middleware.auth import get_current_user

events_router    = APIRouter()
analytics_router = APIRouter()


@events_router.post("/ingest", status_code=201)
async def ingest(body: IngestRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.ingest(body.model_dump())}


@analytics_router.post("/jobs/top")
async def top_jobs(body: TopJobsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_top_jobs(body.month)}


@analytics_router.post("/jobs/lowTraction")
async def low_traction(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_low_traction()}


@analytics_router.post("/jobs/clicks")
async def clicks(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_job_clicks()}


@analytics_router.post("/jobs/saves")
async def saves(body: SavedJobsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_saved_jobs(body.period)}


@analytics_router.post("/funnel")
async def funnel(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_funnel()}


@analytics_router.post("/geo")
async def geo(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_geo()}


@analytics_router.post("/member/dashboard")
async def member_dash(body: MemberDashboardRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_member_dashboard(body.member_id)}


@analytics_router.post("/recruiter/dashboard")
async def recruiter_dash(body: RecruiterDashboardRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_recruiter_dashboard(body.recruiter_id)}
