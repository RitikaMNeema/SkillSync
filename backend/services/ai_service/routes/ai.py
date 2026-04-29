from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from controllers.agent_controller import AgentController
from controllers.match_controller import compute_match
from controllers.outreach_controller import generate_outreach
from controllers.parser_controller import parse_profile
from models.command_status import get_command_status
from producers.ai_command_producer import enqueue_ai_command
from schemas.ai import (
    AIMatchRequest,
    AgentWorkflowRequest,
    ApprovalRequest,
    CommandStatusRequest,
    GenericSuccessResponse,
    OutreachDraftRequest,
    ResumeParseRequest,
)


def build_ai_router(agent_controller: AgentController, ws_manager):
    router = APIRouter(prefix="/ai", tags=["Agentic AI"])

    @router.get("/health")
    async def health():
        return {"success": True, "service": "ai-service"}

    @router.post("/parse-profile", response_model=GenericSuccessResponse, status_code=202)
    async def parse_profile_route(payload: ResumeParseRequest):
        result = await enqueue_ai_command("parse_profile", str(payload.member_id), payload.model_dump())
        return {"success": True, "data": result}

    @router.post("/match", response_model=GenericSuccessResponse, status_code=202)
    async def match_route(payload: AIMatchRequest):
        result = await enqueue_ai_command("match", str(payload.candidate.member_id), payload.model_dump())
        return {"success": True, "data": result}

    @router.post("/outreach-draft", response_model=GenericSuccessResponse, status_code=202)
    async def outreach_route(payload: OutreachDraftRequest):
        result = await enqueue_ai_command("outreach_draft", str(payload.recruiter_id), payload.model_dump())
        return {"success": True, "data": result}

    @router.post("/agent/request", response_model=GenericSuccessResponse, status_code=202)
    async def submit_agent_workflow(payload: AgentWorkflowRequest):
        try:
            result = await enqueue_ai_command("agent_request", str(payload.recruiter_id), payload.model_dump())
            return {"success": True, "data": result}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @router.get("/agent/status/{trace_id}", response_model=GenericSuccessResponse)
    async def get_agent_status(trace_id: str):
        try:
            result = await agent_controller.get_status(trace_id)
            return {"success": True, "data": result}
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    @router.post("/agent/approve", response_model=GenericSuccessResponse, status_code=202)
    async def approve_agent_output(payload: ApprovalRequest):
        try:
            result = await enqueue_ai_command("agent_approve", str(payload.reviewer_id or "system"), payload.model_dump())
            return {"success": True, "data": result}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    @router.post("/command-status", response_model=GenericSuccessResponse)
    async def command_status(payload: CommandStatusRequest):
        status = await get_command_status(payload.command_id)
        if not status:
            raise HTTPException(status_code=404, detail="Command not found")
        return {"success": True, "data": status}

    @router.websocket("/ws/{trace_id}")
    async def websocket_updates(websocket: WebSocket, trace_id: str):
        await ws_manager.connect(trace_id, websocket)

        # Immediate visible message in Postman after connect
        await websocket.send_json({
            "type": "connected",
            "trace_id": trace_id,
            "message": "websocket connected successfully"
        })

        try:
            while True:
                # Keep connection alive; Postman can send ping text if needed
                message = await websocket.receive_text()

                # optional echo back so you can test instantly from Postman
                await websocket.send_json({
                    "type": "echo",
                    "trace_id": trace_id,
                    "message": message
                })

        except WebSocketDisconnect:
            ws_manager.disconnect(trace_id, websocket)
        except Exception:
            ws_manager.disconnect(trace_id, websocket)

    return router