"""
Integration test: job posting → apply → status change → withdraw flow.

Fully self-contained — registers throwaway recruiter and member accounts,
creates a company and job, then exercises the full application lifecycle.

Requires all services to be running:
    docker compose up -d   (from backend/)

Run from the backend/ directory:
    pytest tests/integration/test_job_apply_flow.py -v -s
"""
import asyncio
import uuid
import pytest
import httpx

AUTH_URL    = "http://localhost:3001"
PROFILE_URL = "http://localhost:3002"
REC_URL     = "http://localhost:3003"
JOB_URL     = "http://localhost:3005"
APP_URL     = "http://localhost:3006"

POLL_INTERVAL  = 0.5   # seconds between commandStatus polls
POLL_MAX_TRIES = 20    # up to 10 seconds total


# ── helpers ───────────────────────────────────────────────────────────────────

async def register_and_login(client: httpx.AsyncClient, role: str) -> tuple[int, str]:
    """Register a throwaway account and return (user_id, token)."""
    email    = f"inttest-{uuid.uuid4().hex[:8]}@skillsync-test.com"
    password = "Test@1234"

    reg = await client.post(f"{AUTH_URL}/auth/register",
                            json={"email": email, "password": password, "role": role})
    assert reg.status_code == 201, f"register failed: {reg.text}"
    user_id = reg.json()["data"]["user_id"]

    login = await client.post(f"{AUTH_URL}/auth/login",
                              json={"email": email, "password": password})
    assert login.status_code == 200, f"login failed: {login.text}"
    token = login.json()["data"]["token"]

    return user_id, token


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def poll_command(client: httpx.AsyncClient, service_url: str,
                       command_id: str, token: str) -> dict:
    """Poll /<service>/commandStatus until completed or failed."""
    for _ in range(POLL_MAX_TRIES):
        resp = await client.post(
            f"{service_url}/commandStatus",
            headers=headers(token),
            json={"command_id": command_id},
        )
        assert resp.status_code == 200, f"commandStatus error: {resp.text}"
        data = resp.json()["data"]
        if data["status"] in ("completed", "failed"):
            return data
        await asyncio.sleep(POLL_INTERVAL)
    pytest.fail(f"Command {command_id} did not complete within {POLL_MAX_TRIES * POLL_INTERVAL}s")


