import json
import logging
import os

from aiokafka import AIOKafkaProducer

log = logging.getLogger(__name__)

_producer: AIOKafkaProducer | None = None
_producer_unavailable = False
_require_kafka = os.getenv("KAFKA_EVENTS_REQUIRED", "false").lower() == "true"


async def get_producer() -> AIOKafkaProducer | None:
    global _producer
    global _producer_unavailable
    if _producer_unavailable and not _require_kafka:
        return None
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=os.getenv("KAFKA_BROKERS", "kafka:9092"),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            retry_backoff_ms=300,
            request_timeout_ms=30000,
        )
        try:
            await _producer.start()
            _producer_unavailable = False
            print("[Kafka Producer] Started")
        except Exception as exc:
            _producer = None
            _producer_unavailable = True
            if _require_kafka:
                raise
            log.warning(
                "Kafka unavailable (%s). Continuing without event publishing. "
                "Set KAFKA_EVENTS_REQUIRED=true to fail hard.",
                exc,
            )
            return None
    return _producer


async def publish_event(topic: str, envelope: dict) -> None:
    producer = await get_producer()
    if producer is None:
        return
    try:
        await producer.send_and_wait(
            topic,
            value=envelope,
            key=envelope.get("idempotency_key"),
        )
    except AttributeError:
        # Observed under dev reload with stale aiokafka producer internals.
        await close_producer()
        producer = await get_producer()
        if producer is None:
            return
        await producer.send_and_wait(
            topic,
            value=envelope,
            key=envelope.get("idempotency_key"),
        )
    except Exception as exc:
        if _require_kafka:
            raise
        log.warning("Kafka publish skipped (%s): topic=%s", exc, topic)


async def close_producer() -> None:
    global _producer, _producer_unavailable
    if _producer:
        await _producer.stop()
        _producer = None
        print("[Kafka Producer] Stopped")
    _producer_unavailable = False
