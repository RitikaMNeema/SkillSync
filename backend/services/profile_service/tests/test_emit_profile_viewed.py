"""Profile view events must not be published for self-views."""
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

from producers import profile_producer as pp  # noqa: E402


@pytest.mark.asyncio
async def test_emit_profile_viewed_skips_self():
    with patch.object(pp, "publish_event", new=AsyncMock()) as pub:
        await pp.emit_profile_viewed(5, 5)
    pub.assert_not_called()


@pytest.mark.asyncio
async def test_emit_profile_viewed_publishes_for_other():
    with patch.object(pp, "publish_event", new=AsyncMock()) as pub:
        await pp.emit_profile_viewed(3, 9)
    pub.assert_awaited_once()
