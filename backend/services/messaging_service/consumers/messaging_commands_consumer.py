from datetime import datetime, timezone

import controllers.messaging as ctrl
from models.command_status import set_command_status
from shared.kafka_utils import topics
from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.utils.idempotency import is_duplicate


def _require(payload: dict, key: str):
    if key not in payload:
        raise ValueError(f"missing payload field: {key}")
    return payload[key]


async def _execute(action: str, actor: dict, payload: dict) -> dict:
    if action == "open_thread":
        return await ctrl.open_thread(_require(payload, "participant_ids"))
    if action == "send":
        return await ctrl.send(_require(payload, "thread_id"), actor["user_id"], _require(payload, "text"))
    if action == "mark_read":
        return await ctrl.mark_messages_read(_require(payload, "thread_id"), actor["user_id"])
    if action == "update_preferences":
        return await ctrl.update_thread_preferences(
            _require(payload, "thread_id"),
            actor["user_id"],
            starred=payload.get("starred"),
            muted=payload.get("muted"),
            archived=payload.get("archived"),
            force_unread=payload.get("force_unread"),
            hidden=payload.get("hidden"),
        )
    raise ValueError(f"unsupported action: {action}")


async def start_messaging_commands_consumer() -> None:
    async def handler(topic, partition, envelope):
        validate_event_envelope(envelope, topic)
        if await is_duplicate(envelope["idempotency_key"]):
            return

        evt_payload = envelope.get("payload") or {}
        command_id = _require(evt_payload, "command_id")
        action = _require(evt_payload, "action")
        actor = _require(evt_payload, "actor")
        payload = _require(evt_payload, "payload")

        await set_command_status(
            command_id,
            {"command_id": command_id, "status": "processing", "action": action, "started_at": datetime.now(timezone.utc).isoformat()},
        )
        try:
            result = await _execute(action, actor, payload)
            await set_command_status(
                command_id,
                {"command_id": command_id, "status": "completed", "action": action, "result": result, "completed_at": datetime.now(timezone.utc).isoformat()},
            )
        except Exception as exc:
            await set_command_status(
                command_id,
                {"command_id": command_id, "status": "failed", "action": action, "error": str(exc), "failed_at": datetime.now(timezone.utc).isoformat()},
            )
            raise

    await start_consumer("messaging-service-commands", [topics.MESSAGING_COMMANDS], handler)

