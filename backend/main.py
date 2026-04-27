from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Iterable

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from shared.env import load_env

load_env()

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

# First URL segment on each microservice (after /api/{service}/... in the gateway path).
SERVICE_UPSTREAM_PREFIX: dict[str, str] = {
    "auth": "auth",
    "members": "members",
    "posts": "posts",
    "recruiters": "recruiters",
    "connections": "connections",
    "jobs": "jobs",
    "applications": "applications",
    "threads": "threads",
    "messages": "messages",
    "analytics": "analytics",
    "events": "events",
}


def _gateway_upstream_path(service: str, path: str) -> str:
    """Map /api/{service}/{path} to the path each FastAPI app actually mounts (e.g. auth -> /auth/...)."""
    tail = path.lstrip("/")
    if tail == "health":
        return "health"
    prefix = SERVICE_UPSTREAM_PREFIX.get(service)
    if not prefix:
        raise HTTPException(status_code=404, detail=f"Unknown API prefix: {service}")
    return f"{prefix}/{tail}" if tail else prefix

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
    # Let httpx recompute Content-Length for the forwarded body; forwarding a
    # stale length breaks multipart uploads when the proxy re-buffers.
    "content-length",
}

log = logging.getLogger("gateway.proxy")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warn if PROFILE_SERVICE_URL points at the wrong process (common 404 on uploads)."""
    profile_base = os.getenv("PROFILE_SERVICE_URL", "http://127.0.0.1:3002").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{profile_base}/health")
            if r.status_code != 200:
                log.error(
                    "Profile service health check failed: GET %s/health -> HTTP %s. "
                    "Upload routes (/members/uploadPhoto, etc.) require profile_service on this URL.",
                    profile_base,
                    r.status_code,
                )
            else:
                payload = r.json()
                svc = (payload.get("data") or {}).get("service", "")
                if svc == "linkedin-class-project-gateway":
                    log.error(
                        "PROFILE_SERVICE_URL=%s is the API GATEWAY, not the profile microservice. "
                        "/members/uploadPhoto will 404. Run profile_service on port 3002, e.g.: "
                        "cd backend && PYTHONPATH=. uvicorn main:app --app-dir services/profile_service --host 127.0.0.1 --port 3002 --reload",
                        profile_base,
                    )
                elif svc != "profile-service":
                    log.warning(
                        "PROFILE_SERVICE_URL=%s health reports service=%r (expected 'profile-service').",
                        profile_base,
                        svc,
                    )
                else:
                    log.info("Upstream profile service OK at %s", profile_base)
    except Exception as exc:
        log.warning(
            "Could not reach profile service at %s: %s. "
            "Start it in another terminal before /api/members/* works, e.g.: "
            "cd backend && PYTHONPATH=. uvicorn main:app --app-dir services/profile_service --host 127.0.0.1 --port 3002 --reload",
            profile_base,
            exc,
        )
    yield


app = FastAPI(title="LinkedIn Class Project Gateway", lifespan=lifespan)

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

    upstream_url = f"{base_url.rstrip('/')}/{_gateway_upstream_path(service, path)}"
    body = await request.body()
    is_upload = "uploadPhoto" in path or "uploadResumeFile" in path
    if is_upload:
        ct = request.headers.get("content-type", "")
        log.info(
            "proxy upload %s %s -> %s content-type=%s body_len=%s",
            request.method,
            request.url.path,
            upstream_url,
            ct[:120] if ct else "(none)",
            len(body),
        )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            upstream = await client.request(
                request.method,
                upstream_url,
                params=request.query_params,
                content=body,
                headers=_strip_hop_by_hop_headers(request.headers.items()),
            )
    except httpx.RequestError as exc:
        if is_upload:
            log.exception("proxy upload upstream error: %s", upstream_url)
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "error": f"Could not reach upstream service '{service}': {exc}",
            },
        )

    if is_upload:
        log.info("proxy upload response status=%s from %s", upstream.status_code, upstream_url)

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
