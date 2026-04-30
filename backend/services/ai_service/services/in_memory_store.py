from datetime import datetime, timezone
from typing import Any, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError

from models.ai_trace import AITrace, StepResult


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TraceStore:
    def __init__(self, mongo_uri: str, mongo_db_name: str) -> None:
        self._memory: Dict[str, AITrace] = {}
        self.client = None
        self.db = None
        self.collection = None

        if mongo_uri and mongo_db_name:
            try:
                self.client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=3000)
                self.db = self.client[mongo_db_name]
                self.collection = self.db["ai_traces"]
            except Exception:
                self.client = None
                self.db = None
                self.collection = None

    async def init_indexes(self) -> None:
        if self.collection is not None:
            try:
                await self.collection.create_index("trace_id", unique=True)
                await self.collection.create_index("idempotency_key")
                await self.collection.create_index("status")
                await self.collection.create_index("created_at")
            except PyMongoError:
                pass

    async def save_trace(self, trace: AITrace) -> None:
        trace.updated_at = utc_now()
        self._memory[trace.trace_id] = trace
        if self.collection is not None:
            try:
                await self.collection.update_one(
                    {"trace_id": trace.trace_id},
                    {"$set": trace.to_mongo()},
                    upsert=True,
                )
            except PyMongoError:
                pass

    async def get_trace(self, trace_id: str) -> Optional[AITrace]:
        if trace_id in self._memory:
            return self._memory[trace_id]

        if self.collection is not None:
            try:
                doc = await self.collection.find_one({"trace_id": trace_id}, {"_id": 0})
                if doc:
                    trace = AITrace(**doc)
                    self._memory[trace_id] = trace
                    return trace
            except PyMongoError:
                pass

        return None

    async def get_by_idempotency_key(self, key: Optional[str]) -> Optional[AITrace]:
        if not key:
            return None

        for trace in self._memory.values():
            if trace.idempotency_key == key:
                return trace

        if self.collection is not None:
            try:
                doc = await self.collection.find_one({"idempotency_key": key}, {"_id": 0})
                if doc:
                    trace = AITrace(**doc)
                    self._memory[trace.trace_id] = trace
                    return trace
            except PyMongoError:
                pass

        return None

    async def add_step(self, trace_id: str, step: StepResult) -> Optional[AITrace]:
        trace = await self.get_trace(trace_id)
        if not trace:
            return None
        trace.steps.append(step)
        trace.current_step = step.step_name
        trace.updated_at = utc_now()
        await self.save_trace(trace)
        return trace

    async def update_step(
        self,
        trace_id: str,
        step_name: str,
        status: str,
        data: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> Optional[AITrace]:
        trace = await self.get_trace(trace_id)
        if not trace:
            return None

        for step in reversed(trace.steps):
            if step.step_name == step_name and step.completed_at is None:
                step.status = status
                step.completed_at = utc_now()
                if data:
                    step.data = data
                if error:
                    step.error = error
                break

        trace.updated_at = utc_now()
        await self.save_trace(trace)
        return trace

    async def update_trace_status(
        self,
        trace_id: str,
        status: str,
        current_step: Optional[str] = None,
        final_result: Optional[Dict[str, Any]] = None,
        requires_human_approval: Optional[bool] = None,
        approval_status: Optional[str] = None,
    ) -> Optional[AITrace]:
        trace = await self.get_trace(trace_id)
        if not trace:
            return None

        trace.status = status
        if current_step is not None:
            trace.current_step = current_step
        if final_result is not None:
            trace.final_result = final_result
        if requires_human_approval is not None:
            trace.requires_human_approval = requires_human_approval
        if approval_status is not None:
            trace.approval_status = approval_status

        trace.updated_at = utc_now()
        await self.save_trace(trace)
        return trace
    
    async def list_traces(self) -> list[AITrace]:
        traces: Dict[str, AITrace] = dict(self._memory)

        if self.collection is not None:
            try:
                async for doc in self.collection.find({}, {"_id": 0}):
                    trace = AITrace(**doc)
                    traces[trace.trace_id] = trace
            except PyMongoError:
                pass

        return list(traces.values())