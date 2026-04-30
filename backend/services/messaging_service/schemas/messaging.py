from pydantic import BaseModel
from typing import List, Optional


class OpenThreadRequest(BaseModel):
    participant_ids: List[int]


class ThreadIdRequest(BaseModel):
    thread_id: str


class ByUserRequest(BaseModel):
    user_id: int
    page: int = 1


class SendMessageRequest(BaseModel):
    thread_id: str
    sender_id: int
    text: str


class ListMessagesRequest(BaseModel):
    thread_id: str
    page: int = 1


class MarkReadRequest(BaseModel):
    thread_id: str
    user_id: int


class ThreadPreferenceUpdateRequest(BaseModel):
    thread_id: str
    starred: Optional[bool] = None
    muted: Optional[bool] = None
    archived: Optional[bool] = None
    force_unread: Optional[bool] = None
    hidden: Optional[bool] = None


class CommandStatusRequest(BaseModel):
    command_id: str
