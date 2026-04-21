from collections import defaultdict
from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, trace_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[trace_id].append(websocket)

    def disconnect(self, trace_id: str, websocket: WebSocket) -> None:
        if trace_id in self.active_connections:
            self.active_connections[trace_id] = [
                ws for ws in self.active_connections[trace_id] if ws != websocket
            ]
            if not self.active_connections[trace_id]:
                del self.active_connections[trace_id]

    async def broadcast(self, trace_id: str, payload: dict) -> None:
        dead = []

        for websocket in self.active_connections.get(trace_id, []):
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)

        for ws in dead:
            self.disconnect(trace_id, ws)