from datetime import date
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any


class CreateMemberRequest(BaseModel):
    member_id: int
    first_name: str
    last_name: str
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: str = Field(..., min_length=1, max_length=220)
    summary: Optional[str] = None
    birthday: Optional[date] = None
    website: Optional[str] = Field(default=None, max_length=512)
    languages: Optional[Any] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    profile_photo_url: Optional[str] = None
    about: Optional[str] = None
    freeform_experience: Optional[Any] = None
    followed_skills: Optional[Any] = None
    open_to: Optional[str] = None
    profile_status: Optional[str] = None
    profile_language: Optional[str] = None
    profile_slug: Optional[str] = None

    @field_validator("headline")
    @classmethod
    def validate_headline(cls, value: str) -> str:
        headline = value.strip()
        if not headline:
            raise ValueError("Headline is required")
        if len(headline) > 220:
            raise ValueError("Headline must be 220 characters or fewer")
        return headline


class GetMemberRequest(BaseModel):
    member_id: int


class RecordProfileViewRequest(BaseModel):
    """Record one profile view (deduped server-side; not tied to profile GET)."""
    member_id: int


class UpdateMemberRequest(BaseModel):
    model_config = {"extra": "ignore"}

    member_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_state: Optional[str] = None
    location_country: Optional[str] = None
    headline: Optional[str] = Field(default=None, max_length=220)
    summary: Optional[str] = None
    birthday: Optional[date] = None
    website: Optional[str] = Field(default=None, max_length=512)
    languages: Optional[Any] = None
    experience: Optional[Any] = None
    education: Optional[Any] = None
    skills: Optional[Any] = None
    profile_photo_url: Optional[str] = None
    about: Optional[str] = None
    freeform_experience: Optional[Any] = None
    followed_skills: Optional[Any] = None
    open_to: Optional[str] = None
    profile_status: Optional[str] = None
    profile_language: Optional[str] = None
    profile_slug: Optional[str] = None

    @field_validator("headline")
    @classmethod
    def validate_optional_headline(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        headline = value.strip()
        if not headline:
            raise ValueError("Headline is required")
        if len(headline) > 220:
            raise ValueError("Headline must be 220 characters or fewer")
        return headline


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


class CommandStatusRequest(BaseModel):
    command_id: str
