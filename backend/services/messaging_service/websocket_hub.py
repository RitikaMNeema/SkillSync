from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class WebSocketHub:
    def __init__(self) -> None:
        self._thread_connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, thread_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._thread_connections[thread_id].add(websocket)

    async def disconnect(self, thread_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._thread_connections.get(thread_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._thread_connections.pop(thread_id, None)

    async def broadcast(self, thread_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._thread_connections.get(thread_id, set()))

        stale: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                stale.append(socket)

        if stale:
            async with self._lock:
                current = self._thread_connections.get(thread_id)
                if not current:
                    return
                for socket in stale:
                    current.discard(socket)
                if not current:
                    self._thread_connections.pop(thread_id, None)


hub = WebSocketHub()
