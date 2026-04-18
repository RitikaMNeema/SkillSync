import json
import os
from aiokafka import AIOKafkaProducer

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=os.getenv("KAFKA_BROKERS", "kafka:9092"),
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            retry_backoff_ms=300,
            request_timeout_ms=30000,
        )
        await _producer.start()
        print("[Kafka Producer] Started")
    return _producer


async def publish_event(topic: str, envelope: dict) -> None:
    producer = await get_producer()
    await producer.send_and_wait(
        topic,
        value=envelope,
        key=envelope.get("idempotency_key"),
    )


async def close_producer() -> None:
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        print("[Kafka Producer] Stopped")
