from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class JobCreate(BaseModel):
    title: str
    description: str
    seniority_level: Optional[str] = None
    employment_type: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    remote: bool = False
    skills_required: List[str] = []
    salary_range: Optional[str] = None
    company_id: str
    recruiter_id: str

class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    employment_type: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    remote: Optional[bool] = None
    salary_range: Optional[str] = None
    seniority_level: Optional[str] = None

class JobResponse(JobCreate):
    job_id: str
    posted_datetime: datetime
    status: str
    views_count: int
    applicants_count: int

    class Config:
        from_attributes = True


class SavedJobResponse(BaseModel):
    job_id: str
    saved_datetime: datetime
    title: str
    company_id: str
    recruiter_id: str
    status: str
    location: Optional[str] = None
    employment_type: Optional[str] = None
    industry: Optional[str] = None
    remote: bool = False

    class Config:
        from_attributes = True
