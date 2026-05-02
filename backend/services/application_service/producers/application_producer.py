from shared.kafka_utils.producer import publish_event
from shared.kafka_utils.envelope import build_envelope
from shared.kafka_utils import topics


async def emit_submitted(
    actor_id,
    application_id,
    job_id,
    member_id,
    recruiter_id=None,
    *,
    resume_ref=None,
    submission_metadata=None,
    city=None,
    state=None,
) -> None:
    payload = {"job_id": str(job_id), "member_id": str(member_id)}
    if recruiter_id is not None:
        payload["recruiter_id"] = str(recruiter_id)
    if city:
        payload["city"] = str(city)
    if state:
        payload["state"] = str(state)
    # Class doc §6.1 / application.submitted example: resume_ref + submission metadata
    if resume_ref is not None:
        payload["resume_ref"] = str(resume_ref)
    if submission_metadata:
        payload["submission_metadata"] = submission_metadata
    envelope = build_envelope(topics.APPLICATION_SUBMITTED, str(actor_id), "application", str(application_id),
                              payload)
    await publish_event(topics.APPLICATION_SUBMITTED, envelope)


async def emit_status_changed(actor_id, application_id, old_status, new_status, job_id, member_id=None, recruiter_id=None) -> None:
    payload = {"old_status": old_status, "new_status": new_status, "job_id": str(job_id)}
    if member_id is not None:
        payload["member_id"] = str(member_id)
    if recruiter_id is not None:
        payload["recruiter_id"] = str(recruiter_id)
    envelope = build_envelope(
        topics.APPLICATION_STATUS_CHANGED,
        str(actor_id),
        "application",
        str(application_id),
        payload,
    )
    await publish_event(topics.APPLICATION_STATUS_CHANGED, envelope)
