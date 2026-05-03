from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from services.connection_service.routes.connections import router
from shared.middleware.auth import get_current_user


def override_get_current_user():
    return {"user_id": 1, "role": "member"}


def create_test_app():
    app = FastAPI()
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.include_router(router, prefix="/connections")
    return app


client = TestClient(create_test_app())

# Routes use enqueue_* functions (async Kafka pattern) → all mutating endpoints return 202


def test_request_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.enqueue_request",
        new=AsyncMock(return_value={"command_id": "abc", "status": "queued"})
    ):
        response = client.post("/connections/request", json={
            "requester_id": 1,
            "receiver_id": 2
        })

    assert response.status_code == 202
    assert response.json()["success"] is True
    assert response.json()["data"]["command_id"] == "abc"


def test_accept_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.enqueue_accept",
        new=AsyncMock(return_value={"command_id": "def", "status": "queued"})
    ):
        response = client.post("/connections/accept", json={"request_id": 1})

    assert response.status_code == 202
    assert response.json()["data"]["command_id"] == "def"


def test_reject_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.enqueue_reject",
        new=AsyncMock(return_value={"command_id": "ghi", "status": "queued"})
    ):
        response = client.post("/connections/reject", json={"request_id": 5})

    assert response.status_code == 202
    assert response.json()["data"]["command_id"] == "ghi"


def test_withdraw_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.enqueue_withdraw",
        new=AsyncMock(return_value={"command_id": "jkl", "status": "queued"})
    ):
        response = client.post("/connections/withdraw", json={"request_id": 9})

    assert response.status_code == 202
    assert response.json()["data"]["command_id"] == "jkl"


def test_list_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.list_connections",
        new=AsyncMock(return_value=[
            {"connected_user_id": 2, "connected_email": "user2@test.com"}
        ])
    ):
        response = client.post("/connections/list", json={"user_id": 1})

    assert response.status_code == 200
    assert len(response.json()["data"]) == 1


def test_pending_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.pending",
        new=AsyncMock(return_value=[
            {"id": 5, "status": "pending"}
        ])
    ):
        response = client.post("/connections/pending", json={"user_id": 2})

    assert response.status_code == 200
    assert response.json()["data"][0]["status"] == "pending"


def test_remove_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.enqueue_remove",
        new=AsyncMock(return_value={"command_id": "mno", "status": "queued"})
    ):
        response = client.post("/connections/remove", json={
            "user_id_1": 1,
            "user_id_2": 2
        })

    assert response.status_code == 202
    assert response.json()["data"]["command_id"] == "mno"
