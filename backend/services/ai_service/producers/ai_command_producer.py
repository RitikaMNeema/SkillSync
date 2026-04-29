import uuid
from datetime import datetime, timezone

from models.command_status import set_command_status
from shared.kafka_utils import topics
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils.producer import publish_event


async def enqueue_ai_command(action: str, actor_id: str, payload: dict) -> dict:
    command_id = str(uuid.uuid4())
    envelope = build_envelope(
        event_type=topics.AI_COMMANDS,
        actor_id=actor_id,
        entity_type="ai_command",
        entity_id=command_id,
        payload={
            "command_id": command_id,
            "action": action,
            "payload": payload,
            "queued_at": datetime.now(timezone.utc).isoformat(),
        },
        idempotency_key=f"ai.command:{command_id}",
        schema_ref="com.skillsync.ai.command.v1",
    )
    await set_command_status(command_id, {"command_id": command_id, "status": "queued", "action": action})
    await publish_event(topics.AI_COMMANDS, envelope)
    return {"command_id": command_id, "status": "queued", "action": action}

