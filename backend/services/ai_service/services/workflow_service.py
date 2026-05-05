import asyncio
import uuid
from typing import Any, Dict

from controllers.match_controller import compute_match
from controllers.outreach_controller import OUTREACH_MIN_MATCH_SCORE, generate_outreach
from controllers.parser_controller import parse_profile
from models.ai_trace import AITrace, StepResult
from schemas.ai import (
    AIMatchRequest,
    AgentWorkflowRequest,
    OutreachDraftRequest,
    ResumeParseRequest,
)
from services.in_memory_store import TraceStore
from services.kafka_bus import KafkaBus
from shared.kafka_utils.ai_topics import (
    AI_EVENT_APPROVAL_REQUIRED,
    AI_EVENT_APPROVED,
    AI_EVENT_COMPLETED,
    AI_EVENT_FAILED,
    AI_EVENT_MATCH_COMPLETED,
    AI_EVENT_OUTREACH_DRAFTED,
    AI_EVENT_PROFILE_PARSED,
    AI_EVENT_REJECTED,
)


class WorkflowService:
    def __init__(self, store: TraceStore, kafka_bus: KafkaBus, ws_manager: Any) -> None:
        self.store = store
        self.kafka_bus = kafka_bus
        self.ws_manager = ws_manager

    async def create_workflow(self, req: AgentWorkflowRequest) -> Dict[str, Any]:
        existing = await self.store.get_by_idempotency_key(req.idempotency_key)
        if existing:
            return {
                "trace_id": existing.trace_id,
                "status": existing.status,
                "message": "Existing workflow returned by idempotency key",
            }

        trace_id = req.trace_id or str(uuid.uuid4())

        trace = AITrace(
            trace_id=trace_id,
            workflow_type=req.workflow_type,
            recruiter_id=req.recruiter_id,
            job_id=req.job.job_id,
            candidate_member_id=req.candidate.member_id,
            status="queued",
            requires_human_approval=req.require_human_approval,
            approval_status="pending" if req.require_human_approval else None,
            idempotency_key=req.idempotency_key,
        )
        await self.store.save_trace(trace)

        workflow_payload = {
            "trace_id": trace_id,
            "workflow_type": req.workflow_type,
            "recruiter_id": req.recruiter_id,
            "candidate": req.candidate.model_dump(),
            "job": req.job.model_dump(),
            "require_human_approval": req.require_human_approval,
            "idempotency_key": req.idempotency_key,
            "candidate_display_name": req.candidate_display_name,
            "recruiter_display_name": req.recruiter_display_name,
        }
        if req.match_result is not None:
            workflow_payload["match_result"] = req.match_result

        # Important: run locally inside the AI service after Kafka boundary.
        asyncio.create_task(self.run_workflow(workflow_payload))

        return {
            "trace_id": trace_id,
            "status": "queued",
            "message": "AI workflow accepted and started",
        }

    async def _push_update(self, trace_id: str, event_type: str, data: Dict[str, Any]) -> None:
        event = {
            "trace_id": trace_id,
            "event_type": event_type,
            "data": data,
        }
        await self.kafka_bus.publish_result(event)
        await self.ws_manager.broadcast(trace_id, event)

    async def run_workflow(self, payload: Dict[str, Any]) -> None:
        trace_id = payload["trace_id"]

        try:
            await self.store.update_trace_status(
                trace_id,
                status="running",
                current_step="workflow_started",
            )
            await self._push_update(
                trace_id,
                "workflow_started",
                {
                    "message": "AI workflow started",
                    "current_step": "workflow_started",
                },
            )

            await self.store.update_trace_status(
                trace_id,
                status="running",
                current_step="resume_parser",
            )
            await self.store.add_step(
                trace_id,
                StepResult(step_name="resume_parser", status="running"),
            )
            await self._push_update(
                trace_id,
                "resume_parser_started",
                {
                    "message": "Resume/profile parsing started",
                    "current_step": "resume_parser",
                },
            )

            parse_req = ResumeParseRequest(
                member_id=payload["candidate"]["member_id"],
                headline=payload["candidate"].get("headline", ""),
                summary=payload["candidate"].get("summary", ""),
                experiences=payload["candidate"].get("experiences", []),
                education=payload["candidate"].get("education", []),
                skills=payload["candidate"].get("skills", []),
                resume_text=payload["candidate"].get("resume_text", ""),
            )
            parsed = await parse_profile(parse_req)

            await self.store.update_step(
                trace_id,
                "resume_parser",
                "completed",
                data=parsed,
            )
            await self._push_update(trace_id, AI_EVENT_PROFILE_PARSED, parsed)

            await self.store.update_trace_status(
                trace_id,
                status="running",
                current_step="matcher",
            )
            await self.store.add_step(
                trace_id,
                StepResult(step_name="matcher", status="running"),
            )
            await self._push_update(
                trace_id,
                "matcher_started",
                {
                    "message": "Candidate-job matching started",
                    "current_step": "matcher",
                },
            )

            raw_override = payload.get("match_result")
            if isinstance(raw_override, dict) and isinstance(
                raw_override.get("match_score"), (int, float, str)
            ):
                try:
                    _ms = float(raw_override["match_score"])
                except (TypeError, ValueError):
                    _ms = None
                if _ms is not None and 0.0 <= _ms <= 100.0:
                    match_result = dict(raw_override)
                    match_result["match_score"] = _ms
                    match_result.setdefault("matched_skills", [])
                    match_result.setdefault("missing_skills", [])
                else:
                    match_req = AIMatchRequest(
                        candidate=payload["candidate"],
                        job=payload["job"],
                    )
                    match_result = await compute_match(match_req)
            else:
                match_req = AIMatchRequest(
                    candidate=payload["candidate"],
                    job=payload["job"],
                )
                match_result = await compute_match(match_req)

            await self.store.update_step(
                trace_id,
                "matcher",
                "completed",
                data=match_result,
            )
            await self._push_update(trace_id, AI_EVENT_MATCH_COMPLETED, match_result)

            match_score = float(match_result.get("match_score") or 0.0)
            if match_score < OUTREACH_MIN_MATCH_SCORE:
                skip_reason = (
                    f"Match score {match_score:.1f}% is below the minimum "
                    f"{OUTREACH_MIN_MATCH_SCORE:.0f}% required for recruiter outreach."
                )
                await self.store.add_step(
                    trace_id,
                    StepResult(
                        step_name="outreach_generator",
                        status="completed",
                        data={"skipped": True, "reason": skip_reason},
                    ),
                )
                final_result = {
                    "parsed_profile": parsed,
                    "match_result": match_result,
                    "outreach_draft": None,
                    "outreach_skipped": True,
                    "outreach_skip_reason": skip_reason,
                }
                await self.store.update_trace_status(
                    trace_id,
                    status="completed",
                    current_step="done",
                    final_result=final_result,
                    requires_human_approval=False,
                    approval_status="not_required",
                )
                await self._push_update(trace_id, AI_EVENT_COMPLETED, final_result)
                return

            await self.store.update_trace_status(
                trace_id,
                status="running",
                current_step="outreach_generator",
            )
            await self.store.add_step(
                trace_id,
                StepResult(step_name="outreach_generator", status="running"),
            )
            await self._push_update(
                trace_id,
                "outreach_generator_started",
                {
                    "message": "Outreach generation started",
                    "current_step": "outreach_generator",
                },
            )

            outreach_req = OutreachDraftRequest(
                recruiter_id=payload["recruiter_id"],
                candidate=payload["candidate"],
                job=payload["job"],
                tone="professional",
                candidate_display_name=payload.get("candidate_display_name"),
                recruiter_display_name=payload.get("recruiter_display_name"),
            )
            outreach = await generate_outreach(outreach_req, match_result)

            await self.store.update_step(
                trace_id,
                "outreach_generator",
                "completed",
                data=outreach,
            )
            await self._push_update(trace_id, AI_EVENT_OUTREACH_DRAFTED, outreach)

            final_result = {
                "parsed_profile": parsed,
                "match_result": match_result,
                "outreach_draft": outreach,
            }

            if payload.get("require_human_approval", True):
                await self.store.update_trace_status(
                    trace_id,
                    status="awaiting_approval",
                    current_step="human_approval",
                    final_result=final_result,
                    requires_human_approval=True,
                    approval_status="pending",
                )
                await self._push_update(trace_id, AI_EVENT_APPROVAL_REQUIRED, final_result)
            else:
                await self.store.update_trace_status(
                    trace_id,
                    status="completed",
                    current_step="done",
                    final_result=final_result,
                    requires_human_approval=False,
                    approval_status="not_required",
                )
                await self._push_update(trace_id, AI_EVENT_COMPLETED, final_result)

        except Exception as exc:
            await self.store.update_trace_status(
                trace_id,
                status="failed",
                current_step="failed",
                final_result={"error": str(exc)},
            )
            await self._push_update(
                trace_id,
                AI_EVENT_FAILED,
                {"error": str(exc)},
            )

    async def approve(self, trace_id: str, action: str, edited_message: str | None = None) -> Dict[str, Any]:
        trace = await self.store.get_trace(trace_id)
        if not trace:
            raise ValueError("trace_id not found")

        result = trace.final_result or {}
        outreach = result.get("outreach_draft", {})

        if action == "approve":
            await self.store.update_trace_status(
                trace_id,
                status="completed",
                current_step="done",
                approval_status="approved",
            )
            await self._push_update(trace_id, AI_EVENT_APPROVED, {"outreach_draft": outreach})
            await self._push_update(trace_id, AI_EVENT_COMPLETED, trace.final_result or {})
            return {
                "trace_id": trace_id,
                "status": "completed",
                "approval_status": "approved",
            }

        if action == "edit":
            if edited_message:
                outreach["message"] = edited_message
                result["outreach_draft"] = outreach

            await self.store.update_trace_status(
                trace_id,
                status="completed",
                current_step="done",
                final_result=result,
                approval_status="edited_and_approved",
            )
            await self._push_update(trace_id, AI_EVENT_APPROVED, {"outreach_draft": outreach})
            await self._push_update(trace_id, AI_EVENT_COMPLETED, result)
            return {
                "trace_id": trace_id,
                "status": "completed",
                "approval_status": "edited_and_approved",
            }

        if action == "reject":
            await self.store.update_trace_status(
                trace_id,
                status="rejected",
                current_step="done",
                approval_status="rejected",
            )
            await self._push_update(
                trace_id,
                AI_EVENT_REJECTED,
                {"message": "Recruiter rejected generated outreach"},
            )
            return {
                "trace_id": trace_id,
                "status": "rejected",
                "approval_status": "rejected",
            }

        raise ValueError("action must be approve, edit, or reject")