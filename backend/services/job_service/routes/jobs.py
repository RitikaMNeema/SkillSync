from fastapi import APIRouter, Depends
from schemas.jobs import (
    CreateJobRequest, JobIdRequest, UpdateJobRequest, SearchJobsRequest,
    ByRecruiterRequest, SaveJobRequest, SavedByMemberRequest, TrackViewRequest, CommandStatusRequest,
)
import controllers.jobs as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/create", status_code=202)
async def create(body: CreateJobRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_create(body.model_dump(), u)}

@router.post("/get")
async def get(body: JobIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get(body.job_id)}

@router.post("/update")
async def update(body: UpdateJobRequest, u=Depends(get_current_user)):
    d = body.model_dump(exclude_none=True)
    return {"success": True, "data": await ctrl.enqueue_update(d.pop("job_id"), d, u)}

@router.post("/search")
async def search(body: SearchJobsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.search(body.keyword, body.location, body.employment_type, body.work_mode, body.industry, body.seniority_level, body.page)}

@router.post("/close", status_code=202)
async def close(body: JobIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_close(body.job_id, u)}


@router.post("/delete", status_code=202)
async def delete(body: JobIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_delete(body.job_id, u)}

@router.post("/byRecruiter")
async def by_recruiter(body: ByRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_recruiter(body.recruiter_id, body.page)}

@router.post("/save", status_code=202)
async def save(body: SaveJobRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_save(body.member_id, body.job_id, u)}

@router.post("/unsave", status_code=202)
async def unsave(body: SaveJobRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_unsave(body.member_id, body.job_id, u)}

@router.post("/savedByMember")
async def saved_by_member(body: SavedByMemberRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.saved_jobs(body.member_id, body.page)}

@router.post("/trackView", status_code=202)
async def track_view(body: TrackViewRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_track_view(body.job_id, body.viewer_id, u)}


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id, u)}
