from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

SERVICE_URLS = {
    "auth": os.getenv("AUTH_SERVICE_URL", "http://127.0.0.1:3001"),
    "members": os.getenv("PROFILE_SERVICE_URL", "http://127.0.0.1:3002"),
    "posts": os.getenv("PROFILE_SERVICE_URL", "http://127.0.0.1:3002"),
    "recruiters": os.getenv("RECRUITER_SERVICE_URL", "http://127.0.0.1:3003"),
    "connections": os.getenv("CONNECTION_SERVICE_URL", "http://127.0.0.1:3004"),
    "jobs": os.getenv("JOB_SERVICE_URL", "http://127.0.0.1:3005"),
    "applications": os.getenv("APPLICATION_SERVICE_URL", "http://127.0.0.1:3006"),
    "threads": os.getenv("MESSAGING_SERVICE_URL", "http://127.0.0.1:3007"),
    "messages": os.getenv("MESSAGING_SERVICE_URL", "http://127.0.0.1:3007"),
    "analytics": os.getenv("ANALYTICS_SERVICE_URL", "http://127.0.0.1:3008"),
    "events": os.getenv("ANALYTICS_SERVICE_URL", "http://127.0.0.1:3008"),
}

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
}


app = FastAPI(title="LinkedIn Class Project Gateway")

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


def _strip_hop_by_hop_headers(headers: Iterable[tuple[str, str]]) -> dict[str, str]:
    return {key: value for key, value in headers if key.lower() not in HOP_BY_HOP_HEADERS}


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "success": True,
        "data": {
            "service": "linkedin-class-project-gateway",
            "status": "ok",
            "frontend_dist_exists": FRONTEND_DIST.exists(),
        },
    }


@app.api_route("/api/{service}/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(service: str, path: str, request: Request) -> Response:
    base_url = SERVICE_URLS.get(service)
    if not base_url:
        raise HTTPException(status_code=404, detail=f"Unknown API prefix: {service}")

    upstream_url = f"{base_url.rstrip('/')}/{service}/{path.lstrip('/')}"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            upstream = await client.request(
                request.method,
                upstream_url,
                params=request.query_params,
                content=await request.body(),
                headers=_strip_hop_by_hop_headers(request.headers.items()),
            )
    except httpx.RequestError as exc:
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "error": f"Could not reach upstream service '{service}': {exc}",
            },
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
        headers=_strip_hop_by_hop_headers(upstream.headers.items()),
    )


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str) -> Response:
    if not FRONTEND_DIST.exists():
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "frontend/dist is missing. Run 'cd frontend && npm run build' first.",
            },
        )

    candidate = FRONTEND_DIST / full_path
    if full_path and candidate.exists() and candidate.is_file():
        return FileResponse(candidate)

    index_file = FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": "frontend/dist/index.html is missing. Rebuild the frontend first.",
            },
        )

    return FileResponse(index_file)
