import json
import os
from typing import Any, Dict, Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from shared.kafka_utils.ai_topics import AI_REQUESTS_TOPIC, AI_RESULTS_TOPIC


class KafkaBus:
    def __init__(self) -> None:
        self.bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
        self.group_id = os.getenv("AI_KAFKA_GROUP_ID", "ai-service-group")
        self.producer: Optional[AIOKafkaProducer] = None
        self.consumer: Optional[AIOKafkaConsumer] = None

    async def start_producer(self) -> None:
        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await self.producer.start()

    async def stop_producer(self) -> None:
        if self.producer:
            await self.producer.stop()

    async def publish_request(self, payload: Dict[str, Any]) -> None:
        if not self.producer:
            raise RuntimeError("Kafka producer not started")
        await self.producer.send_and_wait(AI_REQUESTS_TOPIC, payload)

    async def publish_result(self, payload: Dict[str, Any]) -> None:
        if not self.producer:
            raise RuntimeError("Kafka producer not started")
        await self.producer.send_and_wait(AI_RESULTS_TOPIC, payload)

    async def start_consumer(self) -> AIOKafkaConsumer:
        self.consumer = AIOKafkaConsumer(
            AI_REQUESTS_TOPIC,
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.group_id,
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=True,
        )
        await self.consumer.start()
        return self.consumer

    async def stop_consumer(self) -> None:
        if self.consumer:
            await self.consumer.stop()