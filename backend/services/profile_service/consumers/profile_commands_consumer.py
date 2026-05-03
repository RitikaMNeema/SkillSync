from datetime import datetime, timezone

from starlette.exceptions import HTTPException as StarletteHTTPException

import controllers.members as members_ctrl
import controllers.posts as posts_ctrl
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
    actor_id = int(actor["user_id"])
    if action == "member_create":
        return await members_ctrl.create(_require(payload, "body"), actor_id)
    if action == "member_update":
        return await members_ctrl.update(_require(payload, "body"), actor_id)
    if action == "member_delete":
        return await members_ctrl.delete(_require(payload, "member_id"))
    if action == "member_upload_resume":
        return await members_ctrl.upload_resume(_require(payload, "member_id"), _require(payload, "resume_url"))
    if action == "post_create":
        return await posts_ctrl.create(_require(payload, "body"), actor_id)
    if action == "post_like":
        return await posts_ctrl.like(_require(payload, "post_id"), _require(payload, "member_id"), actor_id)
    if action == "post_comment":
        return await posts_ctrl.comment(
            _require(payload, "post_id"),
            _require(payload, "member_id"),
            _require(payload, "content"),
            actor_id,
        )
    if action == "post_delete":
        return await posts_ctrl.delete(_require(payload, "post_id"), _require(payload, "member_id"), actor_id)
    raise ValueError(f"unsupported action: {action}")


async def start_profile_commands_consumer() -> None:
    async def handler(topic, partition, envelope):
        validate_event_envelope(envelope, topic)
        if await is_duplicate(envelope["idempotency_key"]):
            return

        evt_payload = envelope.get("payload") or {}
        command_id = _require(evt_payload, "command_id")
        action = _require(evt_payload, "action")
        actor = _require(evt_payload, "actor")
        payload = _require(evt_payload, "payload")

        await set_command_status(command_id, {"command_id": command_id, "status": "processing", "action": action, "started_at": datetime.now(timezone.utc).isoformat()})
        try:
            result = await _execute(action, actor, payload)
            await set_command_status(command_id, {"command_id": command_id, "status": "completed", "action": action, "result": result, "completed_at": datetime.now(timezone.utc).isoformat()})
        except StarletteHTTPException as exc:
            detail = exc.detail
            msg = detail if isinstance(detail, str) else str(exc)
            await set_command_status(command_id, {"command_id": command_id, "status": "failed", "action": action, "error": msg, "failed_at": datetime.now(timezone.utc).isoformat()})
            raise
        except Exception as exc:
            await set_command_status(command_id, {"command_id": command_id, "status": "failed", "action": action, "error": str(exc), "failed_at": datetime.now(timezone.utc).isoformat()})
            raise

    await start_consumer("profile-service-commands", [topics.PROFILE_COMMANDS], handler)

