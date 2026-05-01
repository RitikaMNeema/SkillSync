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
    """User 10 cannot create a connection request on behalf of user 99."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/request", json={"requester_id": 99, "receiver_id": 20})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_list_returns_connections_for_any_user():
    """
    Connection lists are public — any authenticated user can view any user's
    connections (LinkedIn-style). The endpoint must return 200 with a list.
    """
    # Patch the controller function that hits the DB.
    # Module is registered under the full package path even when imported via short name.
    _ctrl = sys.modules["services.connection_service.controllers.connections"]
    with patch.object(_ctrl, "list_connections", new=AsyncMock(return_value=[])):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/connections/list", json={"user_id": 99})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.anyio
async def test_mutual_returns_mutual_connections_for_any_pair():
    """
    Mutual connections are public — any authenticated user can see the mutual
    connections between any two other users. The endpoint must return 200.
    """
    _ctrl = sys.modules["services.connection_service.controllers.connections"]
    with patch.object(_ctrl, "mutual", new=AsyncMock(return_value={"mutual_connections": [], "count": 0})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/connections/mutual", json={"user_id_1": 21, "user_id_2": 22})
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.anyio
async def test_remove_rejects_unrelated_actor():
    """User 10 cannot remove a connection between users 21 and 22."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/connections/remove", json={"user_id_1": 21, "user_id_2": 22})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_accept_rejects_non_receiver():
    """User 10 cannot accept a request where receiver_id is 22 (not 10)."""
    req = {"id": 1, "requester_id": 21, "receiver_id": 22, "status": "pending"}
    # Use sys.modules to get the already-loaded module (avoids relative-import issues on fresh import)
    _ctrl = sys.modules["services.connection_service.controllers.connections"]
    with patch.object(_ctrl, "find_request_by_id", new=AsyncMock(return_value=req)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/connections/accept", json={"request_id": 1})
    assert resp.status_code == 403
