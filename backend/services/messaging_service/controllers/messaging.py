import asyncio
from fastapi import HTTPException
from models.thread import (
    find_thread_by_participants, create_thread, get_thread,
    threads_by_user, update_last_message_at, PAGE_SIZE,
)
from models.message import create_message, list_messages, mark_read
from producers.message_producer import emit_message_sent
from websocket_hub import hub

MAX_RETRIES   = 3
RETRY_BASE_MS = 0.2


async def _send_with_retry(thread_id, sender_id, text, attempt=1) -> dict:
    try:
        return await create_message(thread_id, sender_id, text)
    except Exception as exc:
        if attempt >= MAX_RETRIES:
            raise
        await asyncio.sleep(RETRY_BASE_MS * (2 ** (attempt - 1)))
        return await _send_with_retry(thread_id, sender_id, text, attempt + 1)


async def _best_effort_retry(op, attempt=1) -> bool:
    try:
        await op()
        return True
    except Exception:
        if attempt >= MAX_RETRIES:
            return False
        await asyncio.sleep(RETRY_BASE_MS * (2 ** (attempt - 1)))
        return await _best_effort_retry(op, attempt + 1)


async def open_thread(participant_ids: list) -> dict:
    if len(participant_ids) < 2:
        raise HTTPException(400, "Need at least 2 participants")
    existing = await find_thread_by_participants(participant_ids)
    if existing:
        return existing
    return await create_thread(participant_ids)


async def get_thread_meta(thread_id: str) -> dict:
    t = await get_thread(thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    return t


async def by_user(user_id, page: int) -> dict:
    threads, total = await threads_by_user(user_id, page)
    return {"threads": threads, "total": total, "page": page, "page_size": PAGE_SIZE}


async def send(thread_id: str, sender_id, text: str) -> dict:
    thread = await get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    if str(sender_id) not in thread["participant_ids"]:
        raise HTTPException(403, "Sender is not a participant")
    msg = await _send_with_retry(thread_id, sender_id, text)
    await update_last_message_at(thread_id, msg["timestamp"])
    realtime_payload = {
        "event": "message.created",
        "data": {
            **msg,
            "timestamp": msg["timestamp"].isoformat() if hasattr(msg["timestamp"], "isoformat") else msg["timestamp"],
        },
    }

    kafka_ok = await _best_effort_retry(lambda: emit_message_sent(sender_id, msg["message_id"], thread_id))
    realtime_ok = await _best_effort_retry(lambda: hub.broadcast(thread_id, realtime_payload))

    return {
        **msg,
        "delivery_status": {
            "kafka": "sent" if kafka_ok else "failed",
            "realtime": "sent" if realtime_ok else "failed",
        },
    }


async def list_msgs(thread_id: str, page: int) -> dict:
    if not await get_thread(thread_id):
        raise HTTPException(404, "Thread not found")
    messages, total = await list_messages(thread_id, page)
    return {"messages": messages, "total": total, "page": page, "page_size": PAGE_SIZE}


async def mark_messages_read(thread_id: str, user_id) -> dict:
    if not await get_thread(thread_id):
        raise HTTPException(404, "Thread not found")
    updated = await mark_read(thread_id, user_id)
    return {"thread_id": thread_id, "messages_marked_read": updated}
