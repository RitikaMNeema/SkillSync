from pydantic import BaseModel, field_validator
from typing import Literal


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: Literal["member", "recruiter"]

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class ValidateRequest(BaseModel):
    token: str
