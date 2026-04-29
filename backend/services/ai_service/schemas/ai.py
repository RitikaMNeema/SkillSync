from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CandidateProfile(BaseModel):
    member_id: int
    headline: str = ""
    summary: str = ""
    skills: List[str] = Field(default_factory=list)
    experiences: List[str] = Field(default_factory=list)
    location: str = ""
    education: List[str] = Field(default_factory=list)


class JobPayload(BaseModel):
    job_id: int
    title: str
    description: str = ""
    skills_required: List[str] = Field(default_factory=list)
    location: str = ""
    seniority_level: str = ""
    employment_type: str = ""


class AIMatchRequest(BaseModel):
    candidate: CandidateProfile
    job: JobPayload


class ResumeParseRequest(BaseModel):
    member_id: int
    headline: str = ""
    summary: str = ""
    experiences: List[str] = Field(default_factory=list)
    education: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)


class OutreachDraftRequest(BaseModel):
    recruiter_id: int
    candidate: CandidateProfile
    job: JobPayload
    tone: str = "professional"


class AgentWorkflowRequest(BaseModel):
    trace_id: Optional[str] = None
    recruiter_id: int
    candidate: CandidateProfile
    job: JobPayload
    workflow_type: str = "shortlist_outreach"
    require_human_approval: bool = True
    idempotency_key: Optional[str] = None

class ApprovalRequest(BaseModel):
    trace_id: str
    action: str  # approve / reject / edit
    edited_message: Optional[str] = None
    reviewer_id: Optional[int] = None


class AgentStatusResponse(BaseModel):
    trace_id: str
    status: str
    current_step: Optional[str] = None
    requires_human_approval: bool = False
    approval_status: Optional[str] = None
    final_result: Dict[str, Any] = Field(default_factory=dict)
    steps: List[Dict[str, Any]] = Field(default_factory=list)


class GenericSuccessResponse(BaseModel):
    success: bool = True
    data: Dict[str, Any]


class CommandStatusRequest(BaseModel):
    command_id: str