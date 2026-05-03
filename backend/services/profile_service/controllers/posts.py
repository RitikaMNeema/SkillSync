from fastapi import HTTPException, UploadFile

from models.author_hydration import hydrate_author_for_user_id
from models.member_mysql import get_member_by_id
from models.recruiters_mysql import get_recruiter_row_for_author
from models.post_interactions_mongo import (
    toggle_like, create_comment, list_comments,
)
from models.post_media_mongo import upload_image
from models.post_mongo import (
    create_post,
    delete_post,
    get_post_owner,
    list_feed_posts,
    list_member_posts,
    post_exists,
)
from producers.post_producer import (
    emit_post_created, emit_post_liked, emit_post_commented,
)
from producers.profile_command_producer import enqueue_profile_command


async def create(body: dict, viewer_id: int) -> dict:
    uid = int(body["member_id"])
    vid = int(viewer_id)
    if uid != vid:
        raise HTTPException(403, "Cannot create post for another user")
    author = await hydrate_author_for_user_id(uid)
    if not author:
        raise HTTPException(
            404,
            "No member or recruiter profile found for this account. Finish onboarding before posting.",
        )
    member = await get_member_by_id(uid)

    post = await create_post(
        uid,
        author,
        (body.get("content") or "").strip(),
        body["post_type"],
        body.get("media_url"),
        is_member=member is not None,
    )

    try:
        await emit_post_created(
            vid, post["post_id"], post["post_type"],
            has_media=bool(post.get("media_url")),
        )
    except Exception:
        pass  # don't fail the request if Kafka is down

    return post


async def feed(page: int, viewer_id: int) -> dict:
    return await list_feed_posts(page, viewer_id=viewer_id)


async def by_member(member_id: int, page: int, viewer_id: int) -> dict:
    if not await get_member_by_id(member_id) and not await get_recruiter_row_for_author(member_id):
        raise HTTPException(404, "Profile not found")
    return await list_member_posts(member_id, page, viewer_id=viewer_id)


async def like(post_id: str, member_id: int, viewer_id: int) -> dict:
    if member_id != viewer_id:
        raise HTTPException(403, "Cannot like on behalf of another member")
    if not await post_exists(post_id):
        raise HTTPException(404, "Post not found")

    result = await toggle_like(post_id, member_id)
    try:
        await emit_post_liked(viewer_id, post_id, result["liked"], result["like_count"])
    except Exception:
        pass
    return result


async def comment(post_id: str, member_id: int, content: str, viewer_id: int) -> dict:
    if member_id != viewer_id:
        raise HTTPException(403, "Cannot comment on behalf of another member")
    if not await post_exists(post_id):
        raise HTTPException(404, "Post not found")

    doc = await create_comment(post_id, member_id, content.strip())
    try:
        await emit_post_commented(viewer_id, post_id, doc["comment_id"])
    except Exception:
        pass
    return doc


async def comments(post_id: str, page: int) -> dict:
    if not await post_exists(post_id):
        raise HTTPException(404, "Post not found")
    return await list_comments(post_id, page)


async def upload(file: UploadFile) -> dict:
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    data = await file.read()
    try:
        media_url = await upload_image(data, file.filename, file.content_type or "")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"media_url": media_url}

async def delete(post_id: str, member_id: int, viewer_id: int) -> dict:
    if member_id != viewer_id:
        raise HTTPException(403, "Cannot delete on behalf of another member")
    owner = await get_post_owner(post_id)
    if owner is None:
        raise HTTPException(404, "Post not found")
    if owner != viewer_id:
        raise HTTPException(403, "You can only delete your own posts")

    result = await delete_post(post_id)

    # Fire-and-forget Kafka event
    try:
        from producers.post_producer import emit_post_deleted
        await emit_post_deleted(viewer_id, post_id)
    except Exception:
        pass

    return {"post_id": post_id, **result}


async def enqueue_create(body: dict, actor: dict) -> dict:
    return await enqueue_profile_command("post_create", actor, {"body": body})


async def enqueue_like(post_id: str, member_id: int, actor: dict) -> dict:
    return await enqueue_profile_command("post_like", actor, {"post_id": post_id, "member_id": member_id})


async def enqueue_comment(post_id: str, member_id: int, content: str, actor: dict) -> dict:
    return await enqueue_profile_command(
        "post_comment",
        actor,
        {"post_id": post_id, "member_id": member_id, "content": content},
    )


async def enqueue_delete(post_id: str, member_id: int, actor: dict) -> dict:
    return await enqueue_profile_command("post_delete", actor, {"post_id": post_id, "member_id": member_id})