from typing import Any


def validate_event_envelope(envelope: dict[str, Any], topic: str) -> None:
    required_top = ("event_type", "trace_id", "actor_id", "entity", "payload", "idempotency_key")
    missing = [field for field in required_top if field not in envelope]
    if missing:
        raise ValueError(f"Invalid event on {topic}: missing fields {missing}")

    entity = envelope.get("entity") or {}
    if not isinstance(entity, dict) or "entity_type" not in entity or "entity_id" not in entity:
        raise ValueError(f"Invalid event on {topic}: entity must include entity_type/entity_id")

    payload = envelope.get("payload")
    if not isinstance(payload, dict):
        raise ValueError(f"Invalid event on {topic}: payload must be an object")

