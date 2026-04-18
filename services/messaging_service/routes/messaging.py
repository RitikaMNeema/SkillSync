from fastapi import APIRouter, Depends
from schemas.messaging import (
    OpenThreadRequest, ThreadIdRequest, ByUserRequest,
    SendMessageRequest, ListMessagesRequest, MarkReadRequest,
)
import controllers.messaging as ctrl
from shared.middleware.auth import get_current_user

threads_router  = APIRouter()
messages_router = APIRouter()


@threads_router.post("/open", status_code=201)
async def open_thread(body: OpenThreadRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.open_thread(body.participant_ids)}

@threads_router.post("/get")
async def get_thread(body: ThreadIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_thread_meta(body.thread_id)}

@threads_router.post("/byUser")
async def by_user(body: ByUserRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_user(body.user_id, body.page)}


@messages_router.post("/send", status_code=201)
async def send(body: SendMessageRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.send(body.thread_id, body.sender_id, body.text)}

@messages_router.post("/list")
async def list_msgs(body: ListMessagesRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.list_msgs(body.thread_id, body.page)}

@messages_router.post("/markRead")
async def mark_read(body: MarkReadRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.mark_messages_read(body.thread_id, body.user_id)}
