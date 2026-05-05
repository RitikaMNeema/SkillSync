from fastapi import APIRouter, Depends
from schemas.messaging import (
    OpenThreadRequest, ThreadIdRequest, ByUserRequest,
    SendMessageRequest, ListMessagesRequest, MarkReadRequest,
    ThreadPreferenceUpdateRequest, CommandStatusRequest,
)
import controllers.messaging as ctrl
from shared.middleware.auth import get_current_user

threads_router  = APIRouter()
messages_router = APIRouter()


@threads_router.post("/open", status_code=202)
async def open_thread(body: OpenThreadRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_open_thread(body.participant_ids, u)}

@threads_router.post("/get")
async def get_thread(body: ThreadIdRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_thread_meta(body.thread_id, u["user_id"])}

@threads_router.post("/byUser")
async def by_user(body: ByUserRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.by_user(u["user_id"], body.page)}


@threads_router.post("/preferences")
async def by_user_preferences(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.list_thread_preferences(u["user_id"])}


@threads_router.post("/preferences/update", status_code=202)
async def update_preferences(body: ThreadPreferenceUpdateRequest, u=Depends(get_current_user)):
    return {
        "success": True,
        "data": await ctrl.enqueue_update_preferences(
            body.thread_id,
            u,
            starred=body.starred,
            muted=body.muted,
            archived=body.archived,
            force_unread=body.force_unread,
            hidden=body.hidden,
        ),
    }


@messages_router.post("/send", status_code=202)
async def send(body: SendMessageRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_send(body.thread_id, body.text, u)}

@messages_router.post("/list")
async def list_msgs(body: ListMessagesRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.list_msgs(body.thread_id, body.page, u["user_id"])}


@messages_router.post("/unreadCount")
async def unread_count(u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.unread_count_for_user(u["user_id"])}


@messages_router.post("/markRead", status_code=202)
async def mark_read(body: MarkReadRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_mark_read(body.thread_id, u)}


@messages_router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id)}
