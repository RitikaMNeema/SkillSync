import json
import os
import sys
import threading
try:
    from confluent_kafka import Consumer, KafkaError, KafkaException
except Exception:  # pragma: no cover - optional dependency in tests
    Consumer = None
    KafkaError = None
    KafkaException = Exception
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")

def process_job_closed_message(db: Session, msg_json: dict):
    """Idempotently process a job.closed message."""
    event_type = msg_json.get("event_type")
    if event_type == "job.closed":
        job_id = msg_json.get("entity", {}).get("entity_id")
        idempotency_key = msg_json.get("idempotency_key")
        if job_id:
            # Check idempotency first so retries don't write duplicates.
            query = db.query(models.ClosedJob)
            if idempotency_key:
                already_seen = query.filter(models.ClosedJob.event_idempotency_key == idempotency_key).first()
                if already_seen:
                    logger.info("job.closed event already processed, skipping duplicate delivery")
                    return

            job = query.filter(models.ClosedJob.job_id == job_id).first()
            if not job:
                logger.info(f"Adding closed job {job_id} to cache.")
                closed_j = models.ClosedJob(job_id=job_id, event_idempotency_key=idempotency_key)
                db.add(closed_j)
                db.commit()
            else:
                logger.info(f"Job {job_id} already marked closed, skipping (idempotent)")

def consume_once(consumer, db: Session):
    msg = consumer.poll(timeout=1.0)
    if msg is None:
        return

    if msg.error():
        if msg.error().code() == KafkaError._PARTITION_EOF:
            return
        raise KafkaException(msg.error())

    payload = json.loads(msg.value().decode('utf-8'))
    process_job_closed_message(db, payload)

def consume_loop():
    if Consumer is None:
        logger.info("Kafka consumer library unavailable; skipping background consumer startup.")
        return

    conf = {
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': 'application-service-group',
        'auto.offset.reset': 'earliest'
    }

    try:
        consumer = Consumer(conf)
    except Exception as e:
        logger.error(f"Cannot create Kafka consumer: {e}")
        sys.exit(1)

    consumer.subscribe(['job.closed'])

    db = SessionLocal()
    
    try:
        while True:
            try:
                consume_once(consumer, db)
            except Exception as e:
                logger.error(f"Failed to process message: {e}")
                    
    finally:
        consumer.close()
        db.close()

def start_consumer_background():
    thread = threading.Thread(target=consume_loop, daemon=True)
    thread.start()
    return thread

if __name__ == "__main__":
    consume_loop()
