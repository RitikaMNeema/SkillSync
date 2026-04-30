from fastapi import APIRouter, Depends
from services.connection_service.schemas.connections import (
    RequestBody,
    RequestIdBody,
    UserIdBody,
    MutualBody,
    RemoveBody,
    BlockBody,
    CommandStatusRequest,
)
from services.connection_service.controllers import connections as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/request", status_code=202)
async def request(body: RequestBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_request(body.requester_id, body.receiver_id, u)}

@router.post("/accept", status_code=202)
async def accept(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_accept(body.request_id, u)}

@router.post("/reject", status_code=202)
async def reject(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_reject(body.request_id, u)}

@router.post("/withdraw", status_code=202)
async def withdraw(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_withdraw(body.request_id, u)}

@router.post("/list")
async def list_connections(body: UserIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.list_connections(body.user_id)}

@router.post("/pending")
async def pending(body: UserIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.pending(body.user_id)}

@router.post("/mutual")
async def mutual(body: MutualBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.mutual(body.user_id_1, body.user_id_2)}

@router.post("/remove", status_code=202)
async def remove(body: RemoveBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.enqueue_remove(body.user_id_1, body.user_id_2, u)}


@router.post("/block")
async def block(body: BlockBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.block(body.blocker_id, body.blocked_id, u)}

@router.post("/connected-ids")
async def get_connected_ids(body: UserIdBody, u=Depends(get_current_user)):
    """Return list of user IDs that the given user is connected to."""
    connections = await ctrl.get_user_connections(body.user_id)
    connected_ids = [conn[2] for conn in connections]
    return {"success": True, "data": {"connected_ids": connected_ids}}


@router.post("/commandStatus")
async def command_status(body: CommandStatusRequest, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.get_command(body.command_id, u)}