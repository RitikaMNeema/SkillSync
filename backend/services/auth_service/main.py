from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.env import load_env

load_env()

from shared.database.mysql import get_pool, close_pool
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from consumers.auth_commands_consumer import start_auth_commands_consumer
from routes.auth import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    await start_auth_commands_consumer()
    yield
    await close_pool()
    await close_producer()


app = FastAPI(title="Auth Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)

app.include_router(router, prefix="/auth")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "auth-service", "status": "ok"}}
