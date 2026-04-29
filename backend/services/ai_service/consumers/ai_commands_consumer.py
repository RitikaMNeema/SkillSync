from datetime import datetime, timezone

from controllers.agent_controller import AgentController
from controllers.match_controller import compute_match
from controllers.outreach_controller import generate_outreach
from controllers.parser_controller import parse_profile
from models.command_status import set_command_status
from schemas.ai import AIMatchRequest, ApprovalRequest, AgentWorkflowRequest, OutreachDraftRequest, ResumeParseRequest
from shared.kafka_utils import topics
from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.utils.idempotency import is_duplicate


def _require(payload: dict, key: str):
    if key not in payload:
        raise ValueError(f"missing payload field: {key}")
    return payload[key]


async def _execute(action: str, payload: dict, agent_controller: AgentController) -> dict:
    if action == "parse_profile":
        return await parse_profile(ResumeParseRequest(**payload))
    if action == "match":
        return await compute_match(AIMatchRequest(**payload))
    if action == "outreach_draft":
        req = OutreachDraftRequest(**payload)
        fake_match = {"matched_skills": req.candidate.skills[:5], "match_score": 75.0}
        return await generate_outreach(req, fake_match)
    if action == "agent_request":
        return await agent_controller.submit_workflow(AgentWorkflowRequest(**payload))
    if action == "agent_approve":
        approval = ApprovalRequest(**payload)
        return await agent_controller.approve(approval)
    raise ValueError(f"unsupported action: {action}")


async def start_ai_commands_consumer(agent_controller: AgentController) -> None:
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
            result = await _execute(action, payload, agent_controller)
            await set_command_status(command_id, {"command_id": command_id, "status": "completed", "action": action, "result": result, "completed_at": datetime.now(timezone.utc).isoformat()})
        except Exception as exc:
            await set_command_status(command_id, {"command_id": command_id, "status": "failed", "action": action, "error": str(exc), "failed_at": datetime.now(timezone.utc).isoformat()})
            raise

    await start_consumer("ai-service-commands", [topics.AI_COMMANDS], handler)