# ── test ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_full_job_apply_status_flow():
    """
    End-to-end: recruiter creates profile + company → posts a job →
    member applies → status cycle (submitted → reviewing → interview → offer) →
    member withdraws → job closes → closed job rejects new applications.
    """
    async with httpx.AsyncClient(timeout=20.0) as client:

        # ── 1. Register accounts ──────────────────────────────────────────────
        rec_id, rec_tok = await register_and_login(client, "recruiter")
        mem_id, mem_tok = await register_and_login(client, "member")

        # ── 1b. Create member profile (required for FK on applications) ───────
        mem_prof = await client.post(
            f"{PROFILE_URL}/members/create",
            headers=headers(mem_tok),
            json={
                "member_id": mem_id,
                "first_name": "Test",
                "last_name": "Member",
                "headline": "Integration test account",
            },
        )
        assert mem_prof.status_code == 202, mem_prof.text
        mem_prof_result = await poll_command(client, f"{PROFILE_URL}/members",
                                             mem_prof.json()["data"]["command_id"], mem_tok)
        assert mem_prof_result["status"] == "completed", f"Member profile create failed: {mem_prof_result}"

        # ── 2. Create recruiter profile + company ─────────────────────────────
        rec_resp = await client.post(
            f"{REC_URL}/recruiters/create",
            headers=headers(rec_tok),
            json={
                "recruiter_id": rec_id,
                "name": f"Test Recruiter {rec_id}",
                "email": f"recruiter-{rec_id}@skillsync-test.com",
                "company": {
                    "name": f"TestCorp {uuid.uuid4().hex[:6]}",
                    "industry": "Technology",
                    "size": "51-200",
                },
            },
        )
        assert rec_resp.status_code == 202, rec_resp.text
        rec_cmd_id = rec_resp.json()["data"]["command_id"]

        rec_result = await poll_command(client, f"{REC_URL}/recruiters", rec_cmd_id, rec_tok)
        assert rec_result["status"] == "completed", f"Recruiter create failed: {rec_result}"
        company_id = rec_result["result"]["company_id"]
        assert company_id is not None

        # ── 3. Recruiter posts a job ──────────────────────────────────────────
        job_resp = await client.post(
            f"{JOB_URL}/jobs/create",
            headers=headers(rec_tok),
            json={
                "company_id": company_id,
                "recruiter_id": rec_id,
                "title": "Integration Test Engineer",
                "work_mode": "remote",
                "employment_type": "full-time",
                "seniority_level": "mid",
                "location": "San Francisco, CA",
                "description": "Created by integration test — safe to delete.",
                "skills_required": ["Python", "pytest"],
            },
        )
        assert job_resp.status_code == 202, job_resp.text
        job_cmd_id = job_resp.json()["data"]["command_id"]

        job_result = await poll_command(client, f"{JOB_URL}/jobs", job_cmd_id, rec_tok)
        assert job_result["status"] == "completed", f"Job create failed: {job_result}"
        job_id = job_result["result"]["job_id"]
        assert job_id is not None

        # ── 4. Search finds the new job ───────────────────────────────────────
        search_resp = await client.post(
            f"{JOB_URL}/jobs/search",
            headers=headers(mem_tok),
            json={"keyword": "Integration Test Engineer", "page": 1},
        )
        assert search_resp.status_code == 200, search_resp.text
        found_ids = [j["job_id"] for j in search_resp.json()["data"]["jobs"]]
        assert job_id in found_ids

        # ── 5. Seniority filter excludes wrong level ───────────────────────────
        senior_resp = await client.post(
            f"{JOB_URL}/jobs/search",
            headers=headers(mem_tok),
            json={"keyword": "Integration Test Engineer", "seniority_level": "senior"},
        )
        assert senior_resp.status_code == 200
        senior_ids = [j["job_id"] for j in senior_resp.json()["data"]["jobs"]]
        assert job_id not in senior_ids

        # ── 6. Member applies (async — returns 202, poll for app_id) ────────────
        apply_resp = await client.post(
            f"{APP_URL}/applications/submit",
            headers=headers(mem_tok),
            json={
                "job_id": job_id,
                "member_id": mem_id,
                "resume_url": "https://example.com/resume.pdf",
                "cover_letter": "Integration test application.",
            },
        )
        assert apply_resp.status_code == 202, apply_resp.text
        submit_result = await poll_command(client, f"{APP_URL}/applications",
                                           apply_resp.json()["data"]["command_id"], mem_tok)
        assert submit_result["status"] == "completed", f"Submit failed: {submit_result}"
        app_id = submit_result["result"]["application_id"]
        assert submit_result["result"]["status"] == "submitted"

        # ── 7. Duplicate application blocked (command should fail) ────────────
        dup_resp = await client.post(
            f"{APP_URL}/applications/submit",
            headers=headers(mem_tok),
            json={"job_id": job_id, "member_id": mem_id},
        )
        assert dup_resp.status_code == 202, dup_resp.text
        dup_result = await poll_command(client, f"{APP_URL}/applications",
                                        dup_resp.json()["data"]["command_id"], mem_tok)
        assert dup_result["status"] == "failed", f"Expected duplicate to fail: {dup_result}"
        assert "already" in dup_result["error"].lower() or "duplicate" in dup_result["error"].lower()

        # ── 8. submitted → reviewing (async command) ─────────────────────────
        r1 = await client.post(f"{APP_URL}/applications/updateStatus",
                               headers=headers(rec_tok),
                               json={"application_id": app_id, "new_status": "reviewing"})
        assert r1.status_code == 200, r1.text
        r1_result = await poll_command(client, f"{APP_URL}/applications",
                                       r1.json()["data"]["command_id"], rec_tok)
        assert r1_result["status"] == "completed", f"reviewing transition failed: {r1_result}"
        assert r1_result["result"]["new_status"] == "reviewing"

        # ── 9. Invalid transition (reviewing → offer, skips interview) ───────
        bad = await client.post(f"{APP_URL}/applications/updateStatus",
                                headers=headers(rec_tok),
                                json={"application_id": app_id, "new_status": "offer"})
        assert bad.status_code == 200, bad.text
        bad_result = await poll_command(client, f"{APP_URL}/applications",
                                        bad.json()["data"]["command_id"], rec_tok)
        assert bad_result["status"] == "failed", f"Expected invalid transition to fail: {bad_result}"

        # ── 10. reviewing → interview ─────────────────────────────────────────
        r2 = await client.post(f"{APP_URL}/applications/updateStatus",
                               headers=headers(rec_tok),
                               json={"application_id": app_id, "new_status": "interview"})
        assert r2.status_code == 200, r2.text
        r2_result = await poll_command(client, f"{APP_URL}/applications",
                                       r2.json()["data"]["command_id"], rec_tok)
        assert r2_result["status"] == "completed", f"interview transition failed: {r2_result}"

        # ── 11. Recruiter adds a note (async) ────────────────────────────────
        note_resp = await client.post(f"{APP_URL}/applications/addNote",
                                      headers=headers(rec_tok),
                                      json={"application_id": app_id, "recruiter_id": rec_id,
                                            "note_text": "Strong candidate."})
        assert note_resp.status_code == 202, note_resp.text
        note_result = await poll_command(client, f"{APP_URL}/applications",
                                         note_resp.json()["data"]["command_id"], rec_tok)
        assert note_result["status"] == "completed", f"addNote failed: {note_result}"

        # ── 12. Member reads application + note ───────────────────────────────
        get_resp = await client.post(f"{APP_URL}/applications/get",
                                     headers=headers(mem_tok),
                                     json={"application_id": app_id})
        assert get_resp.status_code == 200, get_resp.text
        app_data = get_resp.json()["data"]
        assert app_data["status"] == "interview"
        assert len(app_data["notes"]) >= 1

        # ── 13. interview → offer ─────────────────────────────────────────────
        r3 = await client.post(f"{APP_URL}/applications/updateStatus",
                               headers=headers(rec_tok),
                               json={"application_id": app_id, "new_status": "offer"})
        assert r3.status_code == 200, r3.text
        r3_result = await poll_command(client, f"{APP_URL}/applications",
                                       r3.json()["data"]["command_id"], rec_tok)
        assert r3_result["status"] == "completed", f"offer transition failed: {r3_result}"

        # ── 14. Member withdraws (async) ──────────────────────────────────────
        wd_resp = await client.post(f"{APP_URL}/applications/withdraw",
                                    headers=headers(mem_tok),
                                    json={"application_id": app_id})
        assert wd_resp.status_code == 202, wd_resp.text
        wd_result = await poll_command(client, f"{APP_URL}/applications",
                                       wd_resp.json()["data"]["command_id"], mem_tok)
        assert wd_result["status"] == "completed", f"Withdraw failed: {wd_result}"
        assert wd_result["result"]["new_status"] == "withdrawn"

        # Terminal state — second withdraw should fail
        wd2_resp = await client.post(f"{APP_URL}/applications/withdraw",
                                     headers=headers(mem_tok),
                                     json={"application_id": app_id})
        assert wd2_resp.status_code == 202, wd2_resp.text
        wd2_result = await poll_command(client, f"{APP_URL}/applications",
                                        wd2_resp.json()["data"]["command_id"], mem_tok)
        assert wd2_result["status"] == "failed", f"Expected second withdraw to fail: {wd2_result}"

        # ── 15. Recruiter closes the job ──────────────────────────────────────
        close_cmd = await client.post(f"{JOB_URL}/jobs/close",
                                      headers=headers(rec_tok),
                                      json={"job_id": job_id})
        assert close_cmd.status_code == 202, close_cmd.text
        close_result = await poll_command(client, f"{JOB_URL}/jobs",
                                          close_cmd.json()["data"]["command_id"], rec_tok)
        assert close_result["status"] == "completed"
        assert close_result["result"]["status"] == "closed"

        # ── 16. Cannot apply to closed job (command fails) ────────────────────
        closed_apply = await client.post(
            f"{APP_URL}/applications/submit",
            headers=headers(mem_tok),
            json={"job_id": job_id, "member_id": mem_id},
        )
        assert closed_apply.status_code == 202, closed_apply.text
        closed_result = await poll_command(client, f"{APP_URL}/applications",
                                           closed_apply.json()["data"]["command_id"], mem_tok)
        assert closed_result["status"] == "failed", f"Expected closed-job apply to fail: {closed_result}"

        # ── 17. Closed job gone from open search ──────────────────────────────
        after_close = await client.post(
            f"{JOB_URL}/jobs/search",
            headers=headers(mem_tok),
            json={"keyword": "Integration Test Engineer", "page": 1},
        )
        assert after_close.status_code == 200
        open_ids = [j["job_id"] for j in after_close.json()["data"]["jobs"]]
        assert job_id not in open_ids

        # ── 18. Cleanup: delete the test job ─────────────────────────────────
        del_cmd = await client.post(f"{JOB_URL}/jobs/delete",
                                    headers=headers(rec_tok),
                                    json={"job_id": job_id})
        assert del_cmd.status_code == 202, del_cmd.text
        del_result = await poll_command(client, f"{JOB_URL}/jobs",
                                        del_cmd.json()["data"]["command_id"], rec_tok)
        assert del_result["status"] == "completed"
        assert del_result["result"]["deleted"] is True
