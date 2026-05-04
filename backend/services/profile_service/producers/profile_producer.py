from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_profile_updated(actor_id, member_id, updated_fields: list) -> None:
    envelope = build_envelope(
        topics.PROFILE_UPDATED, str(actor_id), "profile", str(member_id),
        {"updated_fields": updated_fields},
    )
    await publish_event(topics.PROFILE_UPDATED, envelope)


async def emit_profile_viewed(actor_id, member_id) -> None:
    if actor_id is None:
        return
    try:
        if int(actor_id) == int(member_id):
            return
    except (TypeError, ValueError):
        if str(actor_id).strip() == str(member_id).strip():
            return
    envelope = build_envelope(
        topics.PROFILE_VIEWED, str(actor_id), "profile", str(member_id),
        {"member_id": str(member_id)},
    )
    await publish_event(topics.PROFILE_VIEWED, envelope)


async def emit_member_search_appeared(actor_id, member_id, keyword=None, skill=None, location=None) -> None:
    payload = {"member_id": str(member_id)}
    if keyword:
        payload["keyword"] = str(keyword)
    if skill:
        payload["skill"] = str(skill)
    if location:
        payload["location"] = str(location)
    envelope = build_envelope(
        topics.MEMBER_SEARCH_APPEARED, str(actor_id), "profile", str(member_id), payload
    )
    await publish_event(topics.MEMBER_SEARCH_APPEARED, envelope)
