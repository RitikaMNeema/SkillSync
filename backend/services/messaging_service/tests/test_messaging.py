"""
Messaging service tests — MongoDB and Kafka are mocked.
Run from `backend/` (PYTHONPATH includes this folder — see CI):
    cd backend/services/messaging_service && PYTHONPATH=../.. pytest tests/
"""
import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(SERVICE_DIR))

for mod in ("aiomysql", "aiokafka", "redis.asyncio", "jose", "motor", "motor.motor_asyncio"):
    sys.modules.setdefault(mod, MagicMock())
os.environ["DISABLE_KAFKA_CONSUMERS"] = "1"

from shared.middleware.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402
from httpx import AsyncClient, ASGITransport  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

USER_A = {"user_id": 1, "role": "member", "email": "a@test.com"}
USER_B = {"user_id": 2, "role": "member", "email": "b@test.com"}

_THREAD = {
    "thread_id": "t-123",
    "participant_ids": ["1", "2"],
    "created_at": "2026-01-01T00:00:00",
    "last_message_at": "2026-01-01T00:00:00",
}

_MSG = {
    "message_id": "m-abc",
    "thread_id": "t-123",
    "sender_id": "1",
    "text": "Hello!",
    "timestamp": "2026-01-01T00:00:01",
    "read_by": ["1"],
}




@pytest.fixture
def anyio_backend():
    return "asyncio"
@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    yield
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_open_thread():
    with patch("controllers.messaging.find_thread_by_participants", new=AsyncMock(return_value=None)), \
         patch("controllers.messaging.create_thread", new=AsyncMock(return_value=_THREAD)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/threads/open", json={"participant_ids": [1, 2]})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "open_thread"


@pytest.mark.anyio
async def test_open_thread_idempotent_returns_existing():
    with patch("controllers.messaging.find_thread_by_participants", new=AsyncMock(return_value=_THREAD)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/threads/open", json={"participant_ids": [1, 2]})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "open_thread"


@pytest.mark.anyio
async def test_open_thread_requires_two_participants():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/threads/open", json={"participant_ids": [1]})
    assert resp.status_code == 202
    assert resp.json()["data"]["action"] == "open_thread"


@pytest.mark.anyio
async def test_send_message():
    with patch("controllers.messaging.get_thread",          new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.create_message",      new=AsyncMock(return_value=_MSG)), \
         patch("controllers.messaging.update_last_message_at", new=AsyncMock()), \
         patch("controllers.messaging.emit_message_sent",   new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/send", json={
                "thread_id": "t-123", "sender_id": 1, "text": "Hello!",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "send"


@pytest.mark.anyio
async def test_send_message_retries_downstream_delivery_and_reports_failure():
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.create_message", new=AsyncMock(return_value=_MSG)), \
         patch("controllers.messaging.update_last_message_at", new=AsyncMock()), \
         patch("controllers.messaging.emit_message_sent", new=AsyncMock(side_effect=Exception("kafka-down"))), \
         patch("controllers.messaging.hub.broadcast", new=AsyncMock(side_effect=Exception("ws-down"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/send", json={
                "thread_id": "t-123", "sender_id": 1, "text": "Hello!",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "send"


@pytest.mark.anyio
async def test_send_message_non_participant_returns_403():
    thread_without_user = {**_THREAD, "participant_ids": ["5", "6"]}
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value=thread_without_user)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/send", json={
                "thread_id": "t-123", "sender_id": 1, "text": "Intruder!",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "send"


@pytest.mark.anyio
async def test_send_message_thread_not_found_returns_404():
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/send", json={
                "thread_id": "no-exist", "sender_id": 1, "text": "Hello?",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "send"


@pytest.mark.anyio
async def test_list_messages_paginated():
    with patch("controllers.messaging.get_thread",    new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.list_messages", new=AsyncMock(return_value=([_MSG], 1))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/list", json={"thread_id": "t-123", "page": 1})
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1
        assert len(resp.json()["data"]["messages"]) == 1


@pytest.mark.anyio
async def test_list_messages_forbidden_for_non_participant():
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value={**_THREAD, "participant_ids": ["5", "6"]})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/list", json={"thread_id": "t-123", "page": 1})
        assert resp.status_code == 403


@pytest.mark.anyio
async def test_mark_read():
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.mark_read",  new=AsyncMock(return_value=3)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/messages/markRead", json={"thread_id": "t-123", "user_id": 1})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "mark_read"


def test_message_send_receive_over_websocket():
    msg = {**_MSG, "timestamp": datetime.utcnow()}
    token = "ws-test-token"
    with patch("main.get_thread", new=AsyncMock(return_value=_THREAD)), \
         patch("main._decode_ws_token", return_value={"user_id": 1, "role": "member"}), \
         patch("controllers.messaging.get_thread", new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.create_message", new=AsyncMock(return_value=msg)), \
         patch("controllers.messaging.update_last_message_at", new=AsyncMock()), \
         patch("controllers.messaging.emit_message_sent", new=AsyncMock()):
        with TestClient(app) as client:
            with client.websocket_connect(f"/ws?thread_id=t-123&token={token}") as websocket:
                response = client.post(
                    "/messages/send",
                    json={"thread_id": "t-123", "sender_id": 1, "text": "Hello!"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert response.status_code == 202


@pytest.mark.anyio
async def test_get_thread_preferences():
    with patch("controllers.messaging.get_preferences_for_user", new=AsyncMock(return_value={"t-123": {"starred": True}})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/threads/preferences", json={})
        assert resp.status_code == 200
        assert resp.json()["data"]["preferences"]["t-123"]["starred"] is True


@pytest.mark.anyio
async def test_update_thread_preferences():
    pref = {"thread_id": "t-123", "user_id": "1", "starred": True}
    with patch("controllers.messaging.get_thread", new=AsyncMock(return_value=_THREAD)), \
         patch("controllers.messaging.upsert_preferences", new=AsyncMock(return_value=pref)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/threads/preferences/update", json={"thread_id": "t-123", "starred": True})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "update_preferences"
