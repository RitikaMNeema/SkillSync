from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.database.mongo import get_db
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from routes.analytics import events_router, analytics_router
from consumers.events_consumer import start_events_consumer


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    get_redis()
    await start_events_consumer()
    yield
    await close_producer()


app = FastAPI(title="Analytics Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)
app.include_router(events_router,    prefix="/events")
app.include_router(analytics_router, prefix="/analytics")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "analytics-service", "status": "ok"}}
