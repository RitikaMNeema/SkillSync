import pytest
import httpx

BASE_URL = "http://localhost:3004"

# Use a real valid token from Swagger/login
AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJyb2xlIjoibWVtYmVyIiwiZXhwIjoxNzc3MzM3MDE5fQ.MdV5dSzr6IT4VwKwLWt8p5jnOkiTq86OInEHzs4Hy9c"


@pytest.mark.asyncio
async def test_connect_accept_list_flow():
    headers = {
        "Authorization": f"Bearer {AUTH_TOKEN}",
        "Content-Type": "application/json",
        "accept": "application/json",
    }

    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers) as client:
        # 1. send request
        req_resp = await client.post("/connections/request", json={
            "requester_id": 1,
            "receiver_id": 2
        })
        assert req_resp.status_code == 201, req_resp.text
        req_data = req_resp.json()["data"]
        request_id = req_data["request_id"]
        assert req_data["status"] == "pending"

        # 2. check pending
        pending_resp = await client.post("/connections/pending", json={"user_id": 2})
        assert pending_resp.status_code == 200, pending_resp.text
        pending_data = pending_resp.json()["data"]
        assert any(r["id"] == request_id for r in pending_data)

        # 3. accept
        accept_resp = await client.post("/connections/accept", json={"request_id": request_id})
        assert accept_resp.status_code == 200, accept_resp.text
        assert accept_resp.json()["data"]["status"] == "accepted"

        # 4. list for requester
        list_resp = await client.post("/connections/list", json={"user_id": 1})
        assert list_resp.status_code == 200, list_resp.text
        connections = list_resp.json()["data"]
        assert any(c["connected_user_id"] == 2 for c in connections)