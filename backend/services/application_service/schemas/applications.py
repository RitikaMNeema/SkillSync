from pydantic import BaseModel
from typing import Optional, Any


class SubmitRequest(BaseModel):
    job_id: int
    member_id: int
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    answers: Optional[Any] = None


class AppIdRequest(BaseModel):
    application_id: int


class ByJobRequest(BaseModel):
    job_id: int
    page: int = 1


class ByMemberRequest(BaseModel):
    member_id: int
    page: int = 1


class UpdateStatusRequest(BaseModel):
    application_id: int
    new_status: str


class AddNoteRequest(BaseModel):
    application_id: int
    recruiter_id: int
    note_text: str


class CommandStatusRequest(BaseModel):
    command_id: str
