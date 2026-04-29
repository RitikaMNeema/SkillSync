from datetime import datetime, timezone

import controllers.auth as ctrl
from models.command_status import set_command_status
from shared.kafka_utils import topics
from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.utils.idempotency import is_duplicate


def _require(payload: dict, key: str):
    if key not in payload:
        raise ValueError(f"missing payload field: {key}")
    return payload[key]


async def _execute(action: str, payload: dict) -> dict:
    if action == "register":
        return await ctrl.register(_require(payload, "email"), _require(payload, "password"), _require(payload, "role"))
    if action == "login":
        return await ctrl.login(_require(payload, "email"), _require(payload, "password"))
    if action == "logout":
        return await ctrl.logout(_require(payload, "token"))
    raise ValueError(f"unsupported action: {action}")


async def start_auth_commands_consumer() -> None:
    async def handler(topic, partition, envelope):
        validate_event_envelope(envelope, topic)
        if await is_duplicate(envelope["idempotency_key"]):
            return

        evt_payload = envelope.get("payload") or {}
        command_id = _require(evt_payload, "command_id")
        action = _require(evt_payload, "action")
        payload = _require(evt_payload, "payload")

        await set_command_status(command_id, {"command_id": command_id, "status": "processing", "action": action, "started_at": datetime.now(timezone.utc).isoformat()})
        try:
            result = await _execute(action, payload)
            await set_command_status(command_id, {"command_id": command_id, "status": "completed", "action": action, "result": result, "completed_at": datetime.now(timezone.utc).isoformat()})
        except Exception as exc:
            await set_command_status(command_id, {"command_id": command_id, "status": "failed", "action": action, "error": str(exc), "failed_at": datetime.now(timezone.utc).isoformat()})
            raise

    await start_consumer("auth-service-commands", [topics.AUTH_COMMANDS], handler)

