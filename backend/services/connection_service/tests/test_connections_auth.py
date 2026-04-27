import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

SERVICE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(SERVICE_DIR))

for mod in ("aiomysql", "aiokafka", "redis.asyncio", "jose"):
    sys.modules.setdefault(mod, MagicMock())

from shared.middleware.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {"user_id": 10, "role": "member", "email": "m@test.com"}
    yield
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_request_rejects_cross_user_requester_id():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/request", json={"requester_id": 99, "receiver_id": 20})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_list_rejects_cross_user_listing():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/list", json={"user_id": 99})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_mutual_rejects_unrelated_actor():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/mutual", json={"user_id_1": 21, "user_id_2": 22})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_remove_rejects_unrelated_actor():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/remove", json={"user_id_1": 21, "user_id_2": 22})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_accept_rejects_non_receiver():
    req = {"id": 1, "requester_id": 21, "receiver_id": 22, "status": "pending"}
    with patch("controllers.connections.find_request_by_id", new=AsyncMock(return_value=req)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/connections/accept", json={"request_id": 1})
    assert resp.status_code == 403
