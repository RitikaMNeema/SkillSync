"""Profile view counts must ignore self-views (viewer id == profile owner id)."""
from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(SERVICE_DIR))
sys.path.insert(0, str(BACKEND_DIR))

for mod in ("aiomysql", "aiokafka", "redis.asyncio", "motor", "motor.motor_asyncio"):
    sys.modules.setdefault(mod, MagicMock())

from models import event as event_model  # noqa: E402


def test_is_self_profile_view_event_true_for_member_owner():
    assert event_model._is_self_profile_view_event(
        {
            "event_type": "profile.viewed",
            "actor_id": "7",
            "entity": {"entity_type": "profile", "entity_id": "7"},
            "payload": {"member_id": "7"},
        }
    )


def test_is_self_profile_view_event_false_for_other_viewer():
    assert not event_model._is_self_profile_view_event(
        {
            "event_type": "profile.viewed",
            "actor_id": "2",
            "entity": {"entity_type": "profile", "entity_id": "7"},
            "payload": {"member_id": "7"},
        }
    )


def test_is_self_profile_view_event_false_for_non_profile_event():
    assert not event_model._is_self_profile_view_event({"event_type": "job.saved", "actor_id": "1"})


@pytest.mark.asyncio
async def test_insert_event_does_not_persist_self_profile_view():
    mock_coll = MagicMock()
    mock_coll.insert_one = AsyncMock()
    mock_db = MagicMock()
    mock_db.events = mock_coll

    with patch.object(event_model, "get_db", return_value=mock_db):
        await event_model.insert_event(
            {
                "event_type": "profile.viewed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actor_id": "99",
                "entity": {"entity_type": "profile", "entity_id": "99"},
                "payload": {"member_id": "99"},
                "idempotency_key": "idem-self-1",
            }
        )
    mock_coll.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_insert_event_persists_other_user_profile_view():
    mock_coll = MagicMock()
    mock_coll.insert_one = AsyncMock()
    mock_db = MagicMock()
    mock_db.events = mock_coll

    ts = datetime.now(timezone.utc).isoformat()
    with patch.object(event_model, "get_db", return_value=mock_db):
        await event_model.insert_event(
            {
                "event_type": "profile.viewed",
                "timestamp": ts,
                "actor_id": "3",
                "entity": {"entity_type": "profile", "entity_id": "9"},
                "payload": {"member_id": "9"},
                "idempotency_key": "idem-other-1",
            }
        )
    mock_coll.insert_one.assert_awaited_once()


def test_member_dashboard_queries_include_actor_exclusion():
    captured: list[dict] = []

    class FakeAggCursor:
        def __init__(self, pipeline: list):
            self.pipeline = pipeline

        async def to_list(self, length=None):
            if self.pipeline and isinstance(self.pipeline[0], dict) and "$match" in self.pipeline[0]:
                m = self.pipeline[0]["$match"]
                if m.get("event_type") == "profile.viewed":
                    captured.append(m)
            return []

    class FakeEvents:
        async def count_documents(self, q):
            if q.get("event_type") == "profile.viewed":
                captured.append(q)
            return 0

        def aggregate(self, pipeline):
            """Motor returns a cursor synchronously; ``to_list`` on the cursor is awaited."""
            return FakeAggCursor(pipeline)

    class FakeDb:
        events = FakeEvents()

    async def run():
        with patch.object(event_model, "get_db", return_value=FakeDb()):
            await event_model.member_dashboard(42)

    asyncio.run(run())
    assert len(captured) >= 2
    want = event_model._not_actor_is_profile_owner(42)["$nor"]
    for doc in captured:
        assert doc.get("$nor") == want
