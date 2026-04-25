"""GridFS helpers for profile photos and resumes."""
import inspect
import io
from typing import AsyncIterator, Optional

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from shared.database.mongo import get_db

PHOTO_BUCKET = "profile_photos"
RESUME_BUCKET = "resumes"


def _bucket(name: str) -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_db(), bucket_name=name)


def to_object_id(value: Optional[str]) -> Optional[ObjectId]:
    if not value:
        return None
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


async def upload_photo(member_id: int, filename: str, content_type: str, data: bytes) -> str:
    bucket = _bucket(PHOTO_BUCKET)
    file_id = await bucket.upload_from_stream(
        filename or f"photo_{member_id}",
        io.BytesIO(data),
        metadata={"member_id": member_id, "content_type": content_type},
    )
    return str(file_id)


async def upload_resume(member_id: int, filename: str, content_type: str, data: bytes) -> str:
    bucket = _bucket(RESUME_BUCKET)
    file_id = await bucket.upload_from_stream(
        filename or f"resume_{member_id}",
        io.BytesIO(data),
        metadata={"member_id": member_id, "content_type": content_type},
    )
    return str(file_id)


async def delete_photo(file_id: Optional[str]) -> None:
    oid = to_object_id(file_id)
    if not oid:
        return
    try:
        await _bucket(PHOTO_BUCKET).delete(oid)
    except Exception:
        # File may already be gone; ignore.
        pass


async def delete_resume(file_id: Optional[str]) -> None:
    oid = to_object_id(file_id)
    if not oid:
        return
    try:
        await _bucket(RESUME_BUCKET).delete(oid)
    except Exception:
        pass


async def stream_file(bucket_name: str, file_id: str) -> tuple[AsyncIterator[bytes], dict]:
    """Return (async iterator of chunks, file info dict)."""
    bucket = _bucket(bucket_name)
    oid = to_object_id(file_id)
    if not oid:
        raise FileNotFoundError(file_id)
    cursor = bucket.find({"_id": oid})
    doc = await cursor.to_list(length=1)
    if not doc:
        raise FileNotFoundError(file_id)
    info = doc[0]
    stream = await bucket.open_download_stream(oid)

    async def _iter() -> AsyncIterator[bytes]:
        try:
            while True:
                chunk = await stream.readchunk()
                if not chunk:
                    break
                yield chunk
        finally:
            # Motor/PyMongo versions differ: close() may be sync, async, or absent.
            close_fn = getattr(stream, "close", None)
            if close_fn is not None:
                maybe_awaitable = close_fn()
                if inspect.isawaitable(maybe_awaitable):
                    await maybe_awaitable

    return _iter(), info


async def stream_photo(file_id: str):
    return await stream_file(PHOTO_BUCKET, file_id)


async def stream_resume(file_id: str):
    return await stream_file(RESUME_BUCKET, file_id)
