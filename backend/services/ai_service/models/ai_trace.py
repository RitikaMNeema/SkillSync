from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StepResult(BaseModel):
    step_name: str
    status: str
    started_at: datetime = Field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class AITrace(BaseModel):
    trace_id: str
    workflow_type: str
    recruiter_id: Optional[int] = None
    job_id: Optional[int] = None
    candidate_member_id: Optional[int] = None
    status: str = "queued"
    requires_human_approval: bool = False
    approval_status: Optional[str] = None
    current_step: Optional[str] = None
    steps: List[StepResult] = Field(default_factory=list)
    final_result: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    idempotency_key: Optional[str] = None

    def to_mongo(self) -> Dict[str, Any]:
        return self.model_dump(mode="json")