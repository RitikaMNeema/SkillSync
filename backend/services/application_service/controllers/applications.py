from fastapi import HTTPException
from models.application import (
    submit_application_transaction, get_application, apps_by_job, apps_by_member,
    update_status, withdraw_application, add_note, get_notes,
    VALID_TRANSITIONS, PAGE_SIZE,
)
from producers.application_producer import emit_submitted, emit_status_changed


async def submit(job_id, member_id, resume_url, cover_letter, answers) -> dict:
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
    await emit_submitted(member_id, app_id, job_id, member_id)
    return {"application_id": app_id, "job_id": job_id, "member_id": member_id, "status": "submitted"}


async def get(application_id: int) -> dict:
    app = await get_application(application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    notes = await get_notes(application_id)
    return {**app, "notes": notes}


async def by_job(job_id: int, page: int) -> dict:
    rows, total = await apps_by_job(job_id, page)
    return {"applications": rows, "total": total, "page": page, "page_size": PAGE_SIZE}


async def by_member(member_id: int, page: int) -> dict:
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
    await emit_status_changed(str(actor_id), application_id, old_status, new_status, app["job_id"], app["member_id"])
    return {"application_id": application_id, "old_status": old_status, "new_status": new_status}


async def add_recruiter_note(application_id: int, recruiter_id: int, note_text: str) -> dict:
    if not await get_application(application_id):
        raise HTTPException(404, "Application not found")
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
    await emit_status_changed(str(member_id), application_id, old_status, "withdrawn", app["job_id"], app["member_id"])
    return {"application_id": application_id, "old_status": old_status, "new_status": "withdrawn"}
