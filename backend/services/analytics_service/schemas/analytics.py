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
    recruiter_id: int | None = None


class LowTractionJobsRequest(BaseModel):
    month: str  # "YYYY-MM-DD"
    recruiter_id: int | None = None


class SavedJobsRequest(BaseModel):
    period: Literal["day", "week"] = "day"
    month: str | None = None  # "YYYY-MM-DD"
    recruiter_id: int | None = None


class JobClicksRequest(BaseModel):
    month: str | None = None  # "YYYY-MM-DD"
    recruiter_id: int | None = None


class GeoRequest(BaseModel):
    month: str | None = None  # "YYYY-MM-DD"
    recruiter_id: int | None = None
    job_id: str | None = None


class MemberDashboardRequest(BaseModel):
    member_id: int


class RecruiterDashboardRequest(BaseModel):
    recruiter_id: int
    month: Optional[str] = None  # "YYYY-MM-DD" (typically first day); UTC month window like other analytics


class RecruiterProfileDashboardRequest(BaseModel):
    recruiter_id: int


class EventCountsRequest(BaseModel):
    month: str | None = None  # "YYYY-MM-DD"
    recruiter_id: int | None = None
    job_id: str | None = None
