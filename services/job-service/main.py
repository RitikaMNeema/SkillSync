from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
import uuid
from datetime import datetime

import models, schemas
from database import engine, get_db
from kafka_producer import send_kafka_event
from redis_cache import (
    get_cached_job,
    set_cached_job,
    invalidate_job_cache,
    invalidate_search_cache,
    get_cached_search,
    set_cached_search,
)

# Create all database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Service", description="Dev 2 - LinkedIn Jobs Module")

@app.post("/jobs/create", response_model=schemas.JobResponse)
def create_job(job: schemas.JobCreate, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    db_job = models.Job(**job.model_dump(), job_id=job_id)
    db.add(db_job)
    try:
        db.commit()
        db.refresh(db_job)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction failed")

    invalidate_search_cache()
    return db_job

@app.post("/jobs/get", response_model=schemas.JobResponse)
def get_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    member_id: str = None,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    # Try Redis Cache
    cached = get_cached_job(job_id)
    if cached:
        # Background task for tracking view if member viewed it
        if member_id:
            db.query(models.Job).filter(models.Job.job_id == job_id).update(
                {models.Job.views_count: models.Job.views_count + 1}
            )
            db.commit()
            cached["views_count"] = int(cached.get("views_count", 0)) + 1
            set_cached_job(job_id, cached)
            background_tasks.add_task(
                send_kafka_event,
                "job.viewed",
                "job.viewed",
                member_id,
                "job",
                job_id,
                {"job_id": job_id},
                trace_id,
                idempotency_key or f"job.viewed:{member_id}:{job_id}",
            )
        return cached

    db_job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if member_id:
        db_job.views_count += 1
        db.commit()

    # Save to Redis
    resp = schemas.JobResponse.model_validate(db_job)
    if member_id:
        resp.views_count = db_job.views_count
    set_cached_job(job_id, resp.model_dump(mode="json"))

    if member_id:
        background_tasks.add_task(
            send_kafka_event,
            "job.viewed",
            "job.viewed",
            member_id,
            "job",
            job_id,
            {"job_id": job_id},
            trace_id,
            idempotency_key or f"job.viewed:{member_id}:{job_id}",
        )

    return resp

@app.post("/jobs/update")
def update_job(
    job_id: str,
    job_update: schemas.JobUpdate,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    db_job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = job_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_job, key, value)
        
    db.commit()
    invalidate_job_cache(job_id)
    invalidate_search_cache()
    return {"status": "success", "job_id": job_id}

@app.post("/jobs/search")
def search_jobs(
    keyword: str = "",
    location: str = "",
    employment_type: str = "",
    remote: bool | None = None,
    industry: str = "",
    db: Session = Depends(get_db),
):
    cache_key = f"{keyword}_{location}_{employment_type}_{remote}_{industry}"
    cached = get_cached_search(cache_key)
    if cached:
        return cached

    query = db.query(models.Job).filter(models.Job.status == "open")
    if keyword:
        query = query.filter(
            (models.Job.title.contains(keyword))
            | (models.Job.description.contains(keyword))
        )
    if location:
        query = query.filter(models.Job.location.contains(location))
    if employment_type:
        query = query.filter(models.Job.employment_type.contains(employment_type))
    if remote is not None:
        query = query.filter(models.Job.remote == remote)
    if industry:
        query = query.filter(models.Job.industry.contains(industry))
        
    results = query.limit(50).all()
    # Serialize results to json dicts for redis
    out = [schemas.JobResponse.model_validate(r).model_dump(mode="json") for r in results]
    set_cached_search(cache_key, out)
    return out

@app.post("/jobs/close")
def close_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    recruiter_id: str,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    db_job = db.query(models.Job).filter(models.Job.job_id == job_id).first()
    if not db_job:
        raise HTTPException(status_code=404)
    if db_job.recruiter_id != recruiter_id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    db_job.status = "closed"
    db.commit()
    invalidate_job_cache(job_id)
    invalidate_search_cache()
    
    trace_id = str(uuid.uuid4())
    idempotency_key = f"job.closed:{job_id}"
    background_tasks.add_task(
        send_kafka_event,
        "job.closed",
        "job.closed",
        recruiter_id,
        "job",
        job_id,
        {"job_id": job_id},
        trace_id,
        idempotency_key or f"job.closed:{job_id}",
    )
    return {"status": "closed"}

@app.post("/jobs/byRecruiter")
def jobs_by_recruiter(recruiter_id: str, db: Session = Depends(get_db)):
    return db.query(models.Job).filter(models.Job.recruiter_id == recruiter_id).all()

@app.post("/jobs/save")
def save_job(
    job_id: str,
    member_id: str,
    background_tasks: BackgroundTasks,
    trace_id: str = None,
    idempotency_key: str = None,
    db: Session = Depends(get_db),
):
    try:
        saved = models.SavedJob(member_id=member_id, job_id=job_id)
        db.add(saved)
        db.commit()
        trace_id = str(uuid.uuid4())
        background_tasks.add_task(
            send_kafka_event,
            "job.saved",
            "job.saved",
            member_id,
            "job",
            job_id,
            {"job_id": job_id},
            trace_id,
            idempotency_key or f"job.saved:{member_id}:{job_id}",
        )
        invalidate_search_cache()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not save job (maybe already saved?)")

@app.post("/jobs/unsave")
def unsave_job(job_id: str, member_id: str, db: Session = Depends(get_db)):
    saved = db.query(models.SavedJob).filter(models.SavedJob.job_id == job_id, models.SavedJob.member_id == member_id).first()
    if saved:
        db.delete(saved)
        db.commit()
        invalidate_search_cache()
    return {"status": "success"}

@app.post("/jobs/savedByMember", response_model=List[schemas.SavedJobResponse])
def jobs_saved_by_member(member_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(models.SavedJob, models.Job)
        .join(models.Job, models.SavedJob.job_id == models.Job.job_id)
        .filter(models.SavedJob.member_id == member_id)
        .order_by(models.SavedJob.saved_datetime.desc())
        .all()
    )
    return [
        {
            "job_id": job.job_id,
            "saved_datetime": saved.saved_datetime,
            "title": job.title,
            "company_id": job.company_id,
            "recruiter_id": job.recruiter_id,
            "status": job.status,
            "location": job.location,
            "employment_type": job.employment_type,
            "industry": job.industry,
            "remote": job.remote,
        }
        for saved, job in rows
    ]

@app.post("/jobs/trackView")
def track_job_view(
    job_id: str,
    member_id: str,
    background_tasks: BackgroundTasks,
    trace_id: str = None,
    idempotency_key: str = None,
):
    background_tasks.add_task(
        send_kafka_event,
        "job.viewed",
        "job.viewed",
        member_id,
        "job",
        job_id,
        {"job_id": job_id},
        trace_id,
        idempotency_key or f"job.viewed:{member_id}:{job_id}",
    )
    return {"status": "success"}
