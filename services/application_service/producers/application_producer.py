from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_submitted(actor_id, application_id, job_id, member_id) -> None:
    envelope = build_envelope(topics.APPLICATION_SUBMITTED, str(actor_id), "application", str(application_id),
                              {"job_id": str(job_id), "member_id": str(member_id)})
    await publish_event(topics.APPLICATION_SUBMITTED, envelope)


async def emit_status_changed(actor_id, application_id, old_status, new_status, job_id) -> None:
    envelope = build_envelope(topics.APPLICATION_STATUS_CHANGED, str(actor_id), "application", str(application_id),
                              {"old_status": old_status, "new_status": new_status, "job_id": str(job_id)})
    await publish_event(topics.APPLICATION_STATUS_CHANGED, envelope)
