from datetime import datetime, timezone

from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.kafka_utils import topics
from shared.utils.idempotency import is_duplicate
from models.command_status import set_command_status
import controllers.applications as ctrl


def _require(payload: dict, key: str):
    if key not in payload:
        raise ValueError(f"missing payload field: {key}")
    return payload[key]


async def _execute(action: str, actor: dict, payload: dict) -> dict:
    if action == "submit":
        return await ctrl.submit(
            _require(payload, "job_id"),
            _require(payload, "member_id"),
            payload.get("resume_url"),
            payload.get("cover_letter"),
            payload.get("answers"),
            actor,
        )
    if action == "update_status":
        return await ctrl.update_app_status(
            _require(payload, "application_id"),
            _require(payload, "new_status"),
            actor["user_id"],
        )
    if action == "withdraw":
        return await ctrl.withdraw(
            _require(payload, "application_id"),
            actor["user_id"],
        )
    if action == "add_note":
        return await ctrl.add_recruiter_note(
            _require(payload, "application_id"),
            _require(payload, "recruiter_id"),
            _require(payload, "note_text"),
            actor,
        )
    raise ValueError(f"unsupported action: {action}")


async def start_application_commands_consumer() -> None:
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
            {
                "command_id": command_id,
                "status": "processing",
                "action": action,
                "started_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        try:
            result = await _execute(action, actor, payload)
            await set_command_status(
                command_id,
                {
                    "command_id": command_id,
                    "status": "completed",
                    "action": action,
                    "result": result,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as exc:
            await set_command_status(
                command_id,
                {
                    "command_id": command_id,
                    "status": "failed",
                    "action": action,
                    "error": str(exc),
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            raise

    await start_consumer(
        "application-service-commands",
        [topics.APPLICATION_COMMANDS],
        handler,
    )

