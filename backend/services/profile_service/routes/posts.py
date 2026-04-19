from fastapi import APIRouter, Depends

import controllers.posts as ctrl
from schemas.posts import CreatePostRequest, FeedPostsRequest, MemberPostsRequest
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/create", status_code=201)
async def create(body: CreatePostRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.create(body.model_dump())}


@router.post("/feed")
async def feed(body: FeedPostsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.feed(body.page)}


@router.post("/byMember")
async def by_member(body: MemberPostsRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_member(body.member_id, body.page)}
