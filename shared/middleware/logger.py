import time
import json
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed_ms = round((time.time() - start) * 1000)
        print(json.dumps({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "trace_id":  request.state.trace_id if hasattr(request.state, "trace_id") else None,
            "level":     "INFO",
            "method":    request.method,
            "path":      request.url.path,
            "status":    response.status_code,
            "ms":        elapsed_ms,
        }))
        return response
