import re

from pydantic import BaseModel, field_validator
from typing import Literal

PASSWORD_MIN_LENGTH = 8


class RegisterRequest(BaseModel):
    email: str
    password: str
    role: Literal["member", "recruiter"]

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < PASSWORD_MIN_LENGTH:
            raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must include an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must include a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must include a number")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("Password must include a special character")
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class ValidateRequest(BaseModel):
    token: str


class EmailCheckRequest(BaseModel):
    email: str


class CommandStatusRequest(BaseModel):
    command_id: str
