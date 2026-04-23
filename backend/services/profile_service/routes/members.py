import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from schemas.members import (
    CreateMemberRequest,
    GetMemberRequest,
    UpdateMemberRequest,
    DeleteMemberRequest,
    SearchMembersRequest,
    UploadResumeRequest,
    GetResumeRequest,
)
import controllers.members as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()
log = logging.getLogger("profile_service.uploads")


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


# ── Profile photo (GridFS) ────────────────────────────────────────────────────
@router.post("/uploadPhoto")
async def upload_photo(
    member_id: int = Form(...),
    photo: UploadFile = File(...),
    u=Depends(get_current_user),
):
    log.info(
        "uploadPhoto: member_id=%s actor_id=%s filename=%s content_type=%s",
        member_id,
        u.get("user_id"),
        photo.filename,
        photo.content_type,
    )
    data = await photo.read()
    log.info("uploadPhoto: read %s bytes", len(data))
    try:
        result = await ctrl.upload_photo_file(
            member_id=member_id,
            actor_id=u["user_id"],
            filename=photo.filename or f"photo_{member_id}",
            content_type=photo.content_type or "application/octet-stream",
            data=data,
        )
    except Exception:
        log.exception("uploadPhoto failed for member_id=%s", member_id)
        raise
    log.info("uploadPhoto: success file_id=%s", result.get("profile_photo_file_id"))
    return {"success": True, "data": result}


@router.get("/photo/{member_id}")
async def download_photo(member_id: int):
    stream, info = await ctrl.stream_photo_file(member_id)
    content_type = (info.get("metadata") or {}).get("content_type") or "image/jpeg"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=60"},
    )


# ── Resume (GridFS) ───────────────────────────────────────────────────────────
@router.post("/uploadResumeFile")
async def upload_resume_file(
    member_id: int = Form(...),
    resume: UploadFile = File(...),
    u=Depends(get_current_user),
):
    log.info(
        "uploadResumeFile: member_id=%s actor_id=%s filename=%s content_type=%s",
        member_id,
        u.get("user_id"),
        resume.filename,
        resume.content_type,
    )
    data = await resume.read()
    log.info("uploadResumeFile: read %s bytes", len(data))
    try:
        result = await ctrl.upload_resume_file(
            member_id=member_id,
            actor_id=u["user_id"],
            filename=resume.filename or f"resume_{member_id}",
            content_type=resume.content_type or "application/octet-stream",
            data=data,
        )
    except Exception:
        log.exception("uploadResumeFile failed for member_id=%s", member_id)
        raise
    log.info("uploadResumeFile: success file_id=%s", result.get("resume_file_id"))
    return {"success": True, "data": result}


@router.get("/resume/{member_id}/file")
async def download_resume(member_id: int, u=Depends(get_current_user)):
    stream, _info, meta = await ctrl.stream_resume_file(member_id, u["user_id"])
    content_type = meta.get("resume_content_type") or "application/octet-stream"
    filename = meta.get("resume_file_name") or f"resume_{member_id}"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/resumeMeta")
async def resume_meta(body: GetResumeRequest, u=Depends(get_current_user)):
    meta = await ctrl.get_resume_meta(body.member_id)
    if not meta or not meta.get("resume_file_id"):
        return {"success": True, "data": None}
    return {
        "success": True,
        "data": {
            "member_id": body.member_id,
            "resume_file_id": meta.get("resume_file_id"),
            "resume_file_name": meta.get("resume_file_name"),
            "resume_content_type": meta.get("resume_content_type"),
            "resume_uploaded_at": meta.get("resume_uploaded_at"),
        },
    }


@router.post("/deleteResume")
async def delete_resume(body: GetResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.delete_resume_file(body.member_id, u["user_id"])
    return {"success": True, "data": data}
