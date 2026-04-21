import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from controllers.agent_controller import AgentController
from routes.ai import build_ai_router
from services.in_memory_store import TraceStore
from services.kafka_bus import KafkaBus
from services.workflow_service import WorkflowService
from websocket.manager import ConnectionManager


AI_SERVICE_PORT = int(os.getenv("AI_SERVICE_PORT", "3010"))

MONGO_URI = os.getenv(
    "MONGO_URI",
    f"mongodb://{os.getenv('MONGO_INITDB_ROOT_USERNAME', 'admin')}:{os.getenv('MONGO_INITDB_ROOT_PASSWORD', 'admin123')}@mongo:27017/admin?authSource=admin",
)
AI_MONGO_DB = os.getenv("AI_MONGO_DB", "linkedin_ai_db")

store = TraceStore(mongo_uri=MONGO_URI, mongo_db_name=AI_MONGO_DB)
kafka_bus = KafkaBus()
ws_manager = ConnectionManager()
workflow_service = WorkflowService(store=store, kafka_bus=kafka_bus, ws_manager=ws_manager)
agent_controller = AgentController(workflow_service=workflow_service, store=store)

consumer_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global consumer_task

    await store.init_indexes()
    await kafka_bus.start_producer()
    consumer_task = asyncio.create_task(workflow_service.consume_loop())

    yield

    if consumer_task:
        consumer_task.cancel()
        try:
            await consumer_task
        except BaseException:
            pass

    await kafka_bus.stop_producer()


app = FastAPI(
    title="SkillSync Agentic AI Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(build_ai_router(agent_controller, ws_manager))


@app.get("/")
async def root():
    return {
        "success": True,
        "service": "SkillSync Agentic AI Service",
        "docs": "/docs",
    }