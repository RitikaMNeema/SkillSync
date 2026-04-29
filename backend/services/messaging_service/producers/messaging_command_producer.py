import uuid
from datetime import datetime, timezone

from shared.kafka_utils import topics
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils.producer import publish_event
from models.command_status import set_command_status


async def enqueue_messaging_command(action: str, actor: dict, payload: dict) -> dict:
    command_id = str(uuid.uuid4())
    envelope = build_envelope(
        event_type=topics.MESSAGING_COMMANDS,
        actor_id=str(actor["user_id"]),
        entity_type="messaging_command",
        entity_id=command_id,
        payload={
            "command_id": command_id,
            "action": action,
            "actor": {"user_id": str(actor["user_id"]), "role": actor.get("role")},
            "payload": payload,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        },
        idempotency_key=f"messaging.command:{command_id}",
        schema_ref="com.skillsync.messaging.command.v1",
    )
    await set_command_status(command_id, {"command_id": command_id, "status": "queued", "action": action})
    await publish_event(topics.MESSAGING_COMMANDS, envelope)
    return {"command_id": command_id, "status": "queued", "action": action}

