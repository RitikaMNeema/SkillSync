from bson import ObjectId
from bson.decimal128 import Decimal128
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

import controllers.posts as ctrl
from schemas.posts import (
    CreatePostRequest, FeedPostsRequest, MemberPostsRequest,
    LikePostRequest, CreateCommentRequest, ListCommentsRequest,
    DeletePostRequest, CommandStatusRequest,
)
from shared.middleware.auth import get_current_user
from models.post_media_mongo import open_image

router = APIRouter()

_json_custom = {
    ObjectId: str,
    Decimal128: lambda d: str(d),
}


def _json(data):
    return jsonable_encoder(data, custom_encoder=_json_custom)


@router.post("/create", status_code=201)
async def create(body: CreatePostRequest, u=Depends(get_current_user)):
    # Synchronous publish: avoids Kafka/consumer lag and stale-worker "Member not found" failures for recruiters.
    return {"success": True, "data": _json(await ctrl.create(body.model_dump(), int(u["user_id"])))}


@router.post("/feed")
async def feed(body: FeedPostsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": _json(await ctrl.feed(body.page, u["user_id"]))}


@router.post("/byMember")
async def by_member(body: MemberPostsRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": _json(await ctrl.by_member(body.member_id, body.page, u["user_id"])),
    }


@router.post("/like", status_code=202)
async def like(body: LikePostRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": _json(await ctrl.enqueue_like(body.post_id, body.member_id, u)),
    }


@router.post("/comment", status_code=202)
async def comment(body: CreateCommentRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": _json(await ctrl.enqueue_comment(body.post_id, body.member_id, body.content, u)),
    }


@router.post("/comments")
async def comments(body: ListCommentsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": _json(await ctrl.comments(body.post_id, body.page))}


@router.post("/upload-image", status_code=201)
async def upload_image(file: UploadFile = File(...), u=Depends(get_current_user)):
    return {"success": True, "data": _json(await ctrl.upload(file))}


@router.get("/image/{image_id}")
async def get_image(image_id: str):
    try:
        stream, content_type = await open_image(image_id)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(404, "Image not found")

    async def iterator():
        while True:
            chunk = await stream.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(iterator(), media_type=content_type)

@router.post("/delete")
async def delete(body: DeletePostRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": _json(await ctrl.enqueue_delete(body.post_id, body.member_id, u)),
    }


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    from controllers.members import get_command
    return {"success": True, "data": _json(await get_command(body.command_id))}