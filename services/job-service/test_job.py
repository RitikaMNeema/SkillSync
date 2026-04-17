import os
from pathlib import Path

DB_FILE = Path(__file__).with_name("test_job.sqlite")
if DB_FILE.exists():
    DB_FILE.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE}"

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_get_search_and_close_job():
    payload = {
        "title": "Software Engineer",
        "description": "Great job",
        "company_id": "C1",
        "recruiter_id": "R1",
        "industry": "Technology",
        "location": "San Francisco",
        "employment_type": "Full-time",
        "remote": True,
        "skills_required": ["Python", "FastAPI"],
    }

    create_resp = client.post("/jobs/create", json=payload)
    assert create_resp.status_code == 200
    job_id = create_resp.json()["job_id"]

    get_resp = client.post("/jobs/get", params={"job_id": job_id, "member_id": "M1"})
    assert get_resp.status_code == 200
    assert get_resp.json()["views_count"] == 1

    search_resp = client.post("/jobs/search", params={"keyword": "Engineer", "location": "San Francisco"})
    assert search_resp.status_code == 200
    assert any(job["job_id"] == job_id for job in search_resp.json())

    close_resp = client.post("/jobs/close", params={"job_id": job_id, "recruiter_id": "R1"})
    assert close_resp.status_code == 200

    search_after_close = client.post("/jobs/search", params={"keyword": "Engineer"})
    assert search_after_close.status_code == 200
    assert all(job["job_id"] != job_id for job in search_after_close.json())


def test_saved_jobs_returns_job_details():
    payload = {
        "title": "Data Analyst",
        "description": "Analytics role",
        "company_id": "C2",
        "recruiter_id": "R2",
        "industry": "Finance",
        "location": "New York",
        "employment_type": "Full-time",
        "remote": False,
        "skills_required": ["SQL"],
    }

    create_resp = client.post("/jobs/create", json=payload)
    assert create_resp.status_code == 200
    job_id = create_resp.json()["job_id"]

    save_resp = client.post("/jobs/save", params={"job_id": job_id, "member_id": "M2"})
    assert save_resp.status_code == 200

    saved_resp = client.post("/jobs/savedByMember", params={"member_id": "M2"})
    assert saved_resp.status_code == 200
    body = saved_resp.json()
    assert body[0]["job_id"] == job_id
    assert body[0]["title"] == "Data Analyst"
