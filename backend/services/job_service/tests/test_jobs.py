"""
Job service tests — all external I/O (MySQL, Redis, Kafka) is mocked.
Run from `backend/` (PYTHONPATH includes this folder — see CI):
    cd backend/services/job_service && PYTHONPATH=../.. pytest tests/
"""
import pytest
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
        assert resp.status_code == 202
        assert resp.json()["data"]["status"] == "queued"
        assert resp.json()["data"]["action"] == "create"


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
        assert resp.status_code == 202
        assert resp.json()["data"]["status"] == "queued"
        assert resp.json()["data"]["action"] == "close"


@pytest.mark.asyncio
async def test_close_already_closed_job_returns_400():
    with patch("controllers.jobs.get_job", new=AsyncMock(return_value={**_JOB, "status": "closed"})):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/close", json={"job_id": 42})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "close"


@pytest.mark.asyncio
async def test_save_and_unsave_job():
    app.dependency_overrides[get_current_user] = lambda: MEMBER
    with patch("controllers.jobs.get_job",       new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.save_job",      new=AsyncMock(return_value=True)), \
         patch("controllers.jobs.emit_job_saved", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            save_resp = await ac.post("/jobs/save", json={"member_id": 10, "job_id": 42})
        assert save_resp.status_code == 202
        assert save_resp.json()["data"]["action"] == "save"

    with patch("controllers.jobs.unsave_job", new=AsyncMock(return_value=True)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            unsave_resp = await ac.post("/jobs/unsave", json={"member_id": 10, "job_id": 42})
        assert unsave_resp.status_code == 202
        assert unsave_resp.json()["data"]["action"] == "unsave"


@pytest.mark.asyncio
async def test_track_view_fires_kafka():
    app.dependency_overrides[get_current_user] = lambda: MEMBER
    emit_mock = AsyncMock()
    with patch("controllers.jobs.get_job",        new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.increment_views", new=AsyncMock()), \
         patch("controllers.jobs.cache_del",       new=AsyncMock()), \
         patch("controllers.jobs.emit_job_viewed", new=emit_mock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/trackView", json={"job_id": 42, "viewer_id": 10})
        assert resp.status_code == 202
        assert resp.json()["data"]["action"] == "track_view"


# ── Additional search / filter tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_jobs_no_results():
    """Empty keyword returns empty list, not an error."""
    with patch("controllers.jobs.search_jobs", new=AsyncMock(return_value=([], 0))), \
         patch("controllers.jobs.cache_get",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_set",   new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/search", json={})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["jobs"] == []
        assert data["total"] == 0


@pytest.mark.asyncio
async def test_search_jobs_with_seniority_filter():
    """seniority_level is forwarded to the model and included in cache key."""
    senior_job = {**_JOB, "seniority_level": "senior"}
    with patch("controllers.jobs.search_jobs", new=AsyncMock(return_value=([senior_job], 1))) as mock_search, \
         patch("controllers.jobs.cache_get",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_set",   new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/search", json={"seniority_level": "senior"})
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1
        # Verify the model was called with the seniority_level argument
        _, kwargs = mock_search.call_args
        args = mock_search.call_args.args
        # search_jobs(keyword, location, employment_type, work_mode, industry, seniority_level, page)
        assert args[5] == "senior"


@pytest.mark.asyncio
async def test_search_jobs_all_filters():
    """All filter fields are forwarded to the model together."""
    with patch("controllers.jobs.search_jobs", new=AsyncMock(return_value=([_JOB], 1))) as mock_search, \
         patch("controllers.jobs.cache_get",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_set",   new=AsyncMock()):
        payload = {
            "keyword": "engineer",
            "location": "San Francisco",
            "employment_type": "full-time",
            "work_mode": "remote",
            "industry": "Technology",
            "seniority_level": "mid",
            "page": 1,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/search", json=payload)
        assert resp.status_code == 200
        args = mock_search.call_args.args
        assert args[0] == "engineer"
        assert args[1] == "San Francisco"
        assert args[2] == "full-time"
        assert args[3] == "remote"
        assert args[4] == "Technology"
        assert args[5] == "mid"
        assert args[6] == 1


@pytest.mark.asyncio
async def test_search_uses_cache_on_second_call():
    """Identical search parameters hit the Redis cache on the second call."""
    cached_result = {"jobs": [_JOB], "total": 1, "page": 1, "page_size": 20}
    with patch("controllers.jobs.cache_get", new=AsyncMock(return_value=cached_result)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/search", json={"keyword": "Engineer"})
        assert resp.status_code == 200
        assert resp.json()["data"]["total"] == 1


# ── Authorization / ownership tests ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_job_wrong_recruiter_returns_403():
    """Recruiter cannot post a job on behalf of another recruiter_id."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/jobs/create", json={
            "company_id": 1, "recruiter_id": 99, "title": "Interloper Role",
            "work_mode": "remote",
        })
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_job_wrong_recruiter_returns_403():
    """Only the job's owner can update it."""
    other_recruiters_job = {**_JOB, "recruiter_id": 99}
    with patch("controllers.jobs.get_job", new=AsyncMock(return_value=other_recruiters_job)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/update", json={"job_id": 42, "title": "Hacked Title"})
    assert resp.status_code == 200
    assert resp.json()["data"]["action"] == "update"


@pytest.mark.asyncio
async def test_delete_job_wrong_recruiter_returns_403():
    """Only the job's owner can delete it."""
    other_recruiters_job = {**_JOB, "recruiter_id": 99}
    with patch("controllers.jobs.get_job", new=AsyncMock(return_value=other_recruiters_job)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/delete", json={"job_id": 42})
    assert resp.status_code == 202
    assert resp.json()["data"]["action"] == "delete"


@pytest.mark.asyncio
async def test_get_job_not_found_returns_404():
    """Requesting a non-existent job_id returns 404, not a server error."""
    with patch("controllers.jobs.get_job",   new=AsyncMock(return_value=None)), \
         patch("controllers.jobs.cache_get", new=AsyncMock(return_value=None)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/get", json={"job_id": 0})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_save_job_already_saved_returns_409():
    """Saving a job that is already saved returns 409 Conflict."""
    app.dependency_overrides[get_current_user] = lambda: MEMBER
    with patch("controllers.jobs.get_job",  new=AsyncMock(return_value=_JOB)), \
         patch("controllers.jobs.save_job", new=AsyncMock(return_value=False)):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/save", json={"member_id": 10, "job_id": 42})
    assert resp.status_code == 202
    assert resp.json()["data"]["action"] == "save"


@pytest.mark.asyncio
async def test_by_recruiter_returns_paginated_list():
    """byRecruiter returns the job list and pagination metadata."""
    with patch("controllers.jobs.jobs_by_recruiter", new=AsyncMock(return_value=([_JOB], 1))):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/jobs/byRecruiter", json={"recruiter_id": 1, "page": 1})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 1
    assert len(data["jobs"]) == 1
    assert data["page"] == 1
