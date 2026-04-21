from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson import ObjectId
from bson.errors import InvalidId

from shared.database.mongo import get_db

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 5 * 1024 * 1024


def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(get_db(), bucket_name="post_media")


async def upload_image(data: bytes, filename: str, content_type: str) -> str:
    """Validate + store image in GridFS. Returns the media_url."""
    if content_type not in ALLOWED_MIME:
        raise ValueError(f"Unsupported image type: {content_type}")
    if len(data) > MAX_BYTES:
        raise ValueError("Image exceeds 5MB limit")
    if len(data) == 0:
        raise ValueError("Empty file")

    file_id = await _bucket().upload_from_stream(
        filename,
        data,
        metadata={"content_type": content_type},
    )
    return f"/posts/image/{file_id}"


async def open_image(image_id: str):
    """Returns (stream, content_type) or raises ValueError if not found."""
    try:
        oid = ObjectId(image_id)
    except (InvalidId, TypeError):
        raise ValueError("Invalid image id")
    try:
        stream = await _bucket().open_download_stream(oid)
    except Exception:
        raise ValueError("Image not found")
    ct = (stream.metadata or {}).get("content_type", "application/octet-stream")
    return stream, ct

async def delete_image(image_id: str) -> bool:
    """Best-effort delete an image from GridFS. Silent on failure."""
    try:
        oid = ObjectId(image_id)
    except (InvalidId, TypeError):
        return False
    try:
        await _bucket().delete(oid)
        return True
    except Exception:
        return False