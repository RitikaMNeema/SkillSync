import sys
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(SERVICE_DIR))
sys.path.insert(0, str(BACKEND_DIR))

for mod in ("aiomysql", "aiokafka", "redis.asyncio", "motor", "motor.motor_asyncio"):
    sys.modules.setdefault(mod, MagicMock())

import controllers.analytics as ctrl  # noqa: E402


def test_get_recruiter_profile_dashboard_shapes_status_fields():
    dashboard = {
        "profile_views_30d": 3,
        "profile_views_daily_30d": [],
        "search_appearances_30d": 7,
        "job_views_30d": 10,
        "job_saves_30d": 2,
        "applicants_30d": 4,
        "messages_sent_30d": 1,
        "application_status_breakdown": [
            {"_id": "submitted", "count": 2},
            {"_id": "interview", "count": 1},
        ],
    }
    with patch("controllers.analytics.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.analytics.recruiter_profile_dashboard", new=AsyncMock(return_value=dashboard)), \
         patch("controllers.analytics.cache_set", new=AsyncMock()):
        result = asyncio.run(ctrl.get_recruiter_profile_dashboard(42))

    assert result["profile_views_30d"] == 3
    assert result["search_appearances_30d"] == 7
    assert result["job_views_30d"] == 10
    assert result["application_status_breakdown"] == [
        {"status": "submitted", "count": 2},
        {"status": "interview", "count": 1},
    ]


def test_get_member_dashboard_shapes_search_and_status_fields():
    dashboard = {
        "profile_views_30d": 8,
        "search_appearances_30d": 5,
        "profile_viewers_recent": [],
        "application_status_breakdown": [
            {"_id": "submitted", "count": 3},
            {"_id": "reviewing", "count": 2},
        ],
    }
    with patch("controllers.analytics.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.analytics.member_dashboard", new=AsyncMock(return_value=dashboard)), \
         patch("controllers.analytics.cache_set", new=AsyncMock()) as cache_set:
        result = asyncio.run(ctrl.get_member_dashboard(11))

    assert result["profile_views_30d"] == 8
    assert result["search_appearances_30d"] == 5
    assert result["application_status_breakdown"] == [
        {"status": "submitted", "count": 3},
        {"status": "reviewing", "count": 2},
    ]
    cache_set.assert_awaited_once()


def test_get_top_jobs_uses_recruiter_scoped_cache_key():
    rows = [{"_id": "job-1", "count": 7}]
    with patch("controllers.analytics.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.analytics.top_jobs_by_applications", new=AsyncMock(return_value=rows)) as top_jobs, \
         patch("controllers.analytics.cache_set", new=AsyncMock()) as cache_set:
        result = asyncio.run(ctrl.get_top_jobs("2026-04-01", recruiter_id=25))

    assert result == [{"job_id": "job-1", "applications": 7}]
    top_jobs.assert_awaited_once_with("2026-04-01", 25)
    cache_set.assert_awaited_once_with("analytics:top_jobs:2026-04-01:25", result, ctrl.TTL)


def test_get_low_traction_uses_recruiter_scoped_cache_key():
    rows = [{"_id": "job-2", "count": 1}]
    with patch("controllers.analytics.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.analytics.low_traction_jobs", new=AsyncMock(return_value=rows)) as low_jobs, \
         patch("controllers.analytics.cache_set", new=AsyncMock()) as cache_set:
        result = asyncio.run(ctrl.get_low_traction("2026-04-01", recruiter_id=33))

    assert result == [{"job_id": "job-2", "applications": 1}]
    low_jobs.assert_awaited_once_with("2026-04-01", 33)
    cache_set.assert_awaited_once_with("analytics:low_traction:2026-04-01:33", result, ctrl.TTL)


def test_ingest_invalidates_analytics_cache():
    envelope = {"event_type": "job.saved", "timestamp": "2026-04-01T00:00:00Z", "idempotency_key": "abc-1"}
    with patch("controllers.analytics.is_duplicate", new=AsyncMock(return_value=False)), \
         patch("controllers.analytics.insert_event", new=AsyncMock()) as insert_event, \
         patch("controllers.analytics.cache_del_pattern", new=AsyncMock()) as cache_del_pattern:
        result = asyncio.run(ctrl.ingest(envelope))
    assert result == {"status": "ok"}
    insert_event.assert_awaited_once_with(envelope)
    cache_del_pattern.assert_awaited_once_with("analytics:*")


def test_get_event_counts_uses_cache_and_formats_rows():
    rows = [{"_id": "job.saved", "count": 4}]
    with patch("controllers.analytics.cache_get", new=AsyncMock(return_value=None)), \
         patch("controllers.analytics.event_counts_by_type", new=AsyncMock(return_value=rows)) as counts, \
         patch("controllers.analytics.cache_set", new=AsyncMock()) as cache_set:
        result = asyncio.run(ctrl.get_event_counts("2026-04-01", recruiter_id=9, job_id="44"))
    assert result == [{"event_type": "job.saved", "count": 4}]
    counts.assert_awaited_once_with("2026-04-01", 9, "44")
    cache_set.assert_awaited_once()
