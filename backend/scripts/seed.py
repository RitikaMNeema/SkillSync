#!/usr/bin/env python3
"""
LinkedIn class project — idempotent mock data seed (primary local dataset).

Goals:
  - Safe to re-run: reuses existing users/jobs when possible; skips duplicate apps.
  - Populates all five recruiter dashboard charts (Mongo) via /events/ingest, so charts
    show data even if Kafka did not persist events earlier.
  - Keeps transactional flows (applications, connections, messaging) via APIs.

Usage:
    pip install httpx
    python scripts/seed.py

Services must be running (including analytics on port 3008 by default).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import company_job_benefits as job_benefits  # noqa: E402
import recruiter_profile_defaults as recruiter_defaults  # noqa: E402

BASE = {
    "auth": "http://localhost:3001",
    "profile": "http://localhost:3002",
    "recruiter": "http://localhost:3003",
    "connection": "http://localhost:3004",
    "job": "http://localhost:3005",
    "application": "http://localhost:3006",
    "messaging": "http://localhost:3007",
    "analytics": "http://localhost:3008",
}

# Service → Kafka command-status path (polling). Matches each microservice FastAPI prefixes.
COMMAND_STATUS_PATH = {
    "profile": "/members/commandStatus",
    "job": "/jobs/commandStatus",
    "recruiter": "/recruiters/commandStatus",
    "connection": "/connections/commandStatus",
    "application": "/applications/commandStatus",
    "messaging": "/messages/commandStatus",
}

# substring checks on polled async failures treated as benign for idempotent re-runs of the seed
BENIGN_DUP_MARKERS = (
    "409",
    "duplicate",
    "already",
    "already applied",
    "already connected",
    "already pending",
    "already saved",
)

# Must match auth_service RegisterRequest password rules (length, upper, lower, digit, special).
SEED_USER_PASSWORD = "SkillSync1!"

GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Fixed logical titles — used to match existing rows on re-run (per recruiter).
JOB_SPECS: list[dict[str, Any]] = [
    {
        "title": "Senior Backend Engineer",
        "description": "Build and scale our microservices platform using Python and Kafka.",
        "work_mode": "remote",
        "employment_type": "full-time",
        "seniority_level": "senior",
        "location": "San Francisco, CA",
        "skills_required": ["Python", "FastAPI", "Kafka", "Docker"],
        "salary_min": 150000,
        "salary_max": 200000,
        "recruiter_key": "recruiter_dana",
    },
    {
        "title": "Frontend Engineer",
        "description": "Build the next generation of our React-based web application.",
        "work_mode": "hybrid",
        "employment_type": "full-time",
        "seniority_level": "mid",
        "location": "New York, NY",
        "skills_required": ["React", "TypeScript", "GraphQL"],
        "salary_min": 120000,
        "salary_max": 160000,
        "recruiter_key": "recruiter_dana",
    },
    {
        "title": "Data Scientist",
        "description": "Drive ML model development and data insights across our product.",
        "work_mode": "onsite",
        "employment_type": "full-time",
        "seniority_level": "mid",
        "location": "Seattle, WA",
        "skills_required": ["Python", "PyTorch", "SQL", "Spark"],
        "salary_min": 130000,
        "salary_max": 170000,
        "recruiter_key": "recruiter_eli",
    },
    {
        "title": "Junior DevOps Engineer",
        "description": "Support infrastructure and CI/CD pipelines.",
        "work_mode": "remote",
        "employment_type": "contract",
        "seniority_level": "junior",
        "location": "Remote",
        "skills_required": ["Docker", "Kubernetes", "Terraform"],
        "salary_min": 80000,
        "salary_max": 100000,
        "recruiter_key": "recruiter_eli",
    },
]


def ok(label: str, data=None):
    print(f"  {GREEN}✓{RESET} {label}", f"→ {json.dumps(data)}" if data else "")


def section(title: str):
    print(f"\n{BOLD}{YELLOW}{'─' * 55}{RESET}")
    print(f"{BOLD}{YELLOW}  {title}{RESET}")
    print(f"{BOLD}{YELLOW}{'─' * 55}{RESET}")


def poll_command(client: httpx.Client, base_key: str, command_id: str, *, token: str, timeout_sec: float = 180.0):
    path = COMMAND_STATUS_PATH.get(base_key)
    if not path:
        print(f"  {RED}✗ Unknown service key for polling: {base_key}{RESET}")
        sys.exit(1)
    url = BASE[base_key] + path
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.monotonic() + timeout_sec
    last_status = ""
    while time.monotonic() < deadline:
        r = client.post(url, json={"command_id": command_id}, headers=headers, timeout=30)
        if r.status_code != 200:
            print(f"  {RED}✗ {path} poll → {r.status_code}: {r.text}{RESET}")
            sys.exit(1)
        payload = r.json().get("data") or {}
        last_status = str(payload.get("status") or "")
        if last_status == "completed":
            return payload
        if last_status == "failed":
            return payload
        time.sleep(0.35)
    print(f"  {RED}✗ command {command_id} timed out (last_status={last_status!r}){RESET}")
    sys.exit(1)


def post(
    client: httpx.Client,
    base_key: str,
    path: str,
    body: dict,
    *,
    token=None,
    expect=None,
    ignore=None,
    benign_async_fail=None,
):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    url = BASE[base_key] + path
    r = client.post(url, json=body, headers=headers)
    if ignore and r.status_code in ignore:
        return None
    expected = expect if expect is not None else [200, 201, 202]
    if r.status_code not in expected:
        print(f"  {RED}✗ {path} → {r.status_code}: {r.text}{RESET}")
        sys.exit(1)
    try:
        j = r.json()
    except json.JSONDecodeError:
        print(f"  {RED}✗ {path} invalid JSON → {r.text}{RESET}")
        sys.exit(1)
    data = j.get("data") if isinstance(j, dict) else None
    if isinstance(data, dict) and data.get("command_id"):
        polled = poll_command(client, base_key, data["command_id"], token=token)
        if polled.get("status") == "failed":
            err = str(polled.get("error") or "")
            if benign_async_fail and any(marker in err for marker in benign_async_fail):
                return None
            print(f"  {RED}✗ {path} async → {err}{RESET}")
            sys.exit(1)
        return polled.get("result")
    return data


def wait_for_services(client: httpx.Client):
    print(f"\n{BOLD}Waiting for services...{RESET}")
    for name, base in BASE.items():
        for attempt in range(60):
            try:
                r = client.get(f"{base}/health", timeout=2)
                if r.status_code == 200:
                    ok(name)
                    break
            except Exception:
                pass
            if attempt % 10 == 9:
                print(f"    still waiting for {name}... ({attempt + 1}s)")
            time.sleep(1)
        else:
            print(f"  {RED}✗ {name} not reachable after 60s — is docker compose running?{RESET}")
            sys.exit(1)


def fetch_all_jobs_by_recruiter(client: httpx.Client, recruiter_id: int, token: str) -> list:
    jobs: list = []
    page = 1
    total = None
    while True:
        data = post(client, "job", "/jobs/byRecruiter", {"recruiter_id": recruiter_id, "page": page}, token=token)
        jobs.extend(data["jobs"])
        total = data["total"]
        if len(jobs) >= total or len(data["jobs"]) < data["page_size"]:
            break
        page += 1
    return jobs


def find_job_id(jobs: list, recruiter_id: int, title: str):
    for j in jobs:
        if int(j["recruiter_id"]) == int(recruiter_id) and (j.get("title") or "").strip() == title:
            return j["job_id"]
    return None


def get_job(client: httpx.Client, job_id: int, token: str) -> dict:
    return post(client, "job", "/jobs/get", {"job_id": job_id}, token=token)


def utc_month_window() -> tuple[datetime, datetime, str]:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    month_param = f"{now.year}-{now.month:02d}-01"
    return start, end, month_param


def ingest(
    client: httpx.Client,
    token: str,
    *,
    event_type: str,
    ts: datetime,
    payload: dict,
    idempotency_key: str,
    actor_id: str = "0",
    entity: dict | None = None,
) -> bool:
    job_id = payload.get("job_id")
    if entity is None and job_id is not None:
        entity = {"entity_type": "job", "entity_id": str(job_id)}
    body = {
        "event_type": event_type,
        "trace_id": str(uuid.uuid4()),
        "timestamp": ts.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "actor_id": str(actor_id),
        "entity": entity,
        "payload": payload,
        "idempotency_key": idempotency_key,
    }
    r = client.post(
        f"{BASE['analytics']}/events/ingest",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if r.status_code in (200, 201):
        return True
    if r.status_code == 409 or "duplicate" in r.text.lower():
        return True
    print(f"  {YELLOW}⚠ ingest {event_type} {idempotency_key} → {r.status_code}{RESET}")
    return False


def seed_analytics_charts(
    client: httpx.Client,
    dana_token: str,
    dana_id: int,
    eli_id: int,
    job_ids: list[int],
    member_ids: dict[str, str],
) -> None:
    """
    Idempotent Mongo events so all five dashboard charts have points for the current UTC month.
    Keys are stable so re-runs do not double-count (analytics duplicate detection).
    """
    section("8 / Analytics chart events (idempotent)")
    start, end, _month_label = utc_month_window()
    # Spread timestamps through the month window (exclusive end)
    span = max(1, int((end - start).total_seconds()) - 3600)

    def ts_at(fraction: float) -> datetime:
        return start + timedelta(seconds=min(span - 1, max(0, int(span * fraction))))

    jb, fe, ds, _dv = job_ids[0], job_ids[1], job_ids[2], job_ids[3]
    rid_d, rid_e = str(dana_id), str(eli_id)
    a, b, c = member_ids["alice"], member_ids["bob"], member_ids["charlie"]

    # --- application.submitted: Dana-owned jobs only (dana@acme.com dashboard is recruiter-scoped) ---
    # Backend 2 apps, Frontend 3 apps → visible top vs low traction; cities spread for geo chart.
    app_specs = [
        (jb, rid_d, a, "San Francisco", "CA", 0.05),
        (jb, rid_d, b, "Oakland", "CA", 0.06),
        (fe, rid_d, a, "New York", "NY", 0.07),
        (fe, rid_d, b, "Brooklyn", "NY", 0.08),
        (fe, rid_d, c, "Boston", "MA", 0.09),
    ]
    # Eli’s job: one event so Eli’s own dashboard still has application points if they log in as eli@acme.com
    app_specs.append((ds, rid_e, c, "Seattle", "WA", 0.10))
    for i, (jid, rid, mid, city, st, frac) in enumerate(app_specs):
        ingest(
            client,
            dana_token,
            event_type="application.submitted",
            ts=ts_at(frac),
            payload={
                "job_id": str(jid),
                "member_id": mid,
                "recruiter_id": rid,
                "city": city,
                "state": st,
            },
            idempotency_key=f"skillsync-seed-v5-app-{jid}-{i}-{rid}",
            actor_id=mid,
        )

    # --- job.viewed (clicks chart) ---
    for i, (jid, rid) in enumerate([(jb, rid_d), (fe, rid_d), (ds, rid_e), (jb, rid_d), (fe, rid_d)]):
        ingest(
            client,
            dana_token,
            event_type="job.viewed",
            ts=ts_at(0.12 + i * 0.02),
            payload={"job_id": str(jid), "recruiter_id": rid},
            idempotency_key=f"skillsync-seed-v5-view-{jid}-{i}",
            actor_id="7",
            entity={"entity_type": "job", "entity_id": str(jid)},
        )

    # --- job.saved (saved jobs trend — multiple days) ---
    for day_i in range(5):
        ingest(
            client,
            dana_token,
            event_type="job.saved",
            ts=start + timedelta(days=day_i + 1, hours=10),
            payload={"job_id": str(fe if day_i % 2 else jb), "recruiter_id": rid_d},
            idempotency_key=f"skillsync-seed-v5-saved-dana-{day_i}",
            actor_id="99",
            entity={"entity_type": "job", "entity_id": str(fe if day_i % 2 else jb)},
        )

    # --- application.statusChanged (stat card “Status updates”) ---
    for i, frac in enumerate([0.45, 0.46, 0.47]):
        ingest(
            client,
            dana_token,
            event_type="application.statusChanged",
            ts=ts_at(frac),
            payload={
                "job_id": str(jb),
                "member_id": a,
                "recruiter_id": rid_d,
                "old_status": "submitted",
                "new_status": "reviewing",
            },
            idempotency_key=f"skillsync-seed-v5-stat-{i}",
            actor_id=str(dana_id),
        )

    ok(
        "Ingested idempotent analytics events for Dana’s dashboard (current UTC month)",
        {"jobs": job_ids[:4], "note": "Re-runs skip duplicates; refresh dashboard after ~5m or clear analytics Redis cache."},
    )


def try_submit_application(client: httpx.Client, body: dict, token: str) -> dict | None:
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post(f"{BASE['application']}/applications/submit", json=body, headers=headers, timeout=60)
    if r.status_code == 409:
        return None
    if r.status_code not in (200, 202):
        print(f"  {RED}✗ submit → {r.status_code}: {r.text}{RESET}")
        sys.exit(1)
    payload = r.json().get("data") or {}
    command_id = payload.get("command_id")
    if not command_id:
        # legacy synchronous success payloads (pre-queue)
        if isinstance(payload, dict) and payload.get("application_id") is not None:
            return payload
        print(f"  {RED}✗ submit missing command_id → {r.text}{RESET}")
        sys.exit(1)
    polled = poll_command(client, "application", command_id, token=token)
    if polled.get("status") == "failed":
        err = str(polled.get("error") or "")
        if any(m in err.lower() for m in ("already applied", "409", "duplicate")):
            return None
        print(f"  {RED}✗ submit async → {err}{RESET}")
        sys.exit(1)
    return polled.get("result")


def main():
    with httpx.Client(timeout=120) as client:
        wait_for_services(client)

        # ── STEP 1: Register users ─────────────────────────────────────
        section("1 / Register Users")

        users: dict[str, int] = {}
        tokens: dict[str, str] = {}

        user_defs = [
            ("alice", "alice@example.com", SEED_USER_PASSWORD, "member"),
            ("bob", "bob@example.com", SEED_USER_PASSWORD, "member"),
            ("charlie", "charlie@example.com", SEED_USER_PASSWORD, "member"),
            ("recruiter_dana", "dana@acme.com", SEED_USER_PASSWORD, "recruiter"),
            ("recruiter_eli", "eli@acme.com", SEED_USER_PASSWORD, "recruiter"),
        ]

        for alias, email, pw, role in user_defs:
            r = client.post(f"{BASE['auth']}/auth/register", json={"email": email, "password": pw, "role": role})
            if r.status_code in (200, 201):
                note = "registered"
            elif r.status_code == 409:
                note = "already exists — logging in"
            else:
                print(f"  {RED}✗ /auth/register → {r.status_code}: {r.text}{RESET}")
                sys.exit(1)
            login = post(client, "auth", "/auth/login", {"email": email, "password": pw})
            users[alias] = login["user_id"]
            tokens[alias] = login["token"]
            ok(f"{alias} ({note})", {"user_id": users[alias], "role": role})

        # ── STEP 2: Member profiles ───────────────────────────────────
        section("2 / Member Profiles")

        member_profiles = {
            "alice": {
                "member_id": users["alice"],
                "first_name": "Alice",
                "last_name": "Smith",
                "headline": "Senior Software Engineer",
                "location_city": "San Francisco",
                "location_state": "CA",
                "location_country": "US",
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kafka"],
                "experience": [{"title": "SWE II", "company": "Google", "start": "2021-06", "end": None}],
                "education": [{"school": "UC Berkeley", "degree": "BS Computer Science", "year": 2019}],
                "summary": "Passionate about distributed systems.",
                "resume_url": "https://example.com/resumes/alice.pdf",
            },
            "bob": {
                "member_id": users["bob"],
                "first_name": "Bob",
                "last_name": "Jones",
                "headline": "Frontend Engineer",
                "location_city": "New York",
                "location_state": "NY",
                "location_country": "US",
                "skills": ["React", "TypeScript", "GraphQL", "CSS"],
                "experience": [{"title": "Frontend Dev", "company": "Airbnb", "start": "2022-03", "end": None}],
                "education": [{"school": "NYU", "degree": "BS Information Systems", "year": 2022}],
                "summary": "Building UIs.",
            },
            "charlie": {
                "member_id": users["charlie"],
                "first_name": "Charlie",
                "last_name": "Lee",
                "headline": "Data Scientist",
                "location_city": "Seattle",
                "location_state": "WA",
                "location_country": "US",
                "skills": ["Python", "SQL", "PyTorch", "Spark", "Tableau"],
                "experience": [{"title": "Data Scientist", "company": "Amazon", "start": "2020-09", "end": None}],
                "education": [{"school": "UW", "degree": "MS Data Science", "year": 2020}],
                "summary": "Data → product.",
            },
        }

        for alias, profile in member_profiles.items():
            result = post(
                client,
                "profile",
                "/members/create",
                profile,
                token=tokens[alias],
                ignore=[409, 400],
                benign_async_fail=BENIGN_DUP_MARKERS,
            )
            ok(f"Profile for {alias} ({'created' if result else 'already exists'})")

        # ── STEP 3: Recruiters & company ──────────────────────────────
        section("3 / Recruiters & Company")

        dana_enrich = recruiter_defaults.recruiter_profile_enrichment(
            "Acme Corp",
            industry="Technology",
            hq=None,
            role_label="Senior Technical Recruiter",
            experience_job_title="Senior Technical Recruiter",
        )
        dana_data = post(
            client,
            "recruiter",
            "/recruiters/create",
            {
                "recruiter_id": users["recruiter_dana"],
                "name": "Dana Park",
                "email": "dana@acme.com",
                "role": "Senior Technical Recruiter",
                "first_name": "Dana",
                "last_name": "Park",
                **dana_enrich,
                "company": {"name": "Acme Corp", "industry": "Technology", "size": "1000-5000"},
            },
            token=tokens["recruiter_dana"],
            ignore=[409, 400],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        if dana_data:
            company_id = dana_data["company_id"]
            ok("Created Dana Park + Acme Corp", {"company_id": company_id})
        else:
            dana_data = post(
                client,
                "recruiter",
                "/recruiters/get",
                {"recruiter_id": users["recruiter_dana"]},
                token=tokens["recruiter_dana"],
            )
            company_id = dana_data["company_id"]
            ok("Dana Park already exists", {"company_id": company_id})

        eli_enrich = recruiter_defaults.recruiter_profile_enrichment(
            "Acme Corp",
            industry="Technology",
            hq=None,
            role_label="Recruiter",
            experience_job_title="Technical Recruiter",
        )
        post(
            client,
            "recruiter",
            "/recruiters/create",
            {
                "recruiter_id": users["recruiter_eli"],
                "name": "Eli Watson",
                "email": "eli@acme.com",
                "role": "Recruiter",
                "first_name": "Eli",
                "last_name": "Watson",
                **eli_enrich,
                "company_id": company_id,
            },
            token=tokens["recruiter_eli"],
            ignore=[409, 400],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        ok("Eli Watson (created or already exists)")

        dana_id = users["recruiter_dana"]
        eli_id = users["recruiter_eli"]

        # ── STEP 4: Jobs (find existing by title + recruiter, or create) ─
        section("4 / Job Listings (idempotent)")

        dana_jobs = fetch_all_jobs_by_recruiter(client, dana_id, tokens["recruiter_dana"])
        eli_jobs = fetch_all_jobs_by_recruiter(client, eli_id, tokens["recruiter_eli"])
        job_ids: list[int] = []
        for spec in JOB_SPECS:
            rk = spec["recruiter_key"]
            rid = users[rk]
            tok = tokens[rk]
            title = spec["title"]
            found = find_job_id(dana_jobs if rk == "recruiter_dana" else eli_jobs, rid, title)
            if found:
                job_ids.append(found)
                ok(f"Reuse job: {title}", {"job_id": found})
                continue
            jd = {
                "title": title,
                "description": spec["description"],
                "work_mode": spec["work_mode"],
                "employment_type": spec["employment_type"],
                "seniority_level": spec["seniority_level"],
                "location": spec["location"],
                "skills_required": spec["skills_required"],
                "benefits": job_benefits.benefits_for_company("Acme Corporation"),
                "salary_min": spec["salary_min"],
                "salary_max": spec["salary_max"],
                "company_id": company_id,
                "recruiter_id": rid,
            }
            job = post(client, "job", "/jobs/create", jd, token=tok)
            job_ids.append(job["job_id"])
            ok(f"Created job: {title}", {"job_id": job["job_id"]})
            if rk == "recruiter_dana":
                dana_jobs = fetch_all_jobs_by_recruiter(client, dana_id, tokens["recruiter_dana"])
            else:
                eli_jobs = fetch_all_jobs_by_recruiter(client, eli_id, tokens["recruiter_eli"])

        jb, fe, ds, dv = job_ids[0], job_ids[1], job_ids[2], job_ids[3]

        # Close DevOps if still open (Eli’s job)
        gj = get_job(client, dv, tokens["recruiter_eli"])
        if (gj.get("status") or "open") == "open":
            post(client, "job", "/jobs/close", {"job_id": dv}, token=tokens["recruiter_eli"])
            ok(f"Closed job {dv} (DevOps — closed-job demo)")
        else:
            ok(f"Job {dv} already closed (skip)")

        # Views: only bump MySQL if counts are low (avoid inflating on every re-run)
        for jid, label in [(jb, "backend"), (fe, "frontend"), (ds, "data")]:
            meta = get_job(client, jid, tokens["recruiter_dana"] if jid in (jb, fe) else tokens["recruiter_eli"])
            vc = int(meta.get("views_count") or 0)
            if vc < 6:
                for viewer in ["alice", "bob", "charlie"]:
                    post(
                        client,
                        "job",
                        "/jobs/trackView",
                        {"job_id": jid, "viewer_id": users[viewer]},
                        token=tokens[viewer],
                    )
                ok(f"Tracked views for {label} (MySQL)", {"job_id": jid})
            else:
                ok(f"Skip extra trackView for {label} (already {vc} views)")

        post(
            client,
            "job",
            "/jobs/save",
            {"member_id": users["alice"], "job_id": jb},
            token=tokens["alice"],
            ignore=[409],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        post(
            client,
            "job",
            "/jobs/save",
            {"member_id": users["alice"], "job_id": fe},
            token=tokens["alice"],
            ignore=[409],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        post(
            client,
            "job",
            "/jobs/save",
            {"member_id": users["bob"], "job_id": fe},
            token=tokens["bob"],
            ignore=[409],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        ok("Saved jobs (MySQL, 409 if already saved)")

        # ── STEP 5: Connections ───────────────────────────────────────
        section("5 / Connections")

        req1 = post(
            client,
            "connection",
            "/connections/request",
            {"requester_id": users["alice"], "receiver_id": users["bob"]},
            token=tokens["alice"],
            ignore=[409, 400],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        if req1:
            post(
                client,
                "connection",
                "/connections/accept",
                {"request_id": req1["request_id"]},
                token=tokens["bob"],
                ignore=[400],
                benign_async_fail=BENIGN_DUP_MARKERS,
            )
        ok("Alice ↔ Bob")

        post(
            client,
            "connection",
            "/connections/request",
            {"requester_id": users["alice"], "receiver_id": users["charlie"]},
            token=tokens["alice"],
            ignore=[409, 400],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        ok("Alice → Charlie (pending)")

        req3 = post(
            client,
            "connection",
            "/connections/request",
            {"requester_id": users["bob"], "receiver_id": users["charlie"]},
            token=tokens["bob"],
            ignore=[409, 400],
            benign_async_fail=BENIGN_DUP_MARKERS,
        )
        if req3:
            post(
                client,
                "connection",
                "/connections/accept",
                {"request_id": req3["request_id"]},
                token=tokens["charlie"],
                ignore=[400],
                benign_async_fail=BENIGN_DUP_MARKERS,
            )
        ok("Bob ↔ Charlie")

        # ── STEP 6: Applications (skip if duplicate) ───────────────────
        section("6 / Applications")

        app1 = try_submit_application(
            client,
            {
                "job_id": jb,
                "member_id": users["alice"],
                "resume_url": "https://example.com/resumes/alice.pdf",
                "cover_letter": "Python + distributed systems.",
                "answers": {"years_python": "5"},
            },
            tokens["alice"],
        )
        if app1:
            post(
                client,
                "application",
                "/applications/updateStatus",
                {"application_id": app1["application_id"], "new_status": "reviewing"},
                token=tokens["recruiter_dana"],
                ignore=[400],
            )
            post(
                client,
                "application",
                "/applications/updateStatus",
                {"application_id": app1["application_id"], "new_status": "interview"},
                token=tokens["recruiter_dana"],
                ignore=[400],
            )
            post(
                client,
                "application",
                "/applications/addNote",
                {
                    "application_id": app1["application_id"],
                    "recruiter_id": dana_id,
                    "note_text": "Strong candidate. Schedule technical screen.",
                },
                token=tokens["recruiter_dana"],
                ignore=[400],
            )
            ok("Alice → Backend (new)", {"application_id": app1["application_id"]})
        else:
            ok("Alice → Backend (already applied — skipped)")

        app2 = try_submit_application(
            client,
            {
                "job_id": fe,
                "member_id": users["bob"],
                "resume_url": "https://example.com/resumes/bob.pdf",
                "cover_letter": "React fan.",
            },
            tokens["bob"],
        )
        if app2:
            ok("Bob → Frontend (new)", {"application_id": app2["application_id"]})
        else:
            ok("Bob → Frontend (already applied — skipped)")

        app3 = try_submit_application(
            client,
            {
                "job_id": ds,
                "member_id": users["charlie"],
                "resume_url": "https://example.com/resumes/charlie.pdf",
                "cover_letter": "ML/DS background.",
            },
            tokens["charlie"],
        )
        if app3:
            post(
                client,
                "application",
                "/applications/updateStatus",
                {"application_id": app3["application_id"], "new_status": "reviewing"},
                token=tokens["recruiter_eli"],
                ignore=[400],
            )
            post(
                client,
                "application",
                "/applications/updateStatus",
                {"application_id": app3["application_id"], "new_status": "rejected"},
                token=tokens["recruiter_eli"],
                ignore=[400],
            )
            ok("Charlie → Data (new)", {"application_id": app3["application_id"]})
        else:
            ok("Charlie → Data (already applied — skipped)")

        app4 = try_submit_application(
            client,
            {
                "job_id": fe,
                "member_id": users["alice"],
                "resume_url": "https://example.com/resumes/alice.pdf",
                "cover_letter": "Interested in frontend.",
            },
            tokens["alice"],
        )
        if app4:
            post(
                client,
                "application",
                "/applications/withdraw",
                {"application_id": app4["application_id"]},
                token=tokens["alice"],
                ignore=[400],
            )
            ok("Alice → Frontend → withdrawn (new)", {"application_id": app4["application_id"]})
        else:
            ok("Alice → Frontend (already applied — skipped withdraw demo)")

        r_closed = client.post(
            f"{BASE['application']}/applications/submit",
            json={"job_id": dv, "member_id": users["bob"], "resume_url": "x"},
            headers={"Authorization": f"Bearer {tokens['bob']}"},
            timeout=60,
        )
        if r_closed.status_code != 202:
            print(f"  {YELLOW}⚠ Expected 202 for closed job submit enqueue, got {r_closed.status_code}{RESET}")
        else:
            q = r_closed.json().get("data") or {}
            cid = q.get("command_id")
            if cid:
                polled_closed = poll_command(client, "application", cid, token=tokens["bob"])
                err = str(polled_closed.get("error") or "").lower()
                if polled_closed.get("status") == "failed" and ("closed" in err or "400" in err):
                    ok("Closed-job block (DevOps)")
                elif polled_closed.get("status") == "completed":
                    print(f"  {YELLOW}⚠ Expected closed-job failure — application completed unexpectedly{RESET}")
                else:
                    print(f"  {YELLOW}⚠ Unexpected polled status for closed job demo: {polled_closed}{RESET}")
            else:
                print(f"  {YELLOW}⚠ submit response missing command_id{RESET}")

        # ── STEP 7: Messaging ─────────────────────────────────────────
        section("7 / Messaging")

        thread1 = post(
            client,
            "messaging",
            "/threads/open",
            {"participant_ids": [dana_id, users["alice"]]},
            token=tokens["recruiter_dana"],
        )
        if thread1 and thread1.get("thread_id"):
            ok("Thread Dana ↔ Alice", {"thread_id": thread1["thread_id"]})
            for tok, sender, text in [
                (
                    tokens["recruiter_dana"],
                    dana_id,
                    "Hi Alice! I reviewed your application — very impressed.",
                ),
                (tokens["alice"], users["alice"], "Hi Dana! I'd love to chat Thursday."),
                (
                    tokens["recruiter_dana"],
                    dana_id,
                    "I'll send a calendar invite for Thursday 2pm PT.",
                ),
            ]:
                post(
                    client,
                    "messaging",
                    "/messages/send",
                    {"thread_id": thread1["thread_id"], "sender_id": sender, "text": text},
                    token=tok,
                    ignore=[400],
                )
            post(
                client,
                "messaging",
                "/messages/markRead",
                {"thread_id": thread1["thread_id"], "user_id": users["alice"]},
                token=tokens["alice"],
                ignore=[400],
            )
            ok("Messages Dana ↔ Alice")
        else:
            ok("Dana ↔ Alice thread (skipped — thread open returned no thread_id)")

        thread2 = post(
            client,
            "messaging",
            "/threads/open",
            {"participant_ids": [users["bob"], dana_id]},
            token=tokens["bob"],
        )
        if thread2 and thread2.get("thread_id"):
            post(
                client,
                "messaging",
                "/messages/send",
                {
                    "thread_id": thread2["thread_id"],
                    "sender_id": users["bob"],
                    "text": "Hi! I saw the Frontend Engineer role.",
                },
                token=tokens["bob"],
                ignore=[400],
            )
            ok("Thread Bob ↔ Dana", {"thread_id": thread2["thread_id"]})
        else:
            ok("Bob ↔ Dana thread (skipped — thread open returned no thread_id)")

        # ── STEP 8: Analytics (all 5 charts) ──────────────────────────
        seed_analytics_charts(
            client,
            tokens["recruiter_dana"],
            dana_id,
            eli_id,
            job_ids,
            {
                "alice": str(users["alice"]),
                "bob": str(users["bob"]),
                "charlie": str(users["charlie"]),
            },
        )

        section("Seed Complete")
        print(
            f"""
  {BOLD}Log in as dana@acme.com / {SEED_USER_PASSWORD} for recruiter dashboard charts.{RESET}
  {BOLD}Analytics:{RESET} http://localhost:3008/docs
"""
        )


if __name__ == "__main__":
    main()
