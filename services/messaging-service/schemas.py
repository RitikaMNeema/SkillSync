from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class ThreadCreate(BaseModel):
    participant_ids: List[str]

class ThreadResponse(BaseModel):
    thread_id: str
    participant_ids: List[str]
    created_at: datetime
    updated_at: datetime

class MessageCreate(BaseModel):
    thread_id: str
    sender_id: str
    receiver_id: str
    message_text: str

class MessageResponse(BaseModel):
    message_id: str
    thread_id: str
    sender_id: str
    receiver_id: str
    message_text: str
    timestamp: datetime
    is_read: bool

class MessageMarkRead(BaseModel):
    message_id: str
