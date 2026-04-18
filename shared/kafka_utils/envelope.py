import uuid
from datetime import datetime, timezone


def build_envelope(
    event_type: str,
    actor_id: str,
    entity_type: str,
    entity_id: str,
    payload: dict,
    trace_id: str = None,
) -> dict:
    return {
        "event_type":      event_type,
        "trace_id":        trace_id or str(uuid.uuid4()),
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "actor_id":        str(actor_id),
        "entity": {
            "entity_type": entity_type,
            "entity_id":   str(entity_id),
        },
        "payload":         payload,
        "idempotency_key": str(uuid.uuid4()),
    }
