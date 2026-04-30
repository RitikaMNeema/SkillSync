from datetime import datetime, timezone

from fastapi import HTTPException

from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.kafka_utils import topics
from shared.utils.idempotency import is_duplicate
from models.command_status import set_command_status
import controllers.jobs as ctrl


def _require(payload: dict, key: str):
    if key not in payload:
        raise ValueError(f"missing payload field: {key}")
    return payload[key]


async def _execute(action: str, actor: dict, payload: dict) -> dict:
    if action == "create":
        return await ctrl.create(_require(payload, "body"), actor["user_id"])
    if action == "update":
        return await ctrl.update(_require(payload, "job_id"), _require(payload, "fields"), actor["user_id"])
    if action == "close":
        return await ctrl.close(_require(payload, "job_id"), actor["user_id"])
    if action == "delete":
        return await ctrl.delete(_require(payload, "job_id"), actor["user_id"])
    if action == "save":
        return await ctrl.save(_require(payload, "member_id"), _require(payload, "job_id"))
    if action == "unsave":
        return await ctrl.unsave(_require(payload, "member_id"), _require(payload, "job_id"))
    if action == "track_view":
        return await ctrl.track_view(_require(payload, "job_id"), payload.get("viewer_id"))
    raise ValueError(f"unsupported action: {action}")


async def start_job_commands_consumer() -> None:
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
            if isinstance(exc, HTTPException):
                detail = exc.detail
                err_msg = detail if isinstance(detail, str) else str(detail)
            else:
                err_msg = str(exc)
            await set_command_status(
                command_id,
                {
                    "command_id": command_id,
                    "status": "failed",
                    "action": action,
                    "error": err_msg,
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            raise

    await start_consumer(
        "job-service-commands",
        [topics.JOB_COMMANDS],
        handler,
    )

