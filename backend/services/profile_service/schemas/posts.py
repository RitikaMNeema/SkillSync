from typing import Literal, Optional

from pydantic import BaseModel, field_validator


class CreatePostRequest(BaseModel):
    member_id: int
    content: str
    post_type: Literal["post", "photo", "video", "article"] = "post"
    media_url: Optional[str] = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        value = v.strip()
        if not value:
            raise ValueError("Content cannot be empty")
        if len(value) > 2000:
            raise ValueError("Content must be 2000 characters or fewer")
        return value


class FeedPostsRequest(BaseModel):
    page: int = 1


class MemberPostsRequest(BaseModel):
    member_id: int
    page: int = 1
