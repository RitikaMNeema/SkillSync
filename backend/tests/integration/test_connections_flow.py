"""
Integration test: connection request → accept → list flow.

Requires all services to be running (docker compose up -d from backend/).

Run from the backend/ directory:
    pytest tests/integration/test_connections_flow.py -v -s
"""
import asyncio
import uuid
import pytest
import httpx

AUTH_URL  = "http://localhost:3001"
CONN_URL  = "http://localhost:3004"

POLL_INTERVAL   = 0.5   # seconds between commandStatus polls
POLL_MAX_TRIES  = 20    # up to 10 seconds total


# ── helpers ──────────────────────────────────────────────────────────────────

async def register_and_login(client: httpx.AsyncClient, role: str = "member") -> tuple[int, str]:
    """Register a throwaway user and return (user_id, token)."""
    email    = f"inttest-{uuid.uuid4().hex[:8]}@skillsync-test.com"
    password = "Test@1234"

    reg = await client.post(f"{AUTH_URL}/auth/register", json={
        "email": email, "password": password, "role": role
    })
    assert reg.status_code == 201, f"register failed: {reg.text}"
    user_id = reg.json()["data"]["user_id"]

    login = await client.post(f"{AUTH_URL}/auth/login", json={
        "email": email, "password": password
    })
    assert login.status_code == 200, f"login failed: {login.text}"
    token = login.json()["data"]["token"]

    return user_id, token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def wait_for_command(client: httpx.AsyncClient, command_id: str, token: str) -> dict:
    """Poll /connections/commandStatus until the command is no longer queued/processing."""
    for _ in range(POLL_MAX_TRIES):
        resp = await client.post(
            f"{CONN_URL}/connections/commandStatus",
            headers=auth_headers(token),
            json={"command_id": command_id},
        )
        assert resp.status_code == 200, f"commandStatus error: {resp.text}"
        data = resp.json()["data"]
        if data["status"] in ("completed", "failed"):
            return data
        await asyncio.sleep(POLL_INTERVAL)
    pytest.fail(f"Command {command_id} did not complete within {POLL_MAX_TRIES * POLL_INTERVAL}s")


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_connect_accept_list_flow():
    """
    Full flow: register two users → request connection → poll until done
    → check pending → accept → poll → verify list.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:

        # ── 1. Create two throwaway test accounts ─────────────────────────────
        uid1, tok1 = await register_and_login(client, role="member")
        uid2, tok2 = await register_and_login(client, role="member")

        # ── 2. User1 sends a connection request to User2 ─────────────────────
        req_resp = await client.post(
            f"{CONN_URL}/connections/request",
            headers=auth_headers(tok1),
            json={"requester_id": uid1, "receiver_id": uid2},
        )
        assert req_resp.status_code == 202, req_resp.text
        req_cmd = req_resp.json()["data"]
        assert req_cmd["status"] == "queued"
        assert req_cmd["action"] == "request"

        # ── 3. Poll until the "request" command completes ────────────────────
        req_result = await wait_for_command(client, req_cmd["command_id"], tok1)
        assert req_result["status"] == "completed", f"Command failed: {req_result}"
        request_id = req_result["result"]["request_id"]
        assert req_result["result"]["status"] == "pending"

        # ── 4. User2 sees the request in their pending list ──────────────────
        pending_resp = await client.post(
            f"{CONN_URL}/connections/pending",
            headers=auth_headers(tok2),
            json={"user_id": uid2},
        )
        assert pending_resp.status_code == 200, pending_resp.text
        pending_list = pending_resp.json()["data"]
        assert any(r["id"] == request_id for r in pending_list), \
            f"request {request_id} not in pending list: {pending_list}"

        # ── 5. User2 accepts the request ─────────────────────────────────────
        accept_resp = await client.post(
            f"{CONN_URL}/connections/accept",
            headers=auth_headers(tok2),
            json={"request_id": request_id},
        )
        assert accept_resp.status_code == 202, accept_resp.text
        acc_cmd = accept_resp.json()["data"]
        assert acc_cmd["status"] == "queued"
        assert acc_cmd["action"] == "accept"

        # ── 6. Poll until the "accept" command completes ─────────────────────
        acc_result = await wait_for_command(client, acc_cmd["command_id"], tok2)
        assert acc_result["status"] == "completed", f"Accept command failed: {acc_result}"
        assert acc_result["result"]["status"] == "accepted"

        # ── 7. User1's connection list now includes User2 ─────────────────────
        list_resp = await client.post(
            f"{CONN_URL}/connections/list",
            headers=auth_headers(tok1),
            json={"user_id": uid1},
        )
        assert list_resp.status_code == 200, list_resp.text
        connections = list_resp.json()["data"]
        connected_ids = [c["connected_user_id"] for c in connections]
        assert uid2 in connected_ids, \
            f"User {uid2} not found in User {uid1}'s connection list: {connected_ids}"

        # ── 8. Mutual connections: both see each other ─────────────────────────
        mutual_resp = await client.post(
            f"{CONN_URL}/connections/mutual",
            headers=auth_headers(tok1),
            json={"user_id_1": uid1, "user_id_2": uid2},
        )
        assert mutual_resp.status_code == 200, mutual_resp.text
        # They only know each other — no mutual connections expected
        mutual_data = mutual_resp.json()["data"]
        assert "count" in mutual_data
