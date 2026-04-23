
import logging
import os

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from shared.env import load_env

load_env()

_client: AsyncIOMotorClient | None = None
_db_name: str | None = None
_log = logging.getLogger(__name__)


def _database_name() -> str:
    name = (os.getenv("MONGO_DATABASE") or os.getenv("MONGO_DB_NAME") or "linkedin_db").strip()
    return name or "linkedin_db"


def get_db() -> AsyncIOMotorDatabase:
    """Return the application Mongo database (collections + GridFS)."""
    global _client, _db_name
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://mongo:27017/")
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10000)
        _db_name = _database_name()
        _log.info(
            "Motor client created; database=%r (set MONGO_DATABASE to override; default matches docker init)",
            _db_name,
        )
    assert _db_name is not None
    return _client[_db_name]


async def close_mongo() -> None:
    global _client, _db_name
    if _client:
        _client.close()
        _client = None
        _db_name = None
