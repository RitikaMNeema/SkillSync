#!/usr/bin/env python3
"""
OPTIONAL — heavy analytics / dashboard demo data for dana@acme.com.

Run `python backend/scripts/seed.py` first for the base users, jobs, and
applications. This script adds more jobs, members, applications, and Mongo
analytics events; it is not a replacement for seed.py and does not use Kaggle.

What this script does:
  - Ensures recruiter Dana exists and can authenticate.
  - Ensures a minimum number of unique Dana job titles.
  - Ensures a pool of member users (and profiles with city/state).
  - Submits non-duplicate applications (one member per job max).
  - Emits recruiter-scoped analytics events for March-style dashboard windows:
      * application.submitted (with recruiter_id + city/state)
      * job.saved (with recruiter_id)
  - Triggers job.viewed events through job-service track endpoint.

Usage:
  python backend/scripts/seed_recruiter_dashboard.py --month 2026-03 --min-jobs 10
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import company_job_benefits as job_benefits  # noqa: E402

BASE = {
    "auth": "http://localhost:3001",
    "profile": "http://localhost:3002",
    "recruiter": "http://localhost:3003",
    "job": "http://localhost:3005",
    "application": "http://localhost:3006",
    "analytics": "http://localhost:3008",
}

DANA_EMAIL = "dana@acme.com"
# Must satisfy auth_service password policy (same as scripts/seed.py SEED_USER_PASSWORD).
DANA_PASSWORD = "SkillSync1!"

MEMBER_FIXTURES = [
    ("mila.ross@example.com", "Mila", "Ross", "Backend Engineer", "Austin", "TX"),
    ("noah.chen@example.com", "Noah", "Chen", "Frontend Engineer", "Seattle", "WA"),
    ("ava.khan@example.com", "Ava", "Khan", "Data Analyst", "Boston", "MA"),
    ("liam.patel@example.com", "Liam", "Patel", "Platform Engineer", "San Jose", "CA"),
    ("zoe.martin@example.com", "Zoe", "Martin", "ML Engineer", "Denver", "CO"),
    ("owen.garcia@example.com", "Owen", "Garcia", "SRE", "Chicago", "IL"),
    ("emma.kim@example.com", "Emma", "Kim", "Product Analyst", "New York", "NY"),
    ("lucas.nguyen@example.com", "Lucas", "Nguyen", "Full Stack Engineer", "Portland", "OR"),
    ("mia.lee@example.com", "Mia", "Lee", "Data Scientist", "Atlanta", "GA"),
    ("ethan.wilson@example.com", "Ethan", "Wilson", "Software Engineer", "San Diego", "CA"),
    ("isla.rivera@example.com", "Isla", "Rivera", "DevOps Engineer", "Phoenix", "AZ"),
    ("jack.moore@example.com", "Jack", "Moore", "QA Engineer", "Dallas", "TX"),
]

UNIQUE_DANA_JOB_TITLES = [
    "Senior Backend Engineer - Payments",
    "Senior Backend Engineer - Platform",
    "Frontend Engineer - Growth",
    "Frontend Engineer - Design Systems",
    "Data Engineer - Analytics Pipeline",
    "Machine Learning Engineer - Ranking",
    "DevOps Engineer - Cloud Infrastructure",
    "Site Reliability Engineer - Core Services",
    "Product Data Analyst - Recruiting Insights",
    "Full Stack Engineer - Employer Experience",
    "Security Engineer - AppSec",
    "Software Engineer - Integrations",
]


def _ok(label: str, payload: Any | None = None) -> None:
    if payload is None:
        print(f"  ✓ {label}")
    else:
        print(f"  ✓ {label} -> {json.dumps(payload)}")


def _die(message: str) -> None:
    print(f"  ✗ {message}")
    sys.exit(1)


def _post(
    client: httpx.Client,
    base_key: str,
    path: str,
    body: dict[str, Any],
    *,
    token: str | None = None,
    expect: tuple[int, ...] = (200, 201),
    ignore: tuple[int, ...] = (),
) -> dict[str, Any] | None:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = client.post(f"{BASE[base_key]}{path}", json=body, headers=headers)
    if response.status_code in ignore:
        return None
    if response.status_code not in expect:
        _die(f"{path} returned {response.status_code}: {response.text}")
    return response.json().get("data")


def _wait_for_services(client: httpx.Client) -> None:
    print("Waiting for required services...")
    for key in ("auth", "profile", "recruiter", "job", "application", "analytics"):
        for _ in range(60):
            try:
                response = client.get(f"{BASE[key]}/health", timeout=2)
                if response.status_code == 200:
                    _ok(f"{key} healthy")
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            _die(f"{key} health check timed out")


def _ensure_user(client: httpx.Client, email: str, password: str, role: str) -> tuple[int, str]:
    register = client.post(
        f"{BASE['auth']}/auth/register",
        json={"email": email, "password": password, "role": role},
    )
    if register.status_code not in (200, 201, 409):
        _die(f"register failed for {email}: {register.status_code} {register.text}")

    login = _post(client, "auth", "/auth/login", {"email": email, "password": password})
    assert login is not None
    return int(login["user_id"]), str(login["token"])


def _ensure_member_profile(
    client: httpx.Client,
    token: str,
    member_id: int,
    first_name: str,
    last_name: str,
    headline: str,
    city: str,
    state: str,
) -> None:
    payload = {
        "member_id": member_id,
        "first_name": first_name,
        "last_name": last_name,
        "headline": headline,
        "location_city": city,
        "location_state": state,
        "location_country": "US",
        "skills": ["Python", "SQL", "React"],
        "experience": [{"title": headline, "company": "Demo Co", "start": "2022-01", "end": None}],
        "education": [{"school": "State University", "degree": "BS Computer Science", "year": 2021}],
        "summary": f"{first_name} {last_name} seeded for recruiter dashboard analytics.",
        "resume_url": f"https://example.com/resumes/{member_id}.pdf",
    }
    _post(client, "profile", "/members/create", payload, token=token, ignore=(400, 409))


def _fetch_recruiter(client: httpx.Client, token: str, recruiter_id: int) -> dict[str, Any]:
    recruiter = _post(client, "recruiter", "/recruiters/get", {"recruiter_id": recruiter_id}, token=token)
    if not recruiter:
        _die("Could not fetch Dana recruiter profile")
    return recruiter


def _list_jobs_by_recruiter(client: httpx.Client, token: str, recruiter_id: int) -> list[dict[str, Any]]:
    page = 1
    all_jobs: list[dict[str, Any]] = []
    while True:
        data = _post(client, "job", "/jobs/byRecruiter", {"recruiter_id": recruiter_id, "page": page}, token=token)
        if not data:
            break
        jobs = data.get("jobs", [])
        all_jobs.extend(jobs)
        if len(all_jobs) >= int(data.get("total", 0)) or not jobs:
            break
        page += 1
    return all_jobs


def _create_unique_jobs_for_dana(
    client: httpx.Client,
    token: str,
    recruiter_id: int,
    company_id: int,
    existing_jobs: list[dict[str, Any]],
    min_jobs: int,
) -> None:
    existing_titles = {str(job.get("title", "")).strip().lower() for job in existing_jobs}
    created = 0
    for idx, title in enumerate(UNIQUE_DANA_JOB_TITLES):
        if len(existing_titles) >= min_jobs:
            break
        key = title.strip().lower()
        if key in existing_titles:
            continue
        payload = {
            "title": title,
            "description": f"{title} role seeded for analytics dashboard coverage.",
            "work_mode": random.choice(["remote", "hybrid", "onsite"]),
            "employment_type": "full-time",
            "seniority_level": random.choice(["mid", "senior"]),
            "location": random.choice(["San Francisco, CA", "Seattle, WA", "Austin, TX", "New York, NY"]),
            "skills_required": random.sample(
                ["Python", "FastAPI", "Kafka", "React", "TypeScript", "SQL", "Docker", "AWS"],
                k=4,
            ),
            "benefits": job_benefits.benefits_for_company("Acme Corporation"),
            "salary_min": 120000 + (idx * 5000),
            "salary_max": 160000 + (idx * 5000),
            "company_id": company_id,
            "recruiter_id": recruiter_id,
        }
        job = _post(client, "job", "/jobs/create", payload, token=token)
        if job:
            created += 1
            existing_titles.add(key)
    _ok("unique Dana jobs ensured", {"created": created, "total_titles": len(existing_titles)})


def _list_existing_application_pairs(
    client: httpx.Client,
    token: str,
    job_ids: list[int],
) -> set[tuple[int, int]]:
    pairs: set[tuple[int, int]] = set()
    for job_id in job_ids:
        page = 1
        while True:
            data = _post(client, "application", "/applications/byJob", {"job_id": job_id, "page": page}, token=token)
            if not data:
                break
            for app in data.get("applications", []):
                pairs.add((int(app["member_id"]), int(job_id)))
            if page * int(data.get("page_size", 20)) >= int(data.get("total", 0)):
                break
            page += 1
    return pairs


def _month_day(month: str, day_offset: int) -> str:
    start = datetime.fromisoformat(f"{month}-01").replace(tzinfo=timezone.utc)
    ts = start + timedelta(days=day_offset % 27, hours=(day_offset * 3) % 24)
    return ts.isoformat().replace("+00:00", "Z")


def _job_specific_city_state(
    job_id: int,
    member_id: int,
    month: str,
    job_index: int,
    unique_city_states: list[tuple[str, str]],
) -> tuple[str, str]:
    if not unique_city_states:
        return ("San Francisco", "CA")
    # Each job gets a different preferred pair of cities.
    preferred_a = unique_city_states[job_index % len(unique_city_states)]
    preferred_b = unique_city_states[(job_index + 3) % len(unique_city_states)]
    rng = random.Random(f"geo-v2:{month}:{job_id}:{member_id}")
    roll = rng.random()
    if roll < 0.6:
        return preferred_a
    if roll < 0.85:
        return preferred_b
    return unique_city_states[(job_index + member_id) % len(unique_city_states)]


def _job_geo_showcase_city(
    month: str,
    job_id: int,
    event_index: int,
    job_index: int,
    unique_city_states: list[tuple[str, str]],
) -> tuple[str, str]:
    if not unique_city_states:
        return ("San Francisco", "CA")
    primary = unique_city_states[job_index % len(unique_city_states)]
    secondary = unique_city_states[(job_index + 2) % len(unique_city_states)]
    tertiary = unique_city_states[(job_index + 5) % len(unique_city_states)]
    rng = random.Random(f"geo-showcase:{month}:{job_id}:{event_index}")
    # Vary proportions by job index so distributions differ across jobs.
    primary_ratio = 0.55 + (0.08 * (job_index % 3))  # 55%, 63%, 71%
    secondary_ratio = 0.22 + (0.04 * ((job_index + 1) % 3))  # 22%, 26%, 30%
    roll = rng.random()
    if roll < primary_ratio:
        return primary
    if roll < primary_ratio + secondary_ratio:
        return secondary
    if roll < 0.95:
        return tertiary
    return unique_city_states[(job_index + event_index) % len(unique_city_states)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default="2026-03", help="YYYY-MM for dashboard events")
    parser.add_argument("--min-jobs", type=int, default=10, help="Minimum unique Dana job titles")
    args = parser.parse_args()

    month = args.month
    min_jobs = max(6, args.min_jobs)

    with httpx.Client(timeout=15) as client:
        _wait_for_services(client)

        dana_id, dana_token = _ensure_user(client, DANA_EMAIL, DANA_PASSWORD, "recruiter")
        recruiter = _fetch_recruiter(client, dana_token, dana_id)
        company_id = int(recruiter["company_id"])
        _ok("Dana authenticated", {"recruiter_id": dana_id, "company_id": company_id})

        # Ensure member pool with city/state for geo analytics.
        member_tokens: dict[int, str] = {}
        member_city_state: dict[int, tuple[str, str]] = {}
        for email, first, last, headline, city, state in MEMBER_FIXTURES:
            member_id, token = _ensure_user(client, email, DANA_PASSWORD, "member")
            _ensure_member_profile(client, token, member_id, first, last, headline, city, state)
            member_tokens[member_id] = token
            member_city_state[member_id] = (city, state)
        _ok("member pool ready", {"members": len(member_tokens)})

        jobs = _list_jobs_by_recruiter(client, dana_token, dana_id)
        _create_unique_jobs_for_dana(client, dana_token, dana_id, company_id, jobs, min_jobs)
        jobs = [j for j in _list_jobs_by_recruiter(client, dana_token, dana_id) if str(j.get("status", "open")) == "open"]
        if len(jobs) < 4:
            _die("Need at least 4 open Dana jobs after seeding")
        _ok("open Dana jobs", {"count": len(jobs)})

        # Build non-duplicate applications.
        job_ids = [int(job["job_id"]) for job in jobs]
        existing_pairs = _list_existing_application_pairs(client, dana_token, job_ids)
        members = list(member_tokens.keys())
        random.shuffle(members)

        # Vary counts so top/low charts look meaningful.
        targets: dict[int, int] = {}
        for idx, job_id in enumerate(job_ids):
            targets[job_id] = 2 + (idx % 6)  # 2..7 applications per job

        created_apps: list[tuple[int, int]] = []
        member_cursor = 0
        for job_id in job_ids:
            target = targets[job_id]
            attempts = 0
            while target > 0 and attempts < len(members) * 3:
                member_id = members[member_cursor % len(members)]
                member_cursor += 1
                attempts += 1
                pair = (member_id, job_id)
                if pair in existing_pairs:
                    continue
                submit = _post(
                    client,
                    "application",
                    "/applications/submit",
                    {
                        "job_id": job_id,
                        "member_id": member_id,
                        "resume_url": f"https://example.com/resumes/{member_id}.pdf",
                        "cover_letter": "Seeded recruiter dashboard application.",
                    },
                    token=member_tokens[member_id],
                    ignore=(409, 400),
                )
                if submit:
                    created_apps.append(pair)
                    existing_pairs.add(pair)
                    target -= 1
        _ok("applications seeded", {"new_pairs": len(created_apps), "total_pairs": len(existing_pairs)})

        # Trigger recruiter-scoped view events through job-service.
        view_events = 0
        for job in job_ids:
            for member_id in list(member_tokens.keys())[:8]:
                tracked = _post(
                    client,
                    "job",
                    "/jobs/trackView",
                    {"job_id": job, "viewer_id": member_id},
                    token=member_tokens[member_id],
                )
                if tracked:
                    view_events += 1
        _ok("job views tracked", {"events": view_events})

        # Save jobs (no duplicate member/job save links).
        save_links = 0
        for idx, job_id in enumerate(job_ids):
            for member_id in list(member_tokens.keys())[idx % 3: idx % 3 + 4]:
                saved = _post(
                    client,
                    "job",
                    "/jobs/save",
                    {"member_id": member_id, "job_id": job_id},
                    token=member_tokens[member_id],
                    ignore=(409,),
                )
                if saved:
                    save_links += 1
        _ok("job save links ensured", {"new_links": save_links})

        # Ingest month-scoped analytics events with recruiter_id + city/state.
        # This makes geo and saved trend charts deterministic for demos.
        ingested = 0
        sorted_pairs = sorted(existing_pairs, key=lambda pair: (pair[1], pair[0]))
        unique_city_states = sorted(set(member_city_state.values()))
        job_order = {job_id: index for index, job_id in enumerate(sorted(job_ids))}
        for idx, (member_id, job_id) in enumerate(sorted_pairs):
            city, state = _job_specific_city_state(
                job_id,
                member_id,
                month,
                job_order.get(job_id, 0),
                unique_city_states,
            )
            body = {
                "event_type": "application.submitted",
                "trace_id": f"dashboard-seed-v2-{month}-app-{member_id}-{job_id}",
                "timestamp": _month_day(month, idx),
                "actor_id": str(member_id),
                "entity": {"entity_type": "application", "entity_id": f"seed-{member_id}-{job_id}"},
                "payload": {
                    "job_id": str(job_id),
                    "member_id": str(member_id),
                    "recruiter_id": str(dana_id),
                    "city": city,
                    "state": state,
                },
                "idempotency_key": f"dashboard-seed:v2:{month}:app:{member_id}:{job_id}",
            }
            result = _post(client, "analytics", "/events/ingest", body, token=dana_token)
            if result:
                ingested += 1

        # Amplify geo distinction per job so dropdown changes are visibly different.
        # Uses unique idempotency keys (v3) to avoid collisions with prior runs.
        showcase_events = 0
        for job_index, job_id in enumerate(sorted(job_ids)):
            for event_index in range(80):
                city, state = _job_geo_showcase_city(
                    month,
                    job_id,
                    event_index,
                    job_index,
                    unique_city_states,
                )
                actor_id = 900000 + (job_index * 1000) + event_index
                body = {
                    "event_type": "application.submitted",
                    "trace_id": f"dashboard-seed-v3-{month}-geo-{job_id}-{event_index}",
                    "timestamp": _month_day(month, event_index + (job_index * 2)),
                    "actor_id": str(actor_id),
                    "entity": {"entity_type": "application", "entity_id": f"seed-v3-{job_id}-{event_index}"},
                    "payload": {
                        "job_id": str(job_id),
                        "member_id": str(actor_id),
                        "recruiter_id": str(dana_id),
                        "city": city,
                        "state": state,
                    },
                    "idempotency_key": f"dashboard-seed:v3:{month}:geo:{job_id}:{event_index}",
                }
                result = _post(client, "analytics", "/events/ingest", body, token=dana_token)
                if result:
                    showcase_events += 1

        save_ingested = 0
        for idx, job_id in enumerate(job_ids):
            member_slice = list(member_tokens.keys())[idx % 4: idx % 4 + 3]
            for offset, member_id in enumerate(member_slice):
                body = {
                    "event_type": "job.saved",
                    "trace_id": f"dashboard-seed-{month}-save-{member_id}-{job_id}-{offset}",
                    "timestamp": _month_day(month, idx * 2 + offset),
                    "actor_id": str(member_id),
                    "entity": {"entity_type": "job", "entity_id": str(job_id)},
                    "payload": {
                        "job_id": str(job_id),
                        "recruiter_id": str(dana_id),
                    },
                    "idempotency_key": f"dashboard-seed:{month}:save:{member_id}:{job_id}:{offset}",
                }
                result = _post(client, "analytics", "/events/ingest", body, token=dana_token)
                if result:
                    save_ingested += 1

        _ok("analytics events ingested", {"applications": ingested, "geo_showcase": showcase_events, "saved": save_ingested})
        print("\nDone. Refresh recruiter dashboard after ~5 minutes (analytics cache TTL) or restart analytics-service.")


if __name__ == "__main__":
    main()
