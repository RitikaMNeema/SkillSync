from fastapi import APIRouter, Depends
from schemas.applications import (
    SubmitRequest, AppIdRequest, ByJobRequest, ByMemberRequest,
    UpdateStatusRequest, AddNoteRequest, CommandStatusRequest,
)
import controllers.applications as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/submit", status_code=202)
async def submit(body: SubmitRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_submit(body.job_id, body.member_id, body.resume_url, body.cover_letter, body.answers, u)}

@router.post("/get")
async def get(body: AppIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get(body.application_id, u)}

@router.post("/byJob")
async def by_job(body: ByJobRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_job(body.job_id, body.page, u)}

@router.post("/byMember")
async def by_member(body: ByMemberRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_member(body.member_id, body.page, u)}

@router.post("/updateStatus")
async def update_status(body: UpdateStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_update_status(body.application_id, body.new_status, u)}

@router.post("/addNote", status_code=202)
async def add_note(body: AddNoteRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_add_recruiter_note(body.application_id, body.recruiter_id, body.note_text, u)}

@router.post("/withdraw", status_code=202)
async def withdraw(body: AppIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_withdraw(body.application_id, u)}


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id, u)}
