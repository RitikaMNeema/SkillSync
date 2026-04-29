from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.kafka_utils.topics import ALL_TOPICS
from shared.utils.idempotency import is_duplicate
from models.event import insert_event


async def _handle(msg: dict) -> None:
    validate_event_envelope(msg, msg.get("event_type", "unknown"))
    key = msg.get("idempotency_key")
    if key and await is_duplicate(f"analytics:{key}"):
        return
    try:
        await insert_event(msg)
    except Exception as e:
        if getattr(e, "code", None) == 11000 or "duplicate key" in str(e).lower():
            return
        raise


async def start_events_consumer() -> None:
    await start_consumer("analytics-service", ALL_TOPICS, _handle)
