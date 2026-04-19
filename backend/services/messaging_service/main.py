from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.database.mongo import get_db
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from routes.messaging import threads_router, messages_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    yield
    await close_producer()


app = FastAPI(title="Messaging Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)
app.include_router(threads_router,  prefix="/threads")
app.include_router(messages_router, prefix="/messages")


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "messaging-service", "status": "ok"}}
