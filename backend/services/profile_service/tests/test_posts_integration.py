"""
Smoke tests — verify HTTP layer, routing, auth, and envelope shape.
DB functions are mocked so these run fast without needing containers.
Lifespan is disabled to avoid binding DB clients to a per-test event loop.
"""
import os
from unittest.mock import AsyncMock, patch

# Env vars must be set before importing main
os.environ.setdefault("JWT_SECRET", "super_secret_jwt_key_change_in_production")
os.environ.setdefault("MYSQL_HOST", "localhost")
os.environ.setdefault("MYSQL_PORT", "3307")
os.environ.setdefault("MYSQL_USER", "linkedin_user")
os.environ.setdefault("MYSQL_PASSWORD", "linkedin_pw")
os.environ.setdefault("MYSQL_DATABASE", "linkedin_db")
os.environ.setdefault("MONGO_URI", "mongodb://root:rootpw@localhost:27018/linkedin_db?authSource=admin")
os.environ.setdefault("REDIS_HOST", "localhost")
os.environ.setdefault("REDIS_PORT", "6380")
os.environ.setdefault("KAFKA_BROKERS", "localhost:9093")

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from shared.middleware.auth import get_current_user  # noqa: E402

# Disable the lifespan so TestClient doesn't try to open real DB pools
app.router.lifespan_context = None

# One shared client — avoids repeated lifespan startup per test
client = TestClient(app)


def _auth_as(user_id: int):
    app.dependency_overrides[get_current_user] = lambda: {
        "user_id": user_id, "role": "member", "token": "test-token"
    }


def _clear_auth():
    app.dependency_overrides.clear()


def test_health_endpoint():
    """Basic liveness check — no auth required."""
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["service"] == "profile-service"


def test_feed_endpoint_returns_correct_envelope():
    """Feed endpoint returns 200 with success envelope and post fields."""
    fake_feed = {
        "posts": [{
            "post_id": "p1", "member_id": 1, "post_type": "post",
            "content": "hello", "media_url": None,
            "created_at": "2025-01-01T00:00:00",
            "author": {"first_name": "Test", "last_name": "User",
                       "headline": "Eng", "profile_photo_url": None},
            "like_count": 0, "comment_count": 0, "viewer_has_liked": False,
        }],
        "total": 1, "page": 1, "page_size": 10,
    }
    _auth_as(1)
    try:
        with patch("controllers.posts.list_feed_posts",
                   new=AsyncMock(return_value=fake_feed)):
            r = client.post("/posts/feed", json={"page": 1})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        post = body["data"]["posts"][0]
        assert post["post_id"] == "p1"
        assert "like_count" in post
        assert "comment_count" in post
        assert "viewer_has_liked" in post
    finally:
        _clear_auth()


def test_like_endpoint_wiring():
    """Like endpoint returns 200 and correct toggle response."""
    _auth_as(1)
    try:
        with patch("controllers.posts.post_exists",
                   new=AsyncMock(return_value=True)), \
             patch("controllers.posts.toggle_like",
                   new=AsyncMock(return_value={"post_id": "p1", "liked": True, "like_count": 1})), \
             patch("controllers.posts.emit_post_liked", new=AsyncMock()):
            r = client.post("/posts/like", json={"post_id": "p1", "member_id": 1})
        assert r.status_code == 200
        assert r.json()["data"] == {"post_id": "p1", "liked": True, "like_count": 1}
    finally:
        _clear_auth()


def test_delete_endpoint_enforces_actor_match():
    """Delete endpoint rejects if the auth'd user doesn't match member_id in body."""
    _auth_as(99)  # authed as 99, but body says member_id=1
    try:
        r = client.post("/posts/delete", json={"post_id": "p1", "member_id": 1})
        assert r.status_code == 403
    finally:
        _clear_auth()