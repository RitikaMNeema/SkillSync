from fastapi import HTTPException
from models.connection import (
    find_request, find_request_by_id, create_request, update_request_status,
    get_pending_requests, connection_exists, accept_connection_transaction,
    remove_connection_transaction, get_user_connections, get_mutual_connections,
)
from producers.connection_producer import emit_connection_requested, emit_connection_accepted
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
    await emit_connection_accepted(req["receiver_id"], request_id, req["requester_id"])
    return {"request_id": request_id, "status": "accepted"}


async def reject(request_id) -> dict:
    req = await find_request_by_id(request_id)
    if not req:
        raise HTTPException(404, "Connection request not found")
    if req["status"] != "pending":
        raise HTTPException(400, f"Request already {req['status']}")
    await update_request_status(request_id, "rejected")
    return {"request_id": request_id, "status": "rejected"}


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
    return {"removed": True}
