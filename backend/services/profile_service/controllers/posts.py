from fastapi import HTTPException

from models.member_mysql import get_member_by_id
from models.post_mongo import create_post, list_feed_posts, list_member_posts


async def create(body: dict) -> dict:
    member = await get_member_by_id(body["member_id"])
    if not member:
        raise HTTPException(404, "Member not found")

    return await create_post(
        body["member_id"],
        member,
        body["content"].strip(),
        body["post_type"],
        body.get("media_url"),
    )


async def feed(page: int) -> dict:
    return await list_feed_posts(page)


async def by_member(member_id: int, page: int) -> dict:
    member = await get_member_by_id(member_id)
    if not member:
        raise HTTPException(404, "Member not found")
    return await list_member_posts(member_id, page)
