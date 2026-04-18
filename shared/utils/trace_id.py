import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


def generate_trace_id() -> str:
    return str(uuid.uuid4())


class TraceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.trace_id = (
            request.headers.get("x-trace-id") or generate_trace_id()
        )
        return await call_next(request)
