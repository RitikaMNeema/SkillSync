from sqlalchemy import Column, String, Integer, DateTime, Text, JSON, ForeignKey, UniqueConstraint
from datetime import datetime
from database import Base

class Application(Base):
    __tablename__ = "applications"
    
    application_id = Column(String(50), primary_key=True, index=True)
    job_id = Column(String(50), index=True)
    member_id = Column(String(50), index=True)
    recruiter_id = Column(String(50), nullable=True, index=True)
    
    resume_ref = Column(String(255))
    cover_letter = Column(Text, nullable=True)
    answers = Column(JSON, nullable=True)
    
    application_datetime = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="submitted") # submitted/reviewing/interview/offer/rejected/withdrawn
    
    # Prevent duplicate applications
    __table_args__ = (UniqueConstraint('member_id', 'job_id', name='uix_member_job_application'),)

class ApplicationNote(Base):
    __tablename__ = "application_notes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    application_id = Column(String(50), ForeignKey("applications.application_id"))
    recruiter_id = Column(String(50))
    note_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ClosedJob(Base):
    """Local cache of closed jobs consumed defensively from Kafka to prevent applies"""
    __tablename__ = "closed_jobs_cache"
    job_id = Column(String(50), primary_key=True)
    event_idempotency_key = Column(String(120), unique=True, index=True, nullable=True)
    closed_at = Column(DateTime, default=datetime.utcnow)
