from pydantic import BaseModel


class RequestBody(BaseModel):
    requester_id: int
    receiver_id: int


class RequestIdBody(BaseModel):
    request_id: int


class UserIdBody(BaseModel):
    user_id: int


class MutualBody(BaseModel):
    user_id_1: int
    user_id_2: int


class RemoveBody(BaseModel):
    user_id_1: int
    user_id_2: int


class BlockBody(BaseModel):
    blocker_id: int
    blocked_id: int


class CommandStatusRequest(BaseModel):
    command_id: str
