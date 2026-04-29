"""
Profile microservice.

Run from ``backend/`` with the repo root on ``PYTHONPATH``::

    export PYTHONPATH="$PWD"
    uvicorn main:app --app-dir services/profile_service --host 127.0.0.1 --port 3002 --reload

Or equivalently (path bootstrap below makes ``models`` / ``routes`` resolve)::

    export PYTHONPATH="$PWD"
    uvicorn services.profile_service.main:app --host 127.0.0.1 --port 3002 --reload
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# ``models`` and ``routes`` live in this directory; ``shared`` lives under ``backend/``.
# Without this, ``uvicorn services.profile_service.main:app`` only puts ``backend/`` on
# ``sys.path`` and ``import models`` fails.
_svc_root = str(Path(__file__).resolve().parent)
if _svc_root not in sys.path:
    sys.path.insert(0, _svc_root)

from shared.env import load_env

load_env()

from fastapi import FastAPI

if not logging.root.handlers:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(levelname)s [%(name)s] %(message)s",
    )
from shared.database.mysql import get_pool, close_pool
from shared.database.mongo import get_db, close_mongo
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from consumers.connection_events_consumer import start_connection_events_consumer
from consumers.profile_commands_consumer import start_profile_commands_consumer
from models.member_mysql import ensure_member_profile_tables
from models.post_mongo import ensure_post_indexes
from routes.members import router
from routes.posts import router as posts_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await ensure_member_profile_tables()
    db = get_db()
    await ensure_post_indexes()
    try:
        await db.command("ping")
        log.info(
            "MongoDB reachable — database %r (GridFS buckets create collections profile_photos.* and resumes.* after first upload)",
            db.name,
        )
    except Exception as exc:
        log.error(
            "MongoDB ping failed: %s. File uploads / unstructured profile writes will fail. "
            "If the API runs on your machine (not inside Docker), set MONGO_URI to use 127.0.0.1 and the published port "
            "(see docker-compose: mongo is often localhost:27018), not host name 'mongo'.",
            exc,
        )
    await get_redis()
    await start_connection_events_consumer()
    await start_profile_commands_consumer()
    yield
    await close_pool()
    await close_mongo()
    await close_producer()


app = FastAPI(title="Profile Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)

app.include_router(router, prefix="/members")
app.include_router(posts_router, prefix="/posts")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "profile-service", "status": "ok"}}
