import asyncio
from fastapi import HTTPException
from models.thread import (
    find_thread_by_participants, create_thread, get_thread,
    threads_by_user, update_last_message_at, PAGE_SIZE,
)
from models.message import (
    create_message,
    list_messages,
    mark_read,
    count_unread_messages_for_user,
    serialize_message,
)
from models.thread_preferences import get_preferences_for_user, upsert_preferences
from producers.message_producer import emit_message_sent
from websocket_hub import hub
from producers.messaging_command_producer import enqueue_messaging_command
from models.command_status import get_command_status

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


async def get_thread_meta(thread_id: str, user_id) -> dict:
    t = await get_thread(thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    if str(user_id) not in t.get("participant_ids", []):
        raise HTTPException(403, "Not a participant in this thread")
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
    msg_out = serialize_message(msg)
    realtime_payload = {
        "event": "message.created",
        "data": msg_out,
    }

    kafka_ok = await _best_effort_retry(lambda: emit_message_sent(sender_id, msg["message_id"], thread_id))
    realtime_ok = await _best_effort_retry(lambda: hub.broadcast(thread_id, realtime_payload))

    return {
        **msg_out,
        "delivery_status": {
            "kafka": "sent" if kafka_ok else "failed",
            "realtime": "sent" if realtime_ok else "failed",
        },
    }


async def unread_count_for_user(user_id) -> dict:
    n = await count_unread_messages_for_user(user_id)
    return {"unread_count": int(n)}


async def list_msgs(thread_id: str, page: int, user_id) -> dict:
    thread = await get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    if str(user_id) not in thread.get("participant_ids", []):
        raise HTTPException(403, "Not a participant in this thread")
    messages, total = await list_messages(thread_id, page)
    return {"messages": messages, "total": total, "page": page, "page_size": PAGE_SIZE}


async def mark_messages_read(thread_id: str, user_id) -> dict:
    thread = await get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    if str(user_id) not in thread.get("participant_ids", []):
        raise HTTPException(403, "Not a participant in this thread")
    updated = await mark_read(thread_id, user_id)
    return {"thread_id": thread_id, "messages_marked_read": updated}


async def list_thread_preferences(user_id) -> dict:
    preferences = await get_preferences_for_user(user_id)
    return {"preferences": preferences}


async def update_thread_preferences(
    thread_id: str,
    user_id,
    *,
    starred: bool | None = None,
    muted: bool | None = None,
    archived: bool | None = None,
    force_unread: bool | None = None,
    hidden: bool | None = None,
) -> dict:
    thread = await get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    if str(user_id) not in thread.get("participant_ids", []):
        raise HTTPException(403, "Not a participant in this thread")
    updated = await upsert_preferences(
        thread_id,
        user_id,
        starred=starred,
        muted=muted,
        archived=archived,
        force_unread=force_unread,
        hidden=hidden,
    )
    return updated


async def enqueue_open_thread(participant_ids: list[int], actor: dict) -> dict:
    if int(actor["user_id"]) not in participant_ids:
        raise HTTPException(403, "Requester must be a participant")
    return await enqueue_messaging_command(
        "open_thread",
        actor,
        {"participant_ids": participant_ids},
    )


async def enqueue_send(thread_id: str, text: str, actor: dict) -> dict:
    return await enqueue_messaging_command("send", actor, {"thread_id": thread_id, "text": text})


async def enqueue_mark_read(thread_id: str, actor: dict) -> dict:
    return await enqueue_messaging_command("mark_read", actor, {"thread_id": thread_id})


async def enqueue_update_preferences(
    thread_id: str,
    actor: dict,
    *,
    starred: bool | None = None,
    muted: bool | None = None,
    archived: bool | None = None,
    force_unread: bool | None = None,
    hidden: bool | None = None,
) -> dict:
    return await enqueue_messaging_command(
        "update_preferences",
        actor,
        {
            "thread_id": thread_id,
            "starred": starred,
            "muted": muted,
            "archived": archived,
            "force_unread": force_unread,
            "hidden": hidden,
        },
    )


async def get_command(command_id: str) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    return status
