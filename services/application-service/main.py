from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import uuid
import threading
import os
import httpx
from pydantic import ValidationError

import models, schemas
from database import engine, get_db
from kafka_producer import send_kafka_event
from kafka_consumer import consume_loop

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Application Service", description="Dev 2 - Applications Module")

JOB_SERVICE_URL = os.getenv("JOB_SERVICE_URL")

_consumer_started = False


def _start_consumer():
    global _consumer_started
    if _consumer_started:
        return
    thread = threading.Thread(target=consume_loop, daemon=True)
    thread.start()
    _consumer_started = True


@app.on_event("startup")
def startup_consumer():
    _start_consumer()


def lookup_job_recruiter_id(job_id: str) -> str | None:
    if not JOB_SERVICE_URL:
        return None

    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.post(f"{JOB_SERVICE_URL.rstrip('/')}/jobs/get", params={"job_id": job_id})
            if resp.status_code == 200:
                data = resp.json()
                return data.get("recruiter_id")
    except Exception:
        return None
    return None

@app.post("/applications/submit", response_model=schemas.ApplicationResponse)
def submit_application(
    app_in: schemas.ApplicationSubmit,
    background_tasks: BackgroundTasks,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    # Defensive check: ensure job is not closed
    closed_job = db.query(models.ClosedJob).filter(models.ClosedJob.job_id == app_in.job_id).first()
    if closed_job:
        raise HTTPException(status_code=400, detail="Cannot apply. This job posting is closed.")

    resolved_recruiter_id = app_in.recruiter_id or lookup_job_recruiter_id(app_in.job_id)
    
    app_id = str(uuid.uuid4())
    trace_id = trace_id or str(uuid.uuid4())
    idempotency_key = idempotency_key or f"application.submitted:{app_id}"
    db_app = models.Application(
        application_id=app_id,
        **app_in.model_dump()
    )
    if resolved_recruiter_id:
        db_app.recruiter_id = resolved_recruiter_id
    db.add(db_app)
    try:
        db.commit()
        db.refresh(db_app)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not submit application (maybe already applied?)")
    
    background_tasks.add_task(
        send_kafka_event,
        "application.submitted",
        "application.submitted",
        app_in.member_id,
        "application",
        app_id,
        {"job_id": app_in.job_id, "member_id": app_in.member_id},
        trace_id,
        idempotency_key,
    )
    return db_app

@app.post("/applications/get", response_model=schemas.ApplicationResponse)
def get_application(application_id: str, db: Session = Depends(get_db)):
    db_app = db.query(models.Application).filter(models.Application.application_id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404, detail="Not found")
    return db_app

@app.post("/applications/byJob", response_model=List[schemas.ApplicationResponse])
def get_applications_by_job(job_id: str, db: Session = Depends(get_db)):
    return db.query(models.Application).filter(models.Application.job_id == job_id).all()

@app.post("/applications/byMember", response_model=List[schemas.ApplicationResponse])
def get_applications_by_member(member_id: str, db: Session = Depends(get_db)):
    return db.query(models.Application).filter(models.Application.member_id == member_id).all()

@app.post("/applications/updateStatus")
def update_status(
    application_id: str,
    recruiter_id: str,
    status_upd: schemas.ApplicationStatusUpdate,
    background_tasks: BackgroundTasks,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    db_app = db.query(models.Application).filter(models.Application.application_id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404)

    allowed_statuses = {"reviewing", "interview", "offer", "rejected", "withdrawn"}
    if status_upd.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid application status")

    resolved_recruiter_id = db_app.recruiter_id or lookup_job_recruiter_id(db_app.job_id)
    if resolved_recruiter_id and resolved_recruiter_id != recruiter_id:
        raise HTTPException(status_code=403, detail="Not authorized for this job")
    if db_app.recruiter_id and db_app.recruiter_id != recruiter_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not db_app.recruiter_id:
        db_app.recruiter_id = recruiter_id

    db_app.status = status_upd.status
    db.commit()

    trace_id = trace_id or str(uuid.uuid4())
    background_tasks.add_task(
        send_kafka_event,
        "application.statusChanged",
        "application.statusChanged",
        recruiter_id,
        "application",
        application_id,
        {"new_status": status_upd.status},
        trace_id,
        idempotency_key or f"application.statusChanged:{application_id}:{status_upd.status}",
    )
    return {"status": "success", "new_status": status_upd.status}

@app.post("/applications/addNote")
def add_note(application_id: str, note_in: schemas.ApplicationNoteAdd, db: Session = Depends(get_db)):
    db_app = db.query(models.Application).filter(models.Application.application_id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404)
        
    note = models.ApplicationNote(
        application_id=application_id,
        recruiter_id=note_in.recruiter_id,
        note_text=note_in.note_text
    )
    db.add(note)
    db.commit()
    return {"status": "success"}

@app.post("/applications/withdraw")
def withdraw_application(
    application_id: str,
    member_id: str,
    background_tasks: BackgroundTasks,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    db_app = db.query(models.Application).filter(models.Application.application_id == application_id).first()
    if not db_app:
        raise HTTPException(status_code=404)
        
    if db_app.member_id != member_id:
        raise HTTPException(status_code=403)
        
    db_app.status = "withdrawn"
    db.commit()
    trace_id = trace_id or str(uuid.uuid4())
    background_tasks.add_task(
        send_kafka_event,
        "application.statusChanged",
        "application.statusChanged",
        member_id,
        "application",
        application_id,
        {"new_status": "withdrawn"},
        trace_id,
        idempotency_key or f"application.statusChanged:{application_id}:withdrawn",
    )
    return {"status": "withdrawn"}
