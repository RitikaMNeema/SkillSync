"""
Unit tests for post controllers.
Mocks all DB/Kafka — runs in <2 seconds, no Docker needed.
"""
import pytest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException

import controllers.posts as ctrl


# ---------- create ----------

@pytest.mark.asyncio
async def test_create_post_text_only_succeeds():
    body = {"member_id": 1, "content": "hello", "post_type": "post", "media_url": None}
    fake_member = {"member_id": 1, "first_name": "A", "last_name": "B"}
    fake_post = {"post_id": "abc", "post_type": "post", "media_url": None, "content": "hello"}

    with patch("controllers.posts.get_member_by_id", new=AsyncMock(return_value=fake_member)), \
         patch("controllers.posts.create_post", new=AsyncMock(return_value=fake_post)), \
         patch("controllers.posts.emit_post_created", new=AsyncMock()):
        result = await ctrl.create(body, viewer_id=1)
    assert result["post_id"] == "abc"


@pytest.mark.asyncio
async def test_create_post_with_image_succeeds():
    body = {"member_id": 1, "content": "check this", "post_type": "photo", "media_url": "/posts/image/xyz"}
    with patch("controllers.posts.get_member_by_id",
               new=AsyncMock(return_value={"member_id": 1, "first_name": "A"})), \
         patch("controllers.posts.create_post",
               new=AsyncMock(return_value={"post_id": "p1", "post_type": "photo",
                                            "media_url": "/posts/image/xyz"})), \
         patch("controllers.posts.emit_post_created", new=AsyncMock()):
        result = await ctrl.create(body, viewer_id=1)
    assert result["media_url"] == "/posts/image/xyz"


@pytest.mark.asyncio
async def test_create_post_rejects_wrong_actor():
    body = {"member_id": 1, "content": "x", "post_type": "post", "media_url": None}
    with pytest.raises(HTTPException) as e:
        await ctrl.create(body, viewer_id=99)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_create_post_rejects_missing_member():
    body = {"member_id": 1, "content": "x", "post_type": "post", "media_url": None}
    with patch("controllers.posts.get_member_by_id", new=AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as e:
            await ctrl.create(body, viewer_id=1)
    assert e.value.status_code == 404


# ---------- feed ----------

@pytest.mark.asyncio
async def test_feed_passes_viewer_id():
    fake_response = {"posts": [], "total": 0, "page": 1, "page_size": 10}
    with patch("controllers.posts.list_feed_posts",
               new=AsyncMock(return_value=fake_response)) as mock:
        result = await ctrl.feed(page=1, viewer_id=7)
    mock.assert_awaited_once_with(1, viewer_id=7)
    assert result["total"] == 0


@pytest.mark.asyncio
async def test_feed_returns_posts_list():
    fake = {"posts": [{"post_id": "p1"}, {"post_id": "p2"}], "total": 2, "page": 1, "page_size": 10}
    with patch("controllers.posts.list_feed_posts", new=AsyncMock(return_value=fake)):
        result = await ctrl.feed(page=1, viewer_id=1)
    assert len(result["posts"]) == 2


# ---------- like ----------

@pytest.mark.asyncio
async def test_like_toggles_and_emits_event():
    toggle = {"post_id": "p1", "liked": True, "like_count": 1}
    with patch("controllers.posts.post_exists", new=AsyncMock(return_value=True)), \
         patch("controllers.posts.toggle_like", new=AsyncMock(return_value=toggle)), \
         patch("controllers.posts.emit_post_liked", new=AsyncMock()) as emit:
        result = await ctrl.like("p1", member_id=5, viewer_id=5)
    assert result == toggle
    emit.assert_awaited_once()


@pytest.mark.asyncio
async def test_like_rejects_wrong_actor():
    with pytest.raises(HTTPException) as e:
        await ctrl.like("p1", member_id=5, viewer_id=99)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_like_rejects_missing_post():
    with patch("controllers.posts.post_exists", new=AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as e:
            await ctrl.like("nope", member_id=1, viewer_id=1)
    assert e.value.status_code == 404


# ---------- comment ----------

@pytest.mark.asyncio
async def test_comment_creates_and_emits():
    fake_comment = {"comment_id": "c1", "content": "nice"}
    with patch("controllers.posts.post_exists", new=AsyncMock(return_value=True)), \
         patch("controllers.posts.create_comment", new=AsyncMock(return_value=fake_comment)), \
         patch("controllers.posts.emit_post_commented", new=AsyncMock()) as emit:
        result = await ctrl.comment("p1", member_id=5, content="nice", viewer_id=5)
    assert result["comment_id"] == "c1"
    emit.assert_awaited_once()


@pytest.mark.asyncio
async def test_comment_rejects_wrong_actor():
    with pytest.raises(HTTPException) as e:
        await ctrl.comment("p1", member_id=5, content="x", viewer_id=99)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_comments_list_rejects_missing_post():
    with patch("controllers.posts.post_exists", new=AsyncMock(return_value=False)):
        with pytest.raises(HTTPException) as e:
            await ctrl.comments("nope", page=1)
    assert e.value.status_code == 404


# ---------- delete ----------

@pytest.mark.asyncio
async def test_delete_rejects_non_owner():
    with patch("controllers.posts.get_post_owner", new=AsyncMock(return_value=42)):
        with pytest.raises(HTTPException) as e:
            await ctrl.delete("p1", member_id=99, viewer_id=99)
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_rejects_missing_post():
    with patch("controllers.posts.get_post_owner", new=AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as e:
            await ctrl.delete("nope", member_id=1, viewer_id=1)
    assert e.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_succeeds_for_owner():
    with patch("controllers.posts.get_post_owner", new=AsyncMock(return_value=5)), \
         patch("controllers.posts.delete_post",
               new=AsyncMock(return_value={"deleted": True, "likes_removed": 2,
                                            "comments_removed": 3})):
        result = await ctrl.delete("p1", member_id=5, viewer_id=5)
    assert result["deleted"] is True
    assert result["likes_removed"] == 2


# ---------- schemas ----------

def test_schema_rejects_empty_post():
    from pydantic import ValidationError
    from schemas.posts import CreatePostRequest
    with pytest.raises(ValidationError):
        CreatePostRequest(member_id=1, content="", media_url=None)


def test_schema_accepts_image_only():
    from schemas.posts import CreatePostRequest
    p = CreatePostRequest(member_id=1, content="", media_url="/posts/image/abc")
    assert p.media_url == "/posts/image/abc"


def test_schema_accepts_text_and_image():
    from schemas.posts import CreatePostRequest
    p = CreatePostRequest(member_id=1, content="hi", media_url="/posts/image/abc")
    assert p.content == "hi"
    assert p.media_url == "/posts/image/abc"


def test_schema_rejects_content_too_long():
    from pydantic import ValidationError
    from schemas.posts import CreatePostRequest
    with pytest.raises(ValidationError):
        CreatePostRequest(member_id=1, content="x" * 2001, media_url=None)


def test_comment_schema_rejects_empty():
    from pydantic import ValidationError
    from schemas.posts import CreateCommentRequest
    with pytest.raises(ValidationError):
        CreateCommentRequest(post_id="p1", member_id=1, content="   ")