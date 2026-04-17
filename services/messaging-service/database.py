import os
try:
    from motor.motor_asyncio import AsyncIOMotorClient
except Exception:  # pragma: no cover - optional dependency in tests
    AsyncIOMotorClient = None

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "linkedin_messaging")

class Database:
    client: AsyncIOMotorClient = None

db = Database()

def get_database():
    """Dependency for getting DB"""
    return db.client[DB_NAME]

async def connect_to_mongo():
    if AsyncIOMotorClient is None:
        db.client = None
        return
    db.client = AsyncIOMotorClient(MONGO_URL)

async def close_mongo_connection():
    if db.client:
        db.client.close()
