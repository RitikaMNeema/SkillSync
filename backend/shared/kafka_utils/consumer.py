import asyncio
import inspect
import json
import os
from typing import Callable, List
from aiokafka import AIOKafkaConsumer
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.topics import dlq_topic


async def start_consumer(
    group_id: str,
    topics: List[str],
    handler: Callable,
) -> AIOKafkaConsumer:
    max_retries = int(os.getenv("KAFKA_CONSUMER_MAX_RETRIES", "3"))
    retry_backoff_ms = int(os.getenv("KAFKA_CONSUMER_RETRY_BACKOFF_MS", "250"))
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=os.getenv("KAFKA_BROKERS", "kafka:9092"),
        group_id=group_id,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=False,
    )
    await consumer.start()
    print(f"[Kafka Consumer] {group_id} subscribed to {topics}")

    async def _invoke_handler(msg):
        param_count = len(inspect.signature(handler).parameters)
        if param_count == 1:
            return await handler(msg.value)
        return await handler(msg.topic, msg.partition, msg.value)

    async def _send_dlq(msg, exc: Exception):
        original = msg.value if isinstance(msg.value, dict) else {"raw": msg.value}
        dlq_envelope = build_envelope(
            event_type="kafka.consumer.failed",
            actor_id=group_id,
            entity_type="kafka_message",
            entity_id=f"{msg.topic}:{msg.partition}:{msg.offset}",
            payload={
                "source_topic": msg.topic,
                "source_partition": msg.partition,
                "source_offset": msg.offset,
                "group_id": group_id,
                "error": str(exc),
                "original_envelope": original,
            },
            trace_id=original.get("trace_id") if isinstance(original, dict) else None,
            idempotency_key=(
                original.get("idempotency_key")
                if isinstance(original, dict) and original.get("idempotency_key")
                else f"{group_id}:{msg.topic}:{msg.partition}:{msg.offset}"
            ),
            schema_ref="com.skillsync.kafka.consumer.failed.v1",
        )
        await publish_event(dlq_topic(msg.topic), dlq_envelope)

    async def _consume():
        try:
            async for msg in consumer:
                for attempt in range(max_retries + 1):
                    try:
                        await _invoke_handler(msg)
                        await consumer.commit()
                        break
                    except Exception as exc:
                        is_last_attempt = attempt >= max_retries
                        if is_last_attempt:
                            print(f"[Kafka Consumer][{group_id}] Handler failed after retries: {exc}")
                            try:
                                await _send_dlq(msg, exc)
                            except Exception as dlq_exc:
                                print(f"[Kafka Consumer][{group_id}] Failed to publish DLQ event: {dlq_exc}")
                            await consumer.commit()
                            break
                        await asyncio.sleep((retry_backoff_ms / 1000) * (2 ** attempt))
        finally:
            await consumer.stop()

    asyncio.create_task(_consume())
    return consumer
