from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_profile_updated(actor_id, member_id, updated_fields: list) -> None:
    envelope = build_envelope(
        topics.PROFILE_UPDATED, str(actor_id), "profile", str(member_id),
        {"updated_fields": updated_fields},
    )
    await publish_event(topics.PROFILE_UPDATED, envelope)
