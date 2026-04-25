from fastapi import APIRouter, Depends
from services.connection_service.schemas.connections import RequestBody, RequestIdBody, UserIdBody, MutualBody, RemoveBody
from services.connection_service.controllers import connections as ctrl
from shared.middleware.auth import get_current_user

router = APIRouter()


@router.post("/request", status_code=201)
async def request(body: RequestBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.request(body.requester_id, body.receiver_id)}

@router.post("/accept")
async def accept(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.accept(body.request_id)}

@router.post("/reject")
async def reject(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.reject(body.request_id)}

@router.post("/withdraw")
async def withdraw(body: RequestIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.withdraw(body.request_id)}

@router.post("/list")
async def list_connections(body: UserIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.list_connections(body.user_id)}

@router.post("/pending")
async def pending(body: UserIdBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.pending(body.user_id)}

@router.post("/mutual")
async def mutual(body: MutualBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.mutual(body.user_id_1, body.user_id_2)}

@router.post("/remove")
async def remove(body: RemoveBody, u=Depends(get_current_user)):
    return {"success": True, "data": await ctrl.remove(body.user_id_1, body.user_id_2)}

@router.post("/connected-ids")
async def get_connected_ids(body: UserIdBody, u=Depends(get_current_user)):
    """Return list of user IDs that the given user is connected to."""
    connections = await ctrl.get_user_connections(body.user_id)
    connected_ids = [conn[2] for conn in connections]
    return {"success": True, "data": {"connected_ids": connected_ids}}