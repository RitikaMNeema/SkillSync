import os
from pathlib import Path

DB_FILE = Path(__file__).with_name("test_application.sqlite")
if DB_FILE.exists():
    DB_FILE.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{DB_FILE}"

from fastapi.testclient import TestClient
from main import app, lookup_job_recruiter_id
import models
from database import SessionLocal

client = TestClient(app)


def test_submit_update_and_withdraw_application(monkeypatch):
    monkeypatch.setattr("main.lookup_job_recruiter_id", lambda job_id: "R1")

    submit_payload = {
        "job_id": "J1",
        "member_id": "M1",
        "resume_ref": "https://s3.link/resume.pdf",
        "cover_letter": "Hello",
        "answers": {"q1": "yes"},
    }

    submit_resp = client.post("/applications/submit", json=submit_payload)
    assert submit_resp.status_code == 200
    app_id = submit_resp.json()["application_id"]

    wrong_status_resp = client.post(
        "/applications/updateStatus",
        params={"application_id": app_id, "recruiter_id": "R2"},
        json={"status": "reviewing"},
    )
    assert wrong_status_resp.status_code == 403

    ok_status_resp = client.post(
        "/applications/updateStatus",
        params={"application_id": app_id, "recruiter_id": "R1"},
        json={"status": "reviewing"},
    )
    assert ok_status_resp.status_code == 200
    assert ok_status_resp.json()["new_status"] == "reviewing"

    withdraw_resp = client.post(
        "/applications/withdraw",
        params={"application_id": app_id, "member_id": "M1"},
    )
    assert withdraw_resp.status_code == 200
    assert withdraw_resp.json()["status"] == "withdrawn"


def test_closed_job_blocks_submission():
    db = SessionLocal()
    try:
        db.add(models.ClosedJob(job_id="J-closed"))
        db.commit()
    finally:
        db.close()

    resp = client.post(
        "/applications/submit",
        json={
            "job_id": "J-closed",
            "member_id": "M9",
            "resume_ref": "resume.pdf",
        },
    )
    assert resp.status_code == 400
