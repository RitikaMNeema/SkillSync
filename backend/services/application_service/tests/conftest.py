import sys
import os
from unittest.mock import MagicMock

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
_SERVICE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

for p in (_REPO_ROOT, _BACKEND_ROOT, _SERVICE_ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

# Optional runtime deps are mocked for isolated unit tests.
for mod in ("jose", "redis.asyncio", "aiomysql", "aiokafka"):
    sys.modules.setdefault(mod, MagicMock())


def pytest_configure(config):
    config.addinivalue_line("markers", "anyio: run test with anyio plugin")


import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
