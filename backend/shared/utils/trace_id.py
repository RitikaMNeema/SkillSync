import uuid

from starlette.datastructures import State
from starlette.types import ASGIApp, Receive, Scope, Send


def generate_trace_id() -> str:
    return str(uuid.uuid4())


def set_scope_trace_id(scope: Scope, trace_id: str) -> None:
    if "state" not in scope:
        scope["state"] = State()
    st = scope["state"]
    if isinstance(st, dict):
        st["trace_id"] = trace_id
    else:
        st.trace_id = trace_id


def get_scope_trace_id(scope: Scope) -> str | None:
    st = scope.get("state")
    if st is None:
        return None
    if isinstance(st, dict):
        return st.get("trace_id")
    return getattr(st, "trace_id", None)


class TraceMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            trace = None
            for key, value in scope.get("headers", ()):
                if key == b"x-trace-id":
                    trace = value.decode("latin-1")
                    break
            set_scope_trace_id(scope, trace or generate_trace_id())
        await self.app(scope, receive, send)
