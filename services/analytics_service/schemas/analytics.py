from pydantic import BaseModel
from typing import Literal, Optional


class IngestRequest(BaseModel):
    event_type: str
    trace_id: Optional[str] = None
    timestamp: str
    actor_id: Optional[str] = None
    entity: Optional[dict] = None
    payload: Optional[dict] = None
    idempotency_key: str


class TopJobsRequest(BaseModel):
    month: str  # "YYYY-MM-DD"


class SavedJobsRequest(BaseModel):
    period: Literal["day", "week"] = "day"


class MemberDashboardRequest(BaseModel):
    member_id: int


class RecruiterDashboardRequest(BaseModel):
    recruiter_id: int
