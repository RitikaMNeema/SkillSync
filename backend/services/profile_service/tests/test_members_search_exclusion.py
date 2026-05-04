"""Unit tests: authenticated member search excludes the actor from SQL (controller wiring)."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = SERVICE_DIR.parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(SERVICE_DIR))

for mod in ("motor", "motor.motor_asyncio", "aiomysql", "aiokafka"):
    sys.modules.setdefault(mod, MagicMock())
_redis_pkg = MagicMock()
_redis_pkg.asyncio = MagicMock()
sys.modules.setdefault("redis", _redis_pkg)
sys.modules.setdefault("redis.asyncio", _redis_pkg.asyncio)

import controllers.members as members_ctrl  # noqa: E402


@pytest.mark.asyncio
async def test_search_passes_exclude_member_id_to_model():
    with patch.object(members_ctrl, "search_members", new=AsyncMock(return_value=([], 0))) as sm, \
         patch.object(members_ctrl, "cache_get", new=AsyncMock(return_value=None)), \
         patch.object(members_ctrl, "cache_set", new=AsyncMock()), \
         patch.object(members_ctrl, "_emit_search_appearance_events", new=AsyncMock()):
        await members_ctrl.search("java", "python", "CA", 2, actor_id=99)
    sm.assert_called_once()
    assert sm.call_args.kwargs == {"exclude_member_id": 99}
    assert sm.call_args.args == ("java", "python", "CA", 2)


@pytest.mark.asyncio
async def test_search_omit_exclude_when_actor_id_none():
    with patch.object(members_ctrl, "search_members", new=AsyncMock(return_value=([], 0))) as sm, \
         patch.object(members_ctrl, "cache_get", new=AsyncMock(return_value=None)), \
         patch.object(members_ctrl, "cache_set", new=AsyncMock()), \
         patch.object(members_ctrl, "_emit_search_appearance_events", new=AsyncMock()):
        await members_ctrl.search("java", None, None, 1, actor_id=None)
    sm.assert_called_once_with("java", None, None, 1, exclude_member_id=None)
