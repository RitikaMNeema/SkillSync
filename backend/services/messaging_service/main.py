from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from shared.database.mongo import get_db
from shared.redis_utils.client import get_redis
from shared.kafka_utils.producer import close_producer
from shared.middleware.error_handler import register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.utils.trace_id import TraceMiddleware
from models.thread import get_thread
from routes.messaging import threads_router, messages_router
from consumers.messaging_commands_consumer import start_messaging_commands_consumer
from websocket_hub import hub


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db()
    await get_redis()
    if os.getenv("DISABLE_KAFKA_CONSUMERS", "0") != "1":
        await start_messaging_commands_consumer()
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


def _decode_ws_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, os.getenv("JWT_SECRET", "secret"), algorithms=["HS256"])
    except JWTError:
        return None


@app.websocket("/ws")
async def websocket_messages(websocket: WebSocket):
    thread_id = websocket.query_params.get("thread_id")
    token = websocket.query_params.get("token")
    if not thread_id or not token:
        await websocket.close(code=1008)
        return

    payload = _decode_ws_token(token)
    if not payload:
        await websocket.close(code=1008)
        return

    user_id = str(payload.get("user_id"))
    thread = await get_thread(thread_id)
    if not thread or user_id not in thread.get("participant_ids", []):
        await websocket.close(code=1008)
        return

    await hub.connect(thread_id, websocket)
    try:
        while True:
            # Keep the socket alive and discard client pings/messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(thread_id, websocket)
