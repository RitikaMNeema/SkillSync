import asyncio
import json
import os
from typing import Callable, List
from aiokafka import AIOKafkaConsumer


async def start_consumer(
    group_id: str,
    topics: List[str],
    handler: Callable,
) -> AIOKafkaConsumer:
    consumer = AIOKafkaConsumer(
        *topics,
        bootstrap_servers=os.getenv("KAFKA_BROKERS", "kafka:9092"),
        group_id=group_id,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )
    await consumer.start()
    print(f"[Kafka Consumer] {group_id} subscribed to {topics}")

    async def _consume():
        try:
            async for msg in consumer:
                try:
                    await handler(msg.topic, msg.partition, msg.value)
                except Exception as exc:
                    print(f"[Kafka Consumer][{group_id}] Handler error: {exc}")
        finally:
            await consumer.stop()

    asyncio.create_task(_consume())
    return consumer
