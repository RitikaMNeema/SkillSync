from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, JSON, ForeignKey, UniqueConstraint
from datetime import datetime
from database import Base

class Job(Base):
    __tablename__ = "jobs"
    
    job_id = Column(String(50), primary_key=True, index=True)
    company_id = Column(String(50), index=True)
    recruiter_id = Column(String(50), index=True)
    
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    seniority_level = Column(String(50))
    employment_type = Column(String(50))
    industry = Column(String(100))
    location = Column(String(100))
    remote = Column(Boolean, default=False)
    
    skills_required = Column(JSON) # List of skills
    salary_range = Column(String(100), nullable=True)
    
    posted_datetime = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default="open") # open or closed
    
    views_count = Column(Integer, default=0)
    applicants_count = Column(Integer, default=0)

class SavedJob(Base):
    __tablename__ = "saved_jobs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(String(50), index=True)
    job_id = Column(String(50), ForeignKey("jobs.job_id"), index=True)
    saved_datetime = Column(DateTime, default=datetime.utcnow)
    
    # Prevent duplicate saves
    __table_args__ = (UniqueConstraint('member_id', 'job_id', name='uix_member_job_save'),)
