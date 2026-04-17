from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import datetime

class ApplicationSubmit(BaseModel):
    job_id: str
    member_id: str
    resume_ref: str
    cover_letter: Optional[str] = None
    answers: Optional[dict] = None
    recruiter_id: Optional[str] = None

class ApplicationStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        allowed = {"reviewing", "interview", "offer", "rejected", "withdrawn"}
        if value not in allowed:
            raise ValueError(f"status must be one of: {', '.join(sorted(allowed))}")
        return value

class ApplicationNoteAdd(BaseModel):
    recruiter_id: str
    note_text: str

class ApplicationResponse(BaseModel):
    application_id: str
    job_id: str
    member_id: str
    recruiter_id: Optional[str] = None
    status: str
    application_datetime: datetime
    
    class Config:
        from_attributes = True

class ApplicationNoteResponse(BaseModel):
    id: int
    recruiter_id: str
    note_text: str
    created_at: datetime
    
    class Config:
        from_attributes = True
