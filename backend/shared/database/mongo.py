import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client
    if _client is None:
        uri = os.getenv("MONGO_URI", "mongodb://host.docker.internal:27017/linkedin_db")
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10000)
        print("[MongoDB] Client initialised")
    return _client.linkedin_db


async def close_mongo() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
