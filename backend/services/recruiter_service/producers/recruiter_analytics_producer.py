from shared.kafka_utils import topics
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils.producer import publish_event


async def emit_recruiter_profile_viewed(actor_id: int, recruiter_id: int) -> None:
    """Same analytics event type as member profile views, with recruiter entity."""
    if int(actor_id) == int(recruiter_id):
        return
    envelope = build_envelope(
        topics.PROFILE_VIEWED,
        str(actor_id),
        "recruiter",
        str(recruiter_id),
        {"recruiter_id": str(recruiter_id)},
    )
    await publish_event(topics.PROFILE_VIEWED, envelope)


async def emit_recruiter_search_appeared(
    actor_id: int,
    recruiter_id: int,
    *,
    name: str | None = None,
    company: str | None = None,
    industry: str | None = None,
) -> None:
    """Emitted when a recruiter appears in someone else's recruiter search results."""
    payload = {"recruiter_id": str(recruiter_id)}
    if name:
        payload["name"] = str(name)
    if company:
        payload["company"] = str(company)
    if industry:
        payload["industry"] = str(industry)
    envelope = build_envelope(
        topics.RECRUITER_SEARCH_APPEARED,
        str(actor_id),
        "recruiter",
        str(recruiter_id),
        payload,
    )
    await publish_event(topics.RECRUITER_SEARCH_APPEARED, envelope)
