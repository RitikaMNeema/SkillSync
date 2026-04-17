import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Use environment variables for DB URL or default to localhost
# e.g., mysql+pymysql://user:password@localhost:3306/linkedin_jobs
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:password@localhost:3306/linkedin_jobs")

# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, echo=False)

# Create a local session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """Dependency to get DB session per request, ensuring automatic rollback on failure."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
