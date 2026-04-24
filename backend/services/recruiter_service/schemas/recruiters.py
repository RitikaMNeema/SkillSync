from pydantic import BaseModel
from typing import Optional


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


class GetRecruiterRequest(BaseModel):
    recruiter_id: int


class UpdateRecruiterRequest(BaseModel):
    recruiter_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    access_level: Optional[str] = None
    company_id: Optional[int] = None
    company: Optional[CompanyIn] = None


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
