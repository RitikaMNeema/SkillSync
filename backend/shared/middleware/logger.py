import json
import time

from shared.utils.trace_id import get_scope_trace_id
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class LoggerMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.time()
        status_code: int = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            if status_code == 0:
                status_code = 500
            trace_id = get_scope_trace_id(scope)
            print(
                json.dumps(
                    {
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "trace_id": trace_id,
                        "level": "INFO",
                        "method": scope.get("method", ""),
                        "path": scope.get("path", ""),
                        "status": status_code,
                        "ms": round((time.time() - start) * 1000),
                    }
                )
            )
