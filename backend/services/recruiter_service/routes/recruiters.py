from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder

from schemas.recruiters import (
    CreateRecruiterRequest,
    GetRecruiterRequest,
    RecordRecruiterProfileViewRequest,
    UpdateRecruiterRequest,
    DeleteRecruiterRequest,
    SearchRecruitersRequest,
    ByCompanyRequest,
    CommandStatusRequest,
)
import controllers.recruiters as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/create", status_code=202)
async def create(body: CreateRecruiterRequest, u=Depends(get_current_user)):
    data = await ctrl.enqueue_create(body.model_dump(), u)
    return {"success": True, "data": jsonable_encoder(data)}

@router.post("/get")
async def get(body: GetRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get(body.recruiter_id, actor=u)}


@router.post("/recordProfileView")
async def record_profile_view(body: RecordRecruiterProfileViewRequest, u=Depends(get_current_user)):
    data = await ctrl.record_profile_view(int(u["user_id"]), body.recruiter_id)
    return {"success": True, "data": data}


@router.post("/update")
async def update(body: UpdateRecruiterRequest, u=Depends(get_current_user)):
    payload = body.model_dump(exclude_none=False)
    payload["__pydantic_fields_set__"] = set(body.model_fields_set)
    return {"success": True, "data": await ctrl.enqueue_update(payload, u)}

@router.post("/delete", status_code=202)
async def delete(body: DeleteRecruiterRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_delete(body.recruiter_id, u)}

@router.post("/search")
async def search(body: SearchRecruitersRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": await ctrl.search(body.name, body.company, body.industry, body.page, u["user_id"]),
    }

@router.post("/byCompany")
async def by_company(body: ByCompanyRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_company(body.company_id, body.page)}


@router.post("/uploadPhoto")
async def upload_photo(
    recruiter_id: int = Form(...),
    photo: UploadFile = File(...),
    u=Depends(get_current_user),
):
    data = await photo.read()
    result = await ctrl.upload_photo_file(
        recruiter_id=recruiter_id,
        actor_id=u["user_id"],
        filename=photo.filename or f"recruiter_photo_{recruiter_id}",
        content_type=photo.content_type or "application/octet-stream",
        data=data,
    )
    return {"success": True, "data": result}


@router.get("/photo/{recruiter_id}")
async def download_photo(recruiter_id: int):
    stream, info = await ctrl.stream_photo_file(recruiter_id)
    content_type = (info.get("metadata") or {}).get("content_type") or "image/jpeg"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=60"},
    )


@router.post("/uploadCover")
async def upload_cover(
    recruiter_id: int = Form(...),
    photo: UploadFile = File(...),
    u=Depends(get_current_user),
):
    data = await photo.read()
    result = await ctrl.upload_cover_file(
        recruiter_id=recruiter_id,
        actor_id=u["user_id"],
        filename=photo.filename or f"recruiter_cover_{recruiter_id}",
        content_type=photo.content_type or "application/octet-stream",
        data=data,
    )
    return {"success": True, "data": result}


@router.get("/cover/{recruiter_id}")
async def download_cover(recruiter_id: int):
    stream, info = await ctrl.stream_cover_file(recruiter_id)
    content_type = (info.get("metadata") or {}).get("content_type") or "image/jpeg"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=60"},
    )


@router.post("/deleteCover")
async def delete_cover(body: GetRecruiterRequest, u=Depends(get_current_user)):
    data = await ctrl.enqueue_delete_cover(body.recruiter_id, u)
    return {"success": True, "data": data}


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id)}
