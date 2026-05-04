"""Unit tests: authenticated recruiter search excludes the actor from SQL (controller wiring)."""
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

import controllers.recruiters as recruiters_ctrl  # noqa: E402


@pytest.mark.asyncio
async def test_search_passes_exclude_recruiter_id_to_model():
    with patch.object(recruiters_ctrl, "search_recruiters", new=AsyncMock(return_value=([], 0))) as sm, \
         patch.object(recruiters_ctrl, "_emit_recruiter_search_appearance_events", new=AsyncMock()):
        await recruiters_ctrl.search("Pat", "Acme", None, 1, actor_id=42)
    sm.assert_called_once_with("Pat", "Acme", None, 1, exclude_recruiter_id=42)
