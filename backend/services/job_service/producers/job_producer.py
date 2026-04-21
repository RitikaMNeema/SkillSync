from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_job_viewed(actor_id, job_id, recruiter_id=None) -> None:
    payload = {"job_id": str(job_id)}
    if recruiter_id is not None:
        payload["recruiter_id"] = str(recruiter_id)
    await publish_event(topics.JOB_VIEWED, build_envelope(topics.JOB_VIEWED, str(actor_id), "job", str(job_id), payload))

async def emit_job_saved(actor_id, job_id, recruiter_id=None) -> None:
    payload = {"job_id": str(job_id)}
    if recruiter_id is not None:
        payload["recruiter_id"] = str(recruiter_id)
    await publish_event(topics.JOB_SAVED, build_envelope(topics.JOB_SAVED, str(actor_id), "job", str(job_id), payload))

async def emit_job_closed(actor_id, job_id) -> None:
    await publish_event(topics.JOB_CLOSED, build_envelope(topics.JOB_CLOSED, str(actor_id), "job", str(job_id), {"job_id": str(job_id)}))
