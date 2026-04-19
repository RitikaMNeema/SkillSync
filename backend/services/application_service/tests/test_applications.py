"""
Application service tests — MySQL, Redis, Kafka are mocked.
Run from `backend/` (PYTHONPATH includes this folder — see CI):
    cd services/application_service && pytest tests/
"""
import pytest
import sys
from unittest.mock import AsyncMock, MagicMock

for mod in ("aiomysql", "aiokafka", "redis.asyncio"):
    sys.modules.setdefault(mod, MagicMock())

from shared.middleware.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402
from httpx import AsyncClient, ASGITransport  # noqa: E402
from unittest.mock import patch  # noqa: E402

MEMBER_USER    = {"user_id": 10, "role": "member",    "email": "m@test.com"}
RECRUITER_USER = {"user_id": 1,  "role": "recruiter", "email": "r@test.com"}
OTHER_RECRUITER = {"user_id": 99, "role": "recruiter", "email": "other@test.com"}

_APP = {
    "application_id": 7, "job_id": 42, "member_id": "10",
    "job_recruiter_id": "1", "job_title": "SWE", "job_status": "open",
    "company_name": "Acme", "status": "submitted",
    "resume_url": "s3://r.pdf", "cover_letter": "Hi", "answers": None,
}


@pytest.fixture
def as_member():
    app.dependency_overrides[get_current_user] = lambda: MEMBER_USER
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def as_recruiter():
    app.dependency_overrides[get_current_user] = lambda: RECRUITER_USER
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def as_other_recruiter():
    app.dependency_overrides[get_current_user] = lambda: OTHER_RECRUITER
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_submit_application(as_member):
    with patch("controllers.applications.submit_application_transaction", new=AsyncMock(return_value=7)), \
         patch("controllers.applications.emit_submitted", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 201
        assert resp.json()["data"]["application_id"] == 7
        assert resp.json()["data"]["status"] == "submitted"


@pytest.mark.asyncio
async def test_duplicate_application_returns_409(as_member):
    with patch("controllers.applications.submit_application_transaction",
               new=AsyncMock(side_effect=ValueError("DUPLICATE"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 409


@pytest.mark.asyncio
async def test_closed_job_blocks_submission(as_member):
    with patch("controllers.applications.submit_application_transaction",
               new=AsyncMock(side_effect=ValueError("JOB_CLOSED"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_update_status_authorized_recruiter(as_recruiter):
    reviewing_app = {**_APP, "status": "submitted"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=reviewing_app)), \
         patch("controllers.applications.update_status",   new=AsyncMock()), \
         patch("controllers.applications.emit_status_changed", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/updateStatus", json={
                "application_id": 7, "new_status": "reviewing",
            })
        assert resp.status_code == 200
        assert resp.json()["data"]["new_status"] == "reviewing"


@pytest.mark.asyncio
async def test_update_status_wrong_recruiter_returns_403(as_other_recruiter):
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/updateStatus", json={
                "application_id": 7, "new_status": "reviewing",
            })
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invalid_status_transition_returns_400(as_recruiter):
    rejected_app = {**_APP, "status": "rejected"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=rejected_app)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/updateStatus", json={
                "application_id": 7, "new_status": "reviewing",
            })
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_withdraw_sets_status_and_fires_event(as_member):
    with patch("controllers.applications.get_application",   new=AsyncMock(return_value=_APP)), \
         patch("controllers.applications.withdraw_application", new=AsyncMock(return_value=True)), \
         patch("controllers.applications.emit_status_changed",  new=AsyncMock()) as emit_mock:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["new_status"] == "withdrawn"
        assert data["old_status"] == "submitted"
        emit_mock.assert_called_once()


@pytest.mark.asyncio
async def test_withdraw_by_wrong_member_returns_403(as_recruiter):
    # RECRUITER_USER has user_id=1, but app.member_id="10"
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_withdraw_already_rejected_returns_400(as_member):
    rejected_app = {**_APP, "status": "rejected"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=rejected_app)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 400
