from fastapi import APIRouter, Depends
from schemas.members import (
    CreateMemberRequest, GetMemberRequest, UpdateMemberRequest,
    DeleteMemberRequest, SearchMembersRequest, UploadResumeRequest, GetResumeRequest,
)
import controllers.members as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/create", status_code=201)
async def create(body: CreateMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.create(body.model_dump())
    return {"success": True, "data": data}


@router.post("/get")
async def get(body: GetMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.get(body.member_id)
    return {"success": True, "data": data}


@router.post("/update")
async def update(body: UpdateMemberRequest, u=Depends(get_current_user)):
    # Do not use exclude_none=True: nested experience/education entries must keep
    # explicit nulls/keys so dates are not dropped before persistence.
    data = await ctrl.update(body.model_dump(exclude_none=False), u["user_id"])
    return {"success": True, "data": data}


@router.post("/delete")
async def delete(body: DeleteMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.delete(body.member_id)
    return {"success": True, "data": data}


@router.post("/search")
async def search(body: SearchMembersRequest, u=Depends(get_current_user)):
    data = await ctrl.search(body.keyword, body.skill, body.location, body.page)
    return {"success": True, "data": data}


@router.post("/uploadResume")
async def upload_resume(body: UploadResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.upload_resume(body.member_id, body.resume_url)
    return {"success": True, "data": data}


@router.post("/getResume")
async def get_resume(body: GetResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.get_resume(body.member_id)
    return {"success": True, "data": data}
