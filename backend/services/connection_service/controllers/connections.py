from fastapi import HTTPException
from ..models.connection import (
    find_request, find_request_by_id, create_request, update_request_status,
    get_pending_requests, connection_exists, accept_connection_transaction,
    remove_connection_transaction, get_user_connections, get_mutual_connections,
)
from ..producers.connection_producer import (
    emit_connection_requested,
    emit_connection_accepted,
    emit_connection_removed,
)
from ..producers.connection_command_producer import enqueue_connection_command
from ..models.command_status import get_command_status
from shared.redis_utils.cache import cache_get, cache_set, cache_del

CONN_TTL = 120


def _conn_key(uid): return f"connections:{uid}"


async def request(requester_id, receiver_id) -> dict:
    if requester_id == receiver_id:
        raise HTTPException(400, "Cannot connect with yourself")
    existing = await find_request(requester_id, receiver_id)
    if existing:
        if existing["status"] == "pending":
            raise HTTPException(409, "Connection request already pending")
        if existing["status"] == "accepted":
            raise HTTPException(409, "Already connected")
    if await connection_exists(requester_id, receiver_id):
        raise HTTPException(409, "Already connected")
    rid = await create_request(requester_id, receiver_id)
    await emit_connection_requested(requester_id, rid, receiver_id)
    return {"request_id": rid, "status": "pending"}


async def accept(request_id) -> dict:
    req = await find_request_by_id(request_id)
    if not req:
        raise HTTPException(404, "Connection request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    await accept_connection_transaction(req["requester_id"], req["receiver_id"], request_id)
    await cache_del(_conn_key(req["requester_id"]))
    await cache_del(_conn_key(req["receiver_id"]))
    await emit_connection_accepted(req["receiver_id"], request_id, req["requester_id"], req["receiver_id"])
    return {"request_id": request_id, "status": "accepted"}


async def reject(request_id) -> dict:
    req = await find_request_by_id(request_id)
    if not req:
        raise HTTPException(404, "Connection request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    await update_request_status(request_id, "rejected")
    return {"request_id": request_id, "status": "rejected"}


async def withdraw(request_id) -> dict:
    req = await find_request_by_id(request_id)
    if not req:
        raise HTTPException(404, "Connection request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Cannot withdraw a request that is {req['status']}")
    await update_request_status(request_id, "withdrawn")
    return {"request_id": request_id, "status": "withdrawn"}


async def list_connections(user_id) -> list:
    cached = await cache_get(_conn_key(user_id))
    if cached:
        return cached
    conns = await get_user_connections(user_id)
    await cache_set(_conn_key(user_id), conns, CONN_TTL)
    return conns


async def pending(user_id) -> list:
    return await get_pending_requests(user_id)


async def mutual(uid1, uid2) -> dict:
    if uid1 == uid2:
        raise HTTPException(400, "user_id_1 and user_id_2 must differ")
    result = await get_mutual_connections(uid1, uid2)
    return {"mutual_connections": result, "count": len(result)}


async def remove(uid1, uid2) -> dict:
    if not await connection_exists(uid1, uid2):
        raise HTTPException(404, "Connection does not exist")
    await remove_connection_transaction(uid1, uid2)
    await cache_del(_conn_key(uid1))
    await cache_del(_conn_key(uid2))
    await emit_connection_removed(uid1, uid1, uid2)
    return {"removed": True}


async def enqueue_request(requester_id: int, receiver_id: int, actor: dict) -> dict:
    if actor.get("role") != "member" or str(actor["user_id"]) != str(requester_id):
        raise HTTPException(403, "Members may only create requests for themselves")
    return await enqueue_connection_command(
        "request",
        actor,
        {"requester_id": requester_id, "receiver_id": receiver_id},
    )


async def enqueue_accept(request_id: int, actor: dict) -> dict:
    if actor.get("role") != "member":
        raise HTTPException(403, "Only members can accept requests")
    return await enqueue_connection_command(
        "accept",
        actor,
        {"request_id": request_id},
    )


async def enqueue_reject(request_id: int, actor: dict) -> dict:
    if actor.get("role") != "member":
        raise HTTPException(403, "Only members can reject requests")
    return await enqueue_connection_command(
        "reject",
        actor,
        {"request_id": request_id},
    )


async def enqueue_withdraw(request_id: int, actor: dict) -> dict:
    if actor.get("role") != "member":
        raise HTTPException(403, "Only members can withdraw requests")
    return await enqueue_connection_command(
        "withdraw",
        actor,
        {"request_id": request_id},
    )


async def enqueue_remove(uid1: int, uid2: int, actor: dict) -> dict:
    if actor.get("role") != "member":
        raise HTTPException(403, "Only members can remove connections")
    if str(actor["user_id"]) not in {str(uid1), str(uid2)}:
        raise HTTPException(403, "Cannot remove someone else's connection")
    return await enqueue_connection_command(
        "remove",
        actor,
        {"user_id_1": uid1, "user_id_2": uid2},
    )


async def get_command(command_id: str, actor: dict) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    return status