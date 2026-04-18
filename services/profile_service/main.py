from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.database.mysql import get_pool, close_pool
from shared.database.mongo import get_db
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from routes.members import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    get_db()
    await get_redis()
    yield
    await close_pool()
    await close_producer()


app = FastAPI(title="Profile Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)

app.include_router(router, prefix="/members")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "profile-service", "status": "ok"}}
