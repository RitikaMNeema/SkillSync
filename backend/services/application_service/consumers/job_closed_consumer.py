from shared.kafka_utils.consumer import start_consumer
from shared.kafka_utils.contracts import validate_event_envelope
from shared.kafka_utils import topics
from shared.utils.idempotency import is_duplicate
from models.application import auto_reject_by_job
from producers.application_producer import emit_status_changed


async def start_job_closed_consumer() -> None:
    async def handler(topic, partition, envelope):
        validate_event_envelope(envelope, topic)
        if await is_duplicate(envelope["idempotency_key"]):
            print(f"[application-consumer] Duplicate skipped: {envelope['idempotency_key']}")
            return

        job_id = envelope.get("entity", {}).get("entity_id")
        if not job_id:
            return

        affected = await auto_reject_by_job(job_id)
        print(f"[application-consumer] Auto-rejected {affected} applications for job {job_id}")

        if affected > 0:
            await emit_status_changed(
                envelope.get("actor_id", "system"),
                f"bulk-{job_id}",
                "submitted",
                "rejected",
                job_id,
                None,
                envelope.get("actor_id"),
            )

    await start_consumer("application-service-job-closed", [topics.JOB_CLOSED], handler)
