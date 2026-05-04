import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from schemas.members import (
    CreateMemberRequest,
    GetMemberRequest,
    RecordProfileViewRequest,
    UpdateMemberRequest,
    DeleteMemberRequest,
    SearchMembersRequest,
    UploadResumeRequest,
    GetResumeRequest,
    CommandStatusRequest,
)
import controllers.members as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()
log = logging.getLogger("profile_service.uploads")


def _effective_resume_upload_content_type(upload: UploadFile) -> str:
    """Multipart parts often omit Content-Type or send application/octet-stream; infer from filename."""
    raw = (upload.content_type or "").strip()
    base = raw.split(";", 1)[0].strip().lower() if raw else ""
    name = (upload.filename or "").lower()
    if base and base != "application/octet-stream":
        return raw
    if name.endswith((".html", ".htm")):
        return "text/html; charset=utf-8"
    if name.endswith(".txt"):
        return "text/plain; charset=utf-8"
    if name.endswith(".pdf"):
        return "application/pdf"
    if name.endswith(".docx"):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return raw or "application/octet-stream"


@router.post("/create", status_code=202)
async def create(body: CreateMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.enqueue_create(body.model_dump(), u)
    return {"success": True, "data": data}


@router.post("/get")
async def get(body: GetMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.get(body.member_id, u["user_id"])
    return {"success": True, "data": data}


@router.post("/recordProfileView")
async def record_profile_view(body: RecordProfileViewRequest, u=Depends(get_current_user)):
    data = await ctrl.record_profile_view(int(u["user_id"]), body.member_id)
    return {"success": True, "data": data}


@router.post("/update")
async def update(body: UpdateMemberRequest, u=Depends(get_current_user)):
    # Do not use exclude_none=True: nested experience/education entries must keep
    # explicit nulls/keys so dates are not dropped before persistence.
    payload = body.model_dump(exclude_none=False)
    # So Mongo `followed_skills` is only updated when the client sends that key (Pydantic v2).
    payload["__pydantic_fields_set__"] = set(body.model_fields_set)
    data = await ctrl.enqueue_update(payload, u)
    return {"success": True, "data": data}


@router.post("/delete", status_code=202)
async def delete(body: DeleteMemberRequest, u=Depends(get_current_user)):
    data = await ctrl.enqueue_delete(body.member_id, u)
    return {"success": True, "data": data}


@router.post("/search")
async def search(body: SearchMembersRequest, u=Depends(get_current_user)):
    data = await ctrl.search(body.keyword, body.skill, body.location, body.page, u["user_id"])
    return {"success": True, "data": data}


@router.post("/uploadResume", status_code=202)
async def upload_resume(body: UploadResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.enqueue_upload_resume(body.member_id, body.resume_url, u)
    return {"success": True, "data": data}


@router.post("/getResume")
async def get_resume(body: GetResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.get_resume(body.member_id, u)
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


@router.post("/uploadCover")
async def upload_cover(
    member_id: int = Form(...),
    photo: UploadFile = File(...),
    u=Depends(get_current_user),
):
    log.info(
        "uploadCover: member_id=%s actor_id=%s filename=%s content_type=%s",
        member_id,
        u.get("user_id"),
        photo.filename,
        photo.content_type,
    )
    data = await photo.read()
    result = await ctrl.upload_cover_file(
        member_id=member_id,
        actor_id=u["user_id"],
        filename=photo.filename or f"cover_{member_id}",
        content_type=photo.content_type or "application/octet-stream",
        data=data,
    )
    return {"success": True, "data": result}


@router.get("/cover/{member_id}")
async def download_cover(member_id: int):
    stream, info = await ctrl.stream_cover_file(member_id)
    content_type = (info.get("metadata") or {}).get("content_type") or "image/jpeg"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=60"},
    )


@router.post("/deleteCover")
async def delete_cover(body: GetResumeRequest, u=Depends(get_current_user)):
    data = await ctrl.delete_cover_file(body.member_id, u["user_id"])
    return {"success": True, "data": data}


# ── Resume (GridFS) ───────────────────────────────────────────────────────────
@router.post("/uploadResumeFile")
async def upload_resume_file(
    member_id: int = Form(...),
    resume: UploadFile = File(...),
    u=Depends(get_current_user),
):
    resolved_ct = _effective_resume_upload_content_type(resume)
    log.info(
        "uploadResumeFile: member_id=%s actor_id=%s filename=%s content_type=%s resolved=%s",
        member_id,
        u.get("user_id"),
        resume.filename,
        resume.content_type,
        resolved_ct,
    )
    data = await resume.read()
    log.info("uploadResumeFile: read %s bytes", len(data))
    try:
        result = await ctrl.upload_resume_file(
            member_id=member_id,
            actor_id=u["user_id"],
            filename=resume.filename or f"resume_{member_id}",
            content_type=resolved_ct,
            data=data,
        )
    except Exception:
        log.exception("uploadResumeFile failed for member_id=%s", member_id)
        raise
    log.info("uploadResumeFile: success file_id=%s", result.get("resume_file_id"))
    return {"success": True, "data": result}


@router.get("/resume/{member_id}/file")
async def download_resume(member_id: int, u=Depends(get_current_user)):
    stream, _info, meta = await ctrl.stream_resume_file(member_id, u)
    content_type = meta.get("resume_content_type") or "application/octet-stream"
    filename = meta.get("resume_file_name") or f"resume_{member_id}"
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/resumeMeta")
async def resume_meta(body: GetResumeRequest, u=Depends(get_current_user)):
    meta = await ctrl.get_resume_meta(body.member_id, u)
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


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id)}
