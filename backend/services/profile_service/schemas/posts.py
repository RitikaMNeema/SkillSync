from typing import Literal, Optional

from pydantic import BaseModel, field_validator, model_validator


class CreatePostRequest(BaseModel):
    member_id: int
    content: str = ""
    post_type: Literal["post", "photo", "video", "article"] = "post"
    media_url: Optional[str] = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        value = (v or "").strip()
        if len(value) > 2000:
            raise ValueError("Content must be 2000 characters or fewer")
        return value

    @model_validator(mode="after")
    def require_content_or_media(self):
        # Allow text-only, image-only, or both — but not fully empty
        if not self.content and not self.media_url:
            raise ValueError("Post must have content or media")
        return self


class FeedPostsRequest(BaseModel):
    page: int = 1


class MemberPostsRequest(BaseModel):
    member_id: int
    page: int = 1


class LikePostRequest(BaseModel):
    post_id: str
    member_id: int


class CreateCommentRequest(BaseModel):
    post_id: str
    member_id: int
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        value = (v or "").strip()
        if not value:
            raise ValueError("Comment cannot be empty")
        if len(value) > 1000:
            raise ValueError("Comment must be 1000 characters or fewer")
        return value


class ListCommentsRequest(BaseModel):
    post_id: str
    page: int = 1

class DeletePostRequest(BaseModel):
    post_id: str
    member_id: int


class CommandStatusRequest(BaseModel):
    command_id: str