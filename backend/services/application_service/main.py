from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.database.mysql import get_pool, close_pool
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from routes.applications import router
from consumers.job_closed_consumer import start_job_closed_consumer
from consumers.application_commands_consumer import start_application_commands_consumer


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    await start_job_closed_consumer()
    await start_application_commands_consumer()
    yield
    await close_pool()
    await close_producer()


app = FastAPI(title="Application Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)
app.include_router(router, prefix="/applications")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "application-service", "status": "ok"}}
