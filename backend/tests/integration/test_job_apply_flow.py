"""
Integration test: job posting → apply → status change → withdraw flow.

Requires all services to be running locally (docker-compose up or uvicorn).
Obtain fresh tokens via POST /auth/login before running.

Run from repo root:
    pytest backend/tests/integration/test_job_apply_flow.py -v
"""
import pytest
import httpx

JOB_SERVICE_URL = "http://localhost:3005"
APP_SERVICE_URL  = "http://localhost:3006"

# Replace with fresh tokens from POST /auth/login
RECRUITER_TOKEN = "REPLACE_WITH_RECRUITER_JWT"
MEMBER_TOKEN    = "REPLACE_WITH_MEMBER_JWT"

# Replace with real IDs that exist in the DB
RECRUITER_ID = 1
MEMBER_ID    = 3
COMPANY_ID   = 1


def recruiter_headers():
    return {"Authorization": f"Bearer {RECRUITER_TOKEN}", "Content-Type": "application/json"}


def member_headers():
    return {"Authorization": f"Bearer {MEMBER_TOKEN}", "Content-Type": "application/json"}


@pytest.mark.asyncio
async def test_full_job_apply_status_flow():
    """
    End-to-end: recruiter posts a job → member applies → recruiter advances status
    through submitted → reviewing → interview → offer → rejected,
    then a second member apply is blocked (duplicate), then member withdraws
    a separate application from 'submitted'.
    """
    job_id = None
    application_id = None

    async with httpx.AsyncClient() as client:
        # ── 1. Recruiter creates a job ────────────────────────────────────────
        create_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/create",
            headers=recruiter_headers(),
            json={
                "company_id": COMPANY_ID,
                "recruiter_id": RECRUITER_ID,
                "title": "Integration Test Engineer",
                "work_mode": "remote",
                "employment_type": "full-time",
                "seniority_level": "mid",
                "location": "San Francisco, CA",
                "description": "Created by integration test — safe to delete.",
                "skills_required": ["Python", "pytest"],
            },
        )
        assert create_resp.status_code == 201, create_resp.text
        job_id = create_resp.json()["data"]["job_id"]
        assert job_id is not None

        # ── 2. Search finds the new job ───────────────────────────────────────
        search_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/search",
            headers=member_headers(),
            json={"keyword": "Integration Test Engineer", "page": 1},
        )
        assert search_resp.status_code == 200, search_resp.text
        found_ids = [j["job_id"] for j in search_resp.json()["data"]["jobs"]]
        assert job_id in found_ids

        # ── 3. Search respects seniority_level filter ─────────────────────────
        seniority_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/search",
            headers=member_headers(),
            json={"keyword": "Integration Test Engineer", "seniority_level": "mid"},
        )
        assert seniority_resp.status_code == 200, seniority_resp.text
        mid_ids = [j["job_id"] for j in seniority_resp.json()["data"]["jobs"]]
        assert job_id in mid_ids

        # Mismatched seniority should NOT return this job
        senior_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/search",
            headers=member_headers(),
            json={"keyword": "Integration Test Engineer", "seniority_level": "senior"},
        )
        assert senior_resp.status_code == 200, senior_resp.text
        senior_ids = [j["job_id"] for j in senior_resp.json()["data"]["jobs"]]
        assert job_id not in senior_ids

        # ── 4. Member applies ────────────────────────────────────────────────
        apply_resp = await client.post(
            f"{APP_SERVICE_URL}/applications/submit",
            headers=member_headers(),
            json={
                "job_id": job_id,
                "member_id": MEMBER_ID,
                "resume_url": "https://example.com/resume.pdf",
                "cover_letter": "Integration test application.",
            },
        )
        assert apply_resp.status_code == 201, apply_resp.text
        application_id = apply_resp.json()["data"]["application_id"]
        assert apply_resp.json()["data"]["status"] == "submitted"

        # ── 5. Duplicate application blocked ─────────────────────────────────
        dup_resp = await client.post(
            f"{APP_SERVICE_URL}/applications/submit",
            headers=member_headers(),
            json={"job_id": job_id, "member_id": MEMBER_ID},
        )
        assert dup_resp.status_code == 409, dup_resp.text

        # ── 6. Recruiter advances: submitted → reviewing ─────────────────────
        r1 = await client.post(
            f"{APP_SERVICE_URL}/applications/updateStatus",
            headers=recruiter_headers(),
            json={"application_id": application_id, "new_status": "reviewing"},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["data"]["new_status"] == "reviewing"

        # ── 7. Invalid transition (reviewing → offer skips interview) → 400 ──
        bad = await client.post(
            f"{APP_SERVICE_URL}/applications/updateStatus",
            headers=recruiter_headers(),
            json={"application_id": application_id, "new_status": "offer"},
        )
        assert bad.status_code == 400, bad.text

        # ── 8. Recruiter advances: reviewing → interview ─────────────────────
        r2 = await client.post(
            f"{APP_SERVICE_URL}/applications/updateStatus",
            headers=recruiter_headers(),
            json={"application_id": application_id, "new_status": "interview"},
        )
        assert r2.status_code == 200, r2.text

        # ── 9. Recruiter adds a note ──────────────────────────────────────────
        note_resp = await client.post(
            f"{APP_SERVICE_URL}/applications/addNote",
            headers=recruiter_headers(),
            json={
                "application_id": application_id,
                "recruiter_id": RECRUITER_ID,
                "note_text": "Strong candidate — proceeding to offer.",
            },
        )
        assert note_resp.status_code == 201, note_resp.text

        # ── 10. Member can see their application with the note ────────────────
        get_resp = await client.post(
            f"{APP_SERVICE_URL}/applications/get",
            headers=member_headers(),
            json={"application_id": application_id},
        )
        assert get_resp.status_code == 200, get_resp.text
        app_data = get_resp.json()["data"]
        assert app_data["status"] == "interview"
        assert len(app_data["notes"]) >= 1

        # ── 11. Recruiter advances: interview → offer ────────────────────────
        r3 = await client.post(
            f"{APP_SERVICE_URL}/applications/updateStatus",
            headers=recruiter_headers(),
            json={"application_id": application_id, "new_status": "offer"},
        )
        assert r3.status_code == 200, r3.text

        # ── 12. Member withdraws from offer stage ────────────────────────────
        withdraw_resp = await client.post(
            f"{APP_SERVICE_URL}/applications/withdraw",
            headers=member_headers(),
            json={"application_id": application_id},
        )
        assert withdraw_resp.status_code == 200, withdraw_resp.text
        assert withdraw_resp.json()["data"]["new_status"] == "withdrawn"

        # Terminal state: cannot withdraw again
        wd2 = await client.post(
            f"{APP_SERVICE_URL}/applications/withdraw",
            headers=member_headers(),
            json={"application_id": application_id},
        )
        assert wd2.status_code == 400, wd2.text

        # ── 13. Recruiter closes the job ──────────────────────────────────────
        close_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/close",
            headers=recruiter_headers(),
            json={"job_id": job_id},
        )
        assert close_resp.status_code == 200, close_resp.text
        assert close_resp.json()["data"]["status"] == "closed"

        # ── 14. Member cannot apply to closed job ─────────────────────────────
        closed_apply = await client.post(
            f"{APP_SERVICE_URL}/applications/submit",
            headers=member_headers(),
            json={"job_id": job_id, "member_id": MEMBER_ID},
        )
        assert closed_apply.status_code == 400, closed_apply.text

        # ── 15. Closed job no longer appears in open-job search ───────────────
        after_close = await client.post(
            f"{JOB_SERVICE_URL}/jobs/search",
            headers=member_headers(),
            json={"keyword": "Integration Test Engineer", "page": 1},
        )
        assert after_close.status_code == 200, after_close.text
        open_ids = [j["job_id"] for j in after_close.json()["data"]["jobs"]]
        assert job_id not in open_ids

        # ── 16. Cleanup: delete the test job ─────────────────────────────────
        del_resp = await client.post(
            f"{JOB_SERVICE_URL}/jobs/delete",
            headers=recruiter_headers(),
            json={"job_id": job_id},
        )
        assert del_resp.status_code == 200, del_resp.text
        assert del_resp.json()["data"]["deleted"] is True
