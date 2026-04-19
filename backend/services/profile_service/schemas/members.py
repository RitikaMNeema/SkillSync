from pydantic import BaseModel
from typing import Optional, Any


class CreateMemberRequest(BaseModel):
    member_id: int
    first_name: str
    last_name: str
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    profile_photo_url: Optional[str] = None
    about: Optional[str] = None
    freeform_experience: Optional[Any] = None


class GetMemberRequest(BaseModel):
    member_id: int


class UpdateMemberRequest(BaseModel):
    member_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    profile_photo_url: Optional[str] = None
    about: Optional[str] = None
    freeform_experience: Optional[Any] = None


class DeleteMemberRequest(BaseModel):
    member_id: int


class SearchMembersRequest(BaseModel):
    keyword: Optional[str] = None
    skill: Optional[str] = None
    location: Optional[str] = None
    page: int = 1


class UploadResumeRequest(BaseModel):
    member_id: int
    resume_url: str


class GetResumeRequest(BaseModel):
    member_id: int
