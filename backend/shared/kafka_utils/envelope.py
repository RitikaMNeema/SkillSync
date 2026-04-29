import uuid
from datetime import datetime, timezone


def build_envelope(
    event_type: str,
    actor_id: str,
    entity_type: str,
    entity_id: str,
    payload: dict,
    trace_id: str = None,
    idempotency_key: str = None,
    event_version: int = 1,
    schema_ref: str | None = None,
) -> dict:
    envelope = {
        "event_name":      event_type,
        "event_type":      event_type,
        "event_version":   event_version,
        "trace_id":        trace_id or str(uuid.uuid4()),
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "actor_id":        str(actor_id),
        "entity": {
            "entity_type": entity_type,
            "entity_id":   str(entity_id),
        },
        "payload":         payload,
        "idempotency_key": idempotency_key or str(uuid.uuid4()),
    }
    if schema_ref:
        envelope["schema_ref"] = schema_ref
    return envelope
