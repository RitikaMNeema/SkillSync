from typing import Dict

from schemas.ai import ApprovalRequest, AgentWorkflowRequest
from services.workflow_service import WorkflowService
from services.in_memory_store import TraceStore


class AgentController:
    def __init__(self, workflow_service: WorkflowService, store: TraceStore) -> None:
        self.workflow_service = workflow_service
        self.store = store

    async def submit_workflow(self, req: AgentWorkflowRequest) -> Dict:
        return await self.workflow_service.create_workflow(req)

    async def get_status(self, trace_id: str) -> Dict:
        trace = await self.store.get_trace(trace_id)
        if not trace:
            raise ValueError("trace_id not found")

        return {
            "trace_id": trace.trace_id,
            "status": trace.status,
            "current_step": trace.current_step,
            "requires_human_approval": trace.requires_human_approval,
            "approval_status": trace.approval_status,
            "final_result": trace.final_result,
            "steps": [step.model_dump(mode="json") for step in trace.steps],
        }

    async def approve(self, req: ApprovalRequest) -> Dict:
        return await self.workflow_service.approve(req.trace_id, req.action, req.edited_message)