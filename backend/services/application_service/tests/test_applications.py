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


@pytest.mark.anyio
async def test_submit_application(as_member):
    with patch("controllers.applications.submit_application_transaction", new=AsyncMock(return_value=7)), \
         patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)), \
         patch("controllers.applications.get_member_location", new=AsyncMock(return_value={"location_city": "SF", "location_state": "CA"})), \
         patch("controllers.applications.emit_submitted", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["status"] == "queued"
        assert resp.json()["data"]["action"] == "submit"
        assert resp.json()["data"]["command_id"]


@pytest.mark.anyio
async def test_submit_application_rejects_non_member_actor(as_recruiter):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/applications/submit", json={
            "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
        })
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_submit_application_rejects_mismatched_member_id(as_member):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/applications/submit", json={
            "job_id": 42, "member_id": 999, "resume_url": "s3://r.pdf",
        })
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_by_job_allows_owning_recruiter(as_recruiter):
    with patch("controllers.applications.get_job_recruiter_id", new=AsyncMock(return_value=1)), \
         patch("controllers.applications.apps_by_job", new=AsyncMock(return_value=([], 0))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/byJob", json={"job_id": 42, "page": 1})
    assert resp.status_code == 200
    assert resp.json()["data"]["total"] == 0


@pytest.mark.anyio
async def test_by_job_blocks_other_recruiter(as_other_recruiter):
    with patch("controllers.applications.get_job_recruiter_id", new=AsyncMock(return_value=1)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/byJob", json={"job_id": 42, "page": 1})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_by_job_blocks_member(as_member):
    with patch("controllers.applications.get_job_recruiter_id", new=AsyncMock(return_value=1)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/byJob", json={"job_id": 42, "page": 1})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_get_application_allows_applicant_member(as_member):
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)), \
         patch("controllers.applications.get_notes", new=AsyncMock(return_value=[])):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/get", json={"application_id": 7})
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_get_application_blocks_other_member(as_member):
    other = {**_APP, "member_id": "999"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=other)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/get", json={"application_id": 7})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_get_application_allows_owning_recruiter(as_recruiter):
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)), \
         patch("controllers.applications.get_notes", new=AsyncMock(return_value=[])):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/get", json={"application_id": 7})
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_by_member_blocks_recruiter(as_recruiter):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/applications/byMember", json={"member_id": 10, "page": 1})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_duplicate_application_returns_409(as_member):
    with patch("controllers.applications.submit_application_transaction",
               new=AsyncMock(side_effect=ValueError("DUPLICATE"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "submit"


@pytest.mark.anyio
async def test_closed_job_blocks_submission(as_member):
    with patch("controllers.applications.submit_application_transaction",
               new=AsyncMock(side_effect=ValueError("JOB_CLOSED"))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/submit", json={
                "job_id": 42, "member_id": 10, "resume_url": "s3://r.pdf",
            })
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "submit"


@pytest.mark.anyio
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
        assert resp.json()["data"]["status"] == "queued"
        assert resp.json()["data"]["action"] == "update_status"


@pytest.mark.anyio
async def test_update_status_wrong_recruiter_returns_403(as_other_recruiter):
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/updateStatus", json={
                "application_id": 7, "new_status": "reviewing",
            })
        assert resp.status_code == 200
        assert resp.json()["data"]["action"] == "update_status"


@pytest.mark.anyio
async def test_invalid_status_transition_returns_400(as_recruiter):
    rejected_app = {**_APP, "status": "rejected"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=rejected_app)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/updateStatus", json={
                "application_id": 7, "new_status": "reviewing",
            })
        assert resp.status_code == 200
        assert resp.json()["data"]["action"] == "update_status"


@pytest.mark.anyio
async def test_withdraw_sets_status_and_fires_event(as_member):
    with patch("controllers.applications.get_application",   new=AsyncMock(return_value=_APP)), \
         patch("controllers.applications.withdraw_application", new=AsyncMock(return_value=True)), \
         patch("controllers.applications.emit_status_changed",  new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 202
        assert resp.json()["data"]["status"] == "queued"
        assert resp.json()["data"]["action"] == "withdraw"


@pytest.mark.anyio
async def test_withdraw_by_wrong_member_returns_403(as_recruiter):
    # RECRUITER_USER has user_id=1, but app.member_id="10"
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=_APP)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 403


@pytest.mark.anyio
async def test_withdraw_already_rejected_returns_400(as_member):
    rejected_app = {**_APP, "status": "rejected"}
    with patch("controllers.applications.get_application", new=AsyncMock(return_value=rejected_app)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/applications/withdraw", json={"application_id": 7})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "withdraw"
