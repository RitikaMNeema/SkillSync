from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_message_sent(sender_id, message_id: str, thread_id: str) -> None:
    envelope = build_envelope(topics.MESSAGE_SENT, str(sender_id), "thread", thread_id,
                              {"message_id": message_id, "thread_id": thread_id})
    await publish_event(topics.MESSAGE_SENT, envelope)
