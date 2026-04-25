import logging
import os
from urllib.parse import quote_plus

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from shared.env import load_env

load_env()

_client: AsyncIOMotorClient | None = None
_db_name: str | None = None
_log = logging.getLogger(__name__)


def _database_name() -> str:
    name = (os.getenv("MONGO_DATABASE") or os.getenv("MONGO_DB_NAME") or "linkedin_db").strip()
    return name or "linkedin_db"


def _mongo_connection_uri() -> str:
    """
    Prefer explicit MONGO_URI. If unset/empty, build from MONGO_INITDB_* + MONGO_HOST/MONGO_PORT
    so passwords with special characters are URL-encoded and stay in sync with docker-compose mongo.
    """
    explicit = (os.getenv("MONGO_URI") or "").strip()
    if explicit:
        return explicit
    user = (os.getenv("MONGO_INITDB_ROOT_USERNAME") or "admin").strip()
    password = os.getenv("MONGO_INITDB_ROOT_PASSWORD") or ""
    host = (os.getenv("MONGO_HOST") or "127.0.0.1").strip()
    port = (os.getenv("MONGO_PORT") or "27018").strip()
    db = _database_name()
    if not password:
        _log.warning(
            "MONGO_URI is unset and MONGO_INITDB_ROOT_PASSWORD is empty; using non-auth URI "
            "mongodb://%s:%s/%s (set MONGO_URI or root password for secured Mongo).",
            host,
            port,
            db,
        )
        return f"mongodb://{host}:{port}/{db}"
    u = quote_plus(user)
    p = quote_plus(password)
    return f"mongodb://{u}:{p}@{host}:{port}/{db}?authSource=admin"


def get_db() -> AsyncIOMotorDatabase:
    """Return the application Mongo database (collections + GridFS)."""
    global _client, _db_name
    if _client is None:
        uri = _mongo_connection_uri()
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
