import json
import os
import uuid
import hashlib
from datetime import datetime
try:
    from confluent_kafka import Producer
except Exception:  # pragma: no cover - optional dependency in tests
    Producer = None

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")

try:
    producer = Producer({"bootstrap.servers": KAFKA_BROKER})
except Exception as e:
    producer = None
    print(f"Warning: Failed to connect to Kafka - {e}")


def build_event_envelope(
    topic: str,
    event_type: str,
    actor_id: str,
    entity_type: str,
    entity_id: str,
    payload: dict,
    trace_id: str | None = None,
    idempotency_key: str | None = None,
):
    material = json.dumps(
        {
            "topic": topic,
            "event_type": event_type,
            "actor_id": actor_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload,
        },
        sort_keys=True,
        default=str,
    )
    return {
        "event_type": event_type,
        "trace_id": trace_id or str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "actor_id": actor_id,
        "entity": {
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
        "payload": payload,
        "idempotency_key": idempotency_key or hashlib.sha256(material.encode("utf-8")).hexdigest(),
    }

def send_kafka_event(
    topic: str,
    event_type: str,
    actor_id: str,
    entity_type: str,
    entity_id: str,
    payload: dict,
    trace_id: str | None = None,
    idempotency_key: str | None = None,
    retries: int = 3,
):
    if not producer:
        print(f"Mock Kafka Event to {topic}: {event_type} - {payload}")
        return

    event = build_event_envelope(topic, event_type, actor_id, entity_type, entity_id, payload, trace_id, idempotency_key)

    last_error = None
    for attempt in range(retries):
        try:
            producer.produce(topic, key=entity_id.encode('utf-8'), value=json.dumps(event).encode('utf-8'))
            producer.flush()
            return
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                producer.poll(0.1)
                continue
            print(f"Error producing to Kafka after {retries} attempts: {e}")
    if last_error:
        raise last_error
