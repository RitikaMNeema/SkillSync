import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from controllers.agent_controller import AgentController
from consumers.ai_commands_consumer import start_ai_commands_consumer
from routes.ai import build_ai_router
from services.in_memory_store import TraceStore
from services.kafka_bus import KafkaBus
from services.metrics_service import MetricsService
from services.workflow_service import WorkflowService
from shared.redis_utils.client import get_redis
from services.ai_service.websocket.manager import ConnectionManager
from fastapi.middleware.cors import CORSMiddleware


AI_SERVICE_PORT = int(os.getenv("AI_SERVICE_PORT", "3010"))

MONGO_URI = os.getenv(
    "MONGO_URI",
    f"mongodb://{os.getenv('MONGO_INITDB_ROOT_USERNAME', 'admin')}:{os.getenv('MONGO_INITDB_ROOT_PASSWORD', 'admin123')}@mongo:27017/admin?authSource=admin",
)
AI_MONGO_DB = os.getenv("AI_MONGO_DB", "linkedin_ai_db")

store = TraceStore(mongo_uri=MONGO_URI, mongo_db_name=AI_MONGO_DB)
metrics_service = MetricsService(store)
kafka_bus = KafkaBus()
ws_manager = ConnectionManager()
workflow_service = WorkflowService(store=store, kafka_bus=kafka_bus, ws_manager=ws_manager)
agent_controller = AgentController(workflow_service=workflow_service, store=store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init_indexes()
    await get_redis()
    await kafka_bus.start_producer()
    await start_ai_commands_consumer(agent_controller)

    yield

    await kafka_bus.stop_producer()


app = FastAPI(
    title="LinkedIn Agentic AI Service",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(build_ai_router(agent_controller, ws_manager, metrics_service))


@app.get("/")
async def root():
    return {
        "success": True,
        "service": "LinkedIn Agentic AI Service",
        "docs": "/docs",
    }