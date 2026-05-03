from pydantic import BaseModel
from typing import Optional, Any, Literal


class CreateJobRequest(BaseModel):
    company_id: int
    recruiter_id: int
    title: str
    work_mode: Literal["remote", "hybrid", "onsite"]
    description: Optional[str] = None
    seniority_level: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    skills_required: Optional[Any] = None
    benefits: Optional[Any] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None


class JobIdRequest(BaseModel):
    job_id: int


class UpdateJobRequest(BaseModel):
    job_id: int
    title: Optional[str] = None
    description: Optional[str] = None
    seniority_level: Optional[str] = None
    employment_type: Optional[str] = None
    location: Optional[str] = None
    work_mode: Optional[str] = None
    skills_required: Optional[Any] = None
    benefits: Optional[Any] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None


class SearchJobsRequest(BaseModel):
    keyword: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    work_mode: Optional[str] = None
    industry: Optional[str] = None
    seniority_level: Optional[str] = None
    page: int = 1


class ByRecruiterRequest(BaseModel):
    recruiter_id: int
    page: int = 1


class SaveJobRequest(BaseModel):
    member_id: int
    job_id: int


class SavedByMemberRequest(BaseModel):
    member_id: int
    page: int = 1


class TrackViewRequest(BaseModel):
    job_id: int
    viewer_id: Optional[int] = None


class CommandStatusRequest(BaseModel):
    command_id: str
