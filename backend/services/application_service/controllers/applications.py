from fastapi import HTTPException
from models.application import (
    submit_application_transaction, get_application, get_job_recruiter_id, get_member_location,
    apps_by_job, apps_by_member,
    update_status, withdraw_application, add_note, get_notes,
    VALID_TRANSITIONS, PAGE_SIZE,
)
from producers.application_producer import emit_submitted, emit_status_changed
from producers.application_command_producer import enqueue_application_command
from models.command_status import get_command_status


async def submit(job_id, member_id, resume_url, cover_letter, answers, actor: dict) -> dict:
    if actor.get("role") != "member" or str(actor["user_id"]) != str(member_id):
        raise HTTPException(403, "Members may only submit applications for themselves")
    try:
        app_id = await submit_application_transaction(job_id, member_id, resume_url, cover_letter, answers)
    except ValueError as e:
        msg = str(e)
        if msg == "JOB_NOT_FOUND":
            raise HTTPException(404, "Job not found")
        if msg == "JOB_CLOSED":
            raise HTTPException(400, "Cannot apply to a closed job")
        if msg == "DUPLICATE":
            raise HTTPException(409, "Already applied to this job")
        raise
    submitted_app = await get_application(app_id)
    recruiter_id = submitted_app["job_recruiter_id"] if submitted_app else None
    loc = await get_member_location(member_id)
    city = (loc or {}).get("location_city")
    state = (loc or {}).get("location_state")
    await emit_submitted(member_id, app_id, job_id, member_id, recruiter_id, city=city, state=state)
    return {"application_id": app_id, "job_id": job_id, "member_id": member_id, "status": "submitted"}


async def get(application_id: int, actor: dict) -> dict:
    app = await get_application(application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    role = actor.get("role")
    uid = str(actor["user_id"])
    if role == "member":
        if str(app["member_id"]) != uid:
            raise HTTPException(403, "Not authorized to view this application")
    elif role == "recruiter":
        if str(app["job_recruiter_id"]) != uid:
            raise HTTPException(403, "Not authorized to view this application")
    else:
        raise HTTPException(403, "Not authorized to view this application")
    notes = await get_notes(application_id)
    return {**app, "notes": notes}


async def by_job(job_id: int, page: int, actor: dict) -> dict:
    if actor.get("role") != "recruiter":
        raise HTTPException(403, "Only the posting recruiter can list applicants for a job")
    owner = await get_job_recruiter_id(job_id)
    if owner is None:
        raise HTTPException(404, "Job not found")
    if str(owner) != str(actor["user_id"]):
        raise HTTPException(403, "Not authorized to view applications for this job")
    rows, total = await apps_by_job(job_id, page)
    return {"applications": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def by_member(member_id: int, page: int, actor: dict) -> dict:
    if actor.get("role") != "member" or str(actor["user_id"]) != str(member_id):
        raise HTTPException(403, "Not authorized to list these applications")
    rows, total = await apps_by_member(member_id, page)
    return {"applications": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def update_app_status(application_id: int, new_status: str, actor_id) -> dict:
    app = await get_application(application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if str(actor_id) != str(app["job_recruiter_id"]):
        raise HTTPException(403, "Not authorized to update this application")
    allowed = VALID_TRANSITIONS.get(app["status"], [])
    if new_status not in allowed:
        raise HTTPException(400, f"Invalid transition: {app['status']} → {new_status}. Allowed: {allowed}")
    old_status = app["status"]
    await update_status(application_id, new_status)
    await emit_status_changed(
        str(actor_id),
        application_id,
        old_status,
        new_status,
        app["job_id"],
        app["member_id"],
        app["job_recruiter_id"],
    )
    return {"application_id": application_id, "old_status": old_status, "new_status": new_status}


async def add_recruiter_note(application_id: int, recruiter_id: int, note_text: str, actor: dict) -> dict:
    if actor.get("role") != "recruiter":
        raise HTTPException(403, "Only recruiters can add notes")
    if str(actor["user_id"]) != str(recruiter_id):
        raise HTTPException(403, "Cannot add notes on behalf of another recruiter")
    app = await get_application(application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if str(app["job_recruiter_id"]) != str(recruiter_id):
        raise HTTPException(403, "Not authorized to annotate this application")
    note_id = await add_note(application_id, recruiter_id, note_text)
    return {"note_id": note_id, "application_id": application_id}


async def withdraw(application_id: int, member_id) -> dict:
    app = await get_application(application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if str(app["member_id"]) != str(member_id):
        raise HTTPException(403, "Not authorized to withdraw this application")
    allowed = VALID_TRANSITIONS.get(app["status"], [])
    if "withdrawn" not in allowed:
        raise HTTPException(400, f"Cannot withdraw application with status: {app['status']}")
    old_status = app["status"]
    if not await withdraw_application(application_id):
        raise HTTPException(400, "Withdraw failed")
    await emit_status_changed(
        str(member_id),
        application_id,
        old_status,
        "withdrawn",
        app["job_id"],
        app["member_id"],
        app["job_recruiter_id"],
    )
    return {"application_id": application_id, "old_status": old_status, "new_status": "withdrawn"}


async def enqueue_submit(job_id, member_id, resume_url, cover_letter, answers, actor: dict) -> dict:
    if actor.get("role") != "member" or str(actor["user_id"]) != str(member_id):
        raise HTTPException(403, "Members may only submit applications for themselves")
    return await enqueue_application_command(
        "submit",
        actor,
        {
            "job_id": job_id,
            "member_id": member_id,
            "resume_url": resume_url,
            "cover_letter": cover_letter,
            "answers": answers,
        },
    )


async def enqueue_update_status(application_id: int, new_status: str, actor: dict) -> dict:
    if actor.get("role") != "recruiter":
        raise HTTPException(403, "Only recruiters can update application status")
    return await enqueue_application_command(
        "update_status",
        actor,
        {
            "application_id": application_id,
            "new_status": new_status,
        },
    )


async def enqueue_withdraw(application_id: int, actor: dict) -> dict:
    if actor.get("role") != "member":
        raise HTTPException(403, "Only members can withdraw their applications")
    return await enqueue_application_command(
        "withdraw",
        actor,
        {"application_id": application_id},
    )


async def enqueue_add_recruiter_note(application_id: int, recruiter_id: int, note_text: str, actor: dict) -> dict:
    if actor.get("role") != "recruiter" or str(actor.get("user_id")) != str(recruiter_id):
        raise HTTPException(403, "Cannot add notes on behalf of another recruiter")
    return await enqueue_application_command(
        "add_note",
        actor,
        {
            "application_id": application_id,
            "recruiter_id": recruiter_id,
            "note_text": note_text,
        },
    )


async def get_command(command_id: str, actor: dict) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    # status is intentionally minimal and does not include private data outside command result payload
    return status
