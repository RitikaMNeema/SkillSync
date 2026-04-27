from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_post_created(actor_id, post_id, post_type, has_media):
    envelope = build_envelope(
        topics.POST_CREATED, str(actor_id), "post", str(post_id),
        {"post_type": post_type, "has_media": has_media},
    )
    await publish_event(topics.POST_CREATED, envelope)


async def emit_post_liked(actor_id, post_id, liked, like_count):
    envelope = build_envelope(
        topics.POST_LIKED, str(actor_id), "post", str(post_id),
        {"liked": liked, "like_count": like_count},
    )
    await publish_event(topics.POST_LIKED, envelope)


async def emit_post_commented(actor_id, post_id, comment_id):
    envelope = build_envelope(
        topics.POST_COMMENTED, str(actor_id), "post", str(post_id),
        {"comment_id": comment_id},
    )
    await publish_event(topics.POST_COMMENTED, envelope)

async def emit_post_deleted(actor_id, post_id):
    envelope = build_envelope(
        topics.POST_DELETED, str(actor_id), "post", str(post_id),
        {"deleted": True},
    )
    await publish_event(topics.POST_DELETED, envelope)