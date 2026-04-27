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


def test_request_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.request",
        new=AsyncMock(return_value={"request_id": 1, "status": "pending"})
    ):
        response = client.post("/connections/request", json={
            "requester_id": 1,
            "receiver_id": 2
        })

    assert response.status_code == 201
    assert response.json()["success"] is True
    assert response.json()["data"]["status"] == "pending"


def test_accept_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.accept",
        new=AsyncMock(return_value={"request_id": 1, "status": "accepted"})
    ):
        response = client.post("/connections/accept", json={"request_id": 1})

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "accepted"


def test_reject_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.reject",
        new=AsyncMock(return_value={"request_id": 5, "status": "rejected"})
    ):
        response = client.post("/connections/reject", json={"request_id": 5})

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "rejected"


def test_withdraw_endpoint():
    with patch(
        "services.connection_service.routes.connections.ctrl.withdraw",
        new=AsyncMock(return_value={"request_id": 9, "status": "withdrawn"})
    ):
        response = client.post("/connections/withdraw", json={"request_id": 9})

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "withdrawn"


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
        "services.connection_service.routes.connections.ctrl.remove",
        new=AsyncMock(return_value={"removed": True})
    ):
        response = client.post("/connections/remove", json={
            "user_id_1": 1,
            "user_id_2": 2
        })

    assert response.status_code == 200
    assert response.json()["data"]["removed"] is True