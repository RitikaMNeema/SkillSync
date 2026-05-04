from pydantic import BaseModel
from typing import Optional, Any


class CompanyIn(BaseModel):
    name: str
    industry: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None


class CreateRecruiterRequest(BaseModel):
    recruiter_id: int
    name: str
    email: str
    phone: Optional[str] = None
    role: Optional[str] = None
    access_level: Optional[str] = None
    company_id: Optional[int] = None
    company: Optional[CompanyIn] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    birthday: Optional[str] = None
    website: Optional[str] = None
    profile_photo_url: Optional[str] = None
    cover_photo_url: Optional[str] = None
    open_to: Optional[str] = None
    profile_status: Optional[str] = None
    profile_language: Optional[str] = None
    profile_slug: Optional[str] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    about: Optional[str] = None
    languages: Optional[Any] = None
    followed_skills: Optional[Any] = None


class GetRecruiterRequest(BaseModel):
    recruiter_id: int


class RecordRecruiterProfileViewRequest(BaseModel):
    recruiter_id: int


class UpdateRecruiterRequest(BaseModel):
    model_config = {"extra": "ignore"}

    recruiter_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    access_level: Optional[str] = None
    company_id: Optional[int] = None
    company: Optional[CompanyIn] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    birthday: Optional[str] = None
    website: Optional[str] = None
    profile_photo_url: Optional[str] = None
    cover_photo_url: Optional[str] = None
    open_to: Optional[str] = None
    profile_status: Optional[str] = None
    profile_language: Optional[str] = None
    profile_slug: Optional[str] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    about: Optional[str] = None
    languages: Optional[Any] = None
    followed_skills: Optional[Any] = None


class DeleteRecruiterRequest(BaseModel):
    recruiter_id: int


class SearchRecruitersRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    page: int = 1


class ByCompanyRequest(BaseModel):
    company_id: int
    page: int = 1


class CommandStatusRequest(BaseModel):
    command_id: str
