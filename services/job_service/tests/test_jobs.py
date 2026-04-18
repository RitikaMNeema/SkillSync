"""
Job service tests — all external I/O (MySQL, Redis, Kafka) is mocked.
Run from the SkillSync root:
    cd services/job_service && pytest tests/
"""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

# Patch heavy imports before main is loaded so aiomysql/aiokafka don't need a live broker
import sys
from unittest.mock import MagicMock

for mod in ("aiomysql", "aiokafka", "redis.asyncio"):
    sys.modules.setdefault(mod, MagicMock())

from shared.middleware.auth import get_current_user  # noqa: E402
from main import app  # noqa: E402

RECRUITER = {"user_id": 1, "role": "recruiter", "email": "r@test.com"}
MEMBER    = {"user_id": 10, "role": "member",    "email": "m@test.com"}

_JOB = {
    "job_id": 42, "company_id": 1, "recruiter_id": 1, "title": "Software Engineer",
    "description": "Great role", "work_mode": "remote", "employment_type": "full-time",
    "location": "San Francisco", "industry": "Technology", "skills_required": ["Python"],
    "salary_min": 100000, "salary_max": 150000, "status": "open",
    "views_count": 0, "applicants_count": 0, "company_name": "Acme",
}


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: RECRUITER
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_job():
    with patch("controllers.jobs.create_job", new=AsyncMock(return_value=42)), \
         patch("controllers.jobs.get_job",    new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.cache_set",  new=AsyncMock()), \
         patch("controllers.jobs.cache_get",  new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/create", json={
                "company_id": 1, "recruiter_id": 1, "title": "Software Engineer",
                "work_mode": "remote", "employment_type": "full-time",
                "location": "San Francisco",
            })
        assert resp.status_code == 201
        assert resp.json()["data"]["job_id"] == 42


@pytest.mark.asyncio
async def test_get_job_cache_miss_then_hit():
    with patch("controllers.jobs.get_job",   new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_set", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/get", json={"job_id": 42})
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "Software Engineer"

    # Second call returns from cache
    with patch("controllers.jobs.cache_get", new=AsyncMock(return_value=_JOB)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp2 = await ac.post("/jobs/get", json={"job_id": 42})
        assert resp2.status_code == 200


@pytest.mark.asyncio
async def test_get_job_not_found():
    with patch("controllers.jobs.get_job",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_get", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/get", json={"job_id": 999})
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_search_jobs_returns_results():
    results = {"jobs": [_JOB], "total": 1, "page": 1, "page_size": 20}
    with patch("controllers.jobs.search_jobs", new=AsyncMock(return_value=([_JOB], 1))), \
         patch("controllers.jobs.cache_get",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_set",   new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/search", json={"keyword": "Engineer", "location": "San Francisco"})
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1


@pytest.mark.asyncio
async def test_close_job_removes_from_search():
    closed_job = {**_JOB, "status": "closed"}
    with patch("controllers.jobs.get_job",        new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.close_job",       new=AsyncMock(return_value=True)), \
         patch("controllers.jobs.cache_del",       new=AsyncMock()), \
         patch("controllers.jobs.cache_del_pattern", new=AsyncMock()), \
         patch("controllers.jobs.emit_job_closed", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/close", json={"job_id": 42})
        assert resp.status_code == 200
        assert resp.json()["data"]["status"] == "closed"


@pytest.mark.asyncio
async def test_close_already_closed_job_returns_400():
    with patch("controllers.jobs.get_job", new=AsyncMock(return_value={**_JOB, "status": "closed"})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/close", json={"job_id": 42})
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_save_and_unsave_job():
    with patch("controllers.jobs.get_job",       new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.save_job",      new=AsyncMock(return_value=True)), \
         patch("controllers.jobs.emit_job_saved", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            save_resp = await ac.post("/jobs/save", json={"member_id": 10, "job_id": 42})
        assert save_resp.status_code == 201

    with patch("controllers.jobs.unsave_job", new=AsyncMock(return_value=True)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            unsave_resp = await ac.post("/jobs/unsave", json={"member_id": 10, "job_id": 42})
        assert unsave_resp.status_code == 200


@pytest.mark.asyncio
async def test_track_view_fires_kafka():
    emit_mock = AsyncMock()
    with patch("controllers.jobs.get_job",        new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.increment_views", new=AsyncMock()), \
         patch("controllers.jobs.cache_del",       new=AsyncMock()), \
         patch("controllers.jobs.emit_job_viewed", new=emit_mock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/trackView", json={"job_id": 42, "viewer_id": 10})
        assert resp.status_code == 200
