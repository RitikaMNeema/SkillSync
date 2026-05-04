#!/usr/bin/env python3
"""
Generate bulk JSON seeds from Kaggle-style CSVs (same logical pipeline as a LinkedIn-clone transform).

Reads (when present):
  data/raw/job_postings.csv
  data/raw/companies.csv
  data/raw/Resume/Resume.csv

Writes under data/seeds/kaggle_bulk/:
  members.json, member_experience.json, member_education.json, member_skills.json,
  recruiters.json, jobs.json, applications.json,
  connections.json, messages.json, threads.json,
  scheduled_events.json, events.json

Counts are controlled by environment variables (defaults are moderate for local dev).
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("Install pandas: pip install pandas", file=sys.stderr)
    raise

from faker import Faker

BASE = Path(__file__).resolve().parent
RAW = BASE / "raw"
SEEDS = BASE / "seeds" / "kaggle_bulk"
SEEDS.mkdir(parents=True, exist_ok=True)

fake = Faker()

N_MEMBERS = int(os.getenv("N_MEMBERS", "300"))
N_RECRUITERS = int(os.getenv("N_RECRUITERS", "80"))
N_JOBS = int(os.getenv("N_JOBS", "400"))
N_APPLICATIONS = int(os.getenv("N_APPLICATIONS", "800"))
N_CONNECTIONS = int(os.getenv("N_CONNECTIONS", "400"))
N_MESSAGES = int(os.getenv("N_MESSAGES", "200"))
N_SCHEDULED_EVENTS = int(os.getenv("N_SCHEDULED_EVENTS", "100"))
N_EVENTS = int(os.getenv("N_EVENTS", "500"))


def _read_job_postings() -> pd.DataFrame:
    path = RAW / "job_postings.csv"
    if not path.exists():
        print(f"Missing {path}; using empty job frame.", file=sys.stderr)
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def _read_companies() -> pd.DataFrame:
    path = RAW / "companies.csv"
    if not path.exists():
        print(f"Missing {path}; using empty companies frame.", file=sys.stderr)
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def _read_resumes() -> pd.DataFrame:
    path = RAW / "Resume" / "Resume.csv"
    if not path.exists():
        print(f"Missing {path}; using empty resume frame.", file=sys.stderr)
        return pd.DataFrame()
    return pd.read_csv(path, low_memory=False)


def _parse_salary(s: str | float | int | None) -> tuple[float | None, float | None]:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None, None
    s = str(s).strip()
    if not s or s.lower() == "nan":
        return None, None
    nums = re.findall(r"\d[\d,]*", s)
    if not nums:
        return None, None
    vals = [float(n.replace(",", "")) for n in nums]
    if len(vals) == 1:
        lo = vals[0] * 0.85
        hi = vals[0] * 1.15
        return lo, hi
    return min(vals), max(vals)


def _split_location(loc: str | None) -> tuple[str | None, str | None, str | None]:
    if not loc or str(loc).strip().lower() == "nan":
        return None, None, "US"
    parts = [p.strip() for p in str(loc).split(",") if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1], "US"
    if len(parts) == 1:
        return parts[0], None, "US"
    return None, None, "US"


def main() -> None:
    random.seed(42)
    Faker.seed(42)

    job_df = _read_job_postings()
    comp_df = _read_companies()
    resume_df = _read_resumes()

    members: list[dict] = []
    member_experience: list[dict] = []
    member_education: list[dict] = []
    member_skills: list[dict] = []

    resume_rows = resume_df.to_dict("records") if len(resume_df) else []
    for i in range(N_MEMBERS):
        mid = str(uuid.uuid4())
        if resume_rows:
            rr = resume_rows[i % len(resume_rows)]
            cat = str(rr.get("Category", "Professional"))
            resume_text = str(rr.get("Resume_str", ""))[:4000]
        else:
            cat = fake.job()
            resume_text = fake.text(max_nb_chars=800)
        fn = fake.first_name()
        ln = fake.last_name()
        loc = fake.city() + ", " + fake.state_abbr()
        city, state, country = _split_location(loc)
        headline = (f"{cat} | {fake.catch_phrase()}")[:220]
        members.append(
            {
                "member_id": mid,
                "first_name": fn,
                "last_name": ln,
                "email": fake.unique.email(),
                "headline": headline,
                "summary": resume_text[:1200],
                "about": resume_text[:2000],
                "location": loc,
                "location_city": city,
                "location_state": state,
                "location_country": country,
                # SkillSync OPEN_TO_VALUES / PROFILE_STATUS_VALUES
                "open_to": random.choice([None, "job", "services", "hiring", "volunteer"]),
                "profile_status": random.choice(["none", "open_to_work", "hiring"]),
                "phone": fake.phone_number(),
            }
        )
        for _ in range(random.randint(1, 3)):
            member_experience.append(
                {
                    "experience_id": str(uuid.uuid4()),
                    "member_id": mid,
                    "title": fake.job(),
                    "company": fake.company(),
                    "start_date": fake.date_between(start_date="-8y", end_date="-2y").isoformat(),
                    "end_date": fake.date_between(start_date="-2y", end_date="today").isoformat()
                    if random.random() < 0.7
                    else None,
                    "description": fake.text(max_nb_chars=400),
                }
            )
        for _ in range(random.randint(0, 2)):
            sy = random.randint(2008, 2018)
            ey = sy + random.randint(2, 4)
            member_education.append(
                {
                    "education_id": str(uuid.uuid4()),
                    "member_id": mid,
                    "institution": fake.company() + " University",
                    "degree": random.choice(["BS", "BA", "MS", "MBA", "PhD"]),
                    "field": cat,
                    "start_year": sy,
                    "end_year": ey,
                }
            )
        skills = list({fake.word() for _ in range(random.randint(3, 10))})
        for sk in skills:
            member_skills.append({"member_id": mid, "skill": sk})

    recruiter_company_pairs: list[dict] = []
    recruiters: list[dict] = []
    for _ in range(N_RECRUITERS):
        rid = str(uuid.uuid4())
        cid = str(uuid.uuid4())
        recruiter_company_pairs.append({"recruiter_id": rid, "company_id": cid})
        recruiters.append(
            {
                "recruiter_id": rid,
                "company_id": cid,
                "name": fake.name(),
                "email": fake.unique.email(),
                "phone": fake.phone_number(),
                "role": random.choice(["Technical Recruiter", "Talent Partner", "Recruiter"]),
                "access_level": "recruiter",
                "company_name": fake.company(),
                "company_industry": random.choice(["Technology", "Finance", "Healthcare", "Retail"]),
                "company_size": random.choice(["1-50", "51-200", "201-500", "501-1000"]),
            }
        )

    jobs: list[dict] = []
    job_rows = job_df.to_dict("records") if len(job_df) else []
    comp_rows = comp_df.to_dict("records") if len(comp_df) else []
    for i in range(N_JOBS):
        pair = random.choice(recruiter_company_pairs)
        rid = pair["recruiter_id"]
        cid = pair["company_id"]
        if job_rows:
            jr = job_rows[i % len(job_rows)]
            title = str(jr.get("title", fake.job()))
            desc = str(jr.get("description", fake.text(max_nb_chars=600)))[:8000]
            loc = str(jr.get("location", fake.city()))[:255]
            # LinkedIn Job 2023 (rajatraj0502): min_salary / max_salary; older dumps may use pay strings.
            smin_raw = jr.get("min_salary") or jr.get("salary_min")
            smax_raw = jr.get("max_salary") or jr.get("salary_max")
            try:
                parsed_min = float(smin_raw) if smin_raw is not None and str(smin_raw).strip() not in ("", "nan") else None
                parsed_max = float(smax_raw) if smax_raw is not None and str(smax_raw).strip() not in ("", "nan") else None
            except (TypeError, ValueError):
                parsed_min = parsed_max = None
            if parsed_min is not None and parsed_max is not None:
                sal_min, sal_max = min(parsed_min, parsed_max), max(parsed_min, parsed_max)
            elif parsed_min is not None:
                sal_min, sal_max = parsed_min, parsed_min * 1.2
            elif parsed_max is not None:
                sal_min, sal_max = parsed_max * 0.85, parsed_max
            else:
                sal_min, sal_max = _parse_salary(jr.get("pay_period_type") or jr.get("pay_rate"))
            if sal_min is None:
                sal_min, sal_max = random.uniform(70_000, 120_000), random.uniform(120_000, 200_000)
        else:
            title = fake.job()
            desc = fake.text(max_nb_chars=600)
            loc = fake.city()
            sal_min, sal_max = random.uniform(70_000, 120_000), random.uniform(120_000, 200_000)
        comp_name = None
        if comp_rows:
            cr = comp_rows[i % len(comp_rows)]
            comp_name = str(cr.get("name", ""))[:255] or None
        jobs.append(
            {
                "job_id": str(uuid.uuid4()),
                "recruiter_id": rid,
                "company_id": cid,
                "title": title[:255],
                "description": desc,
                "location": loc[:255],
                "employment_type": random.choice(["full_time", "part_time", "contract"]),
                "salary_min": float(sal_min),
                "salary_max": float(sal_max),
                "company_name_snapshot": comp_name,
            }
        )

    applications: list[dict] = []
    for _ in range(N_APPLICATIONS):
        m = random.choice(members)
        j = random.choice(jobs)
        applications.append(
            {
                "application_id": str(uuid.uuid4()),
                "job_id": j["job_id"],
                "member_id": m["member_id"],
                "status": random.choice(["submitted", "reviewed", "interview", "rejected", "hired"]),
                "resume_text": (m.get("summary") or "")[:2000],
                "cover_letter": fake.text(max_nb_chars=400),
                "applied_at": fake.date_time_between(start_date="-90d", end_date="now").isoformat(),
            }
        )

    member_ids = [m["member_id"] for m in members]
    connections: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for _ in range(N_CONNECTIONS):
        a, b = random.sample(member_ids, 2)
        key = tuple(sorted((a, b)))
        if key in seen:
            continue
        seen.add(key)
        connections.append(
            {
                "connection_id": str(uuid.uuid4()),
                "requester_id": a,
                "addressee_id": b,
                "status": random.choice(["pending", "accepted"]),
                "created_at": fake.date_time_between(start_date="-180d", end_date="now").isoformat(),
            }
        )

    threads: list[dict] = []
    messages: list[dict] = []
    for _ in range(N_MESSAGES // 2):
        tid = str(uuid.uuid4())
        u1, u2 = random.sample(member_ids, 2)
        threads.append({"thread_id": tid, "participant_ids": [u1, u2]})
        for k in range(random.randint(1, 4)):
            messages.append(
                {
                    "message_id": str(uuid.uuid4()),
                    "thread_id": tid,
                    "sender_id": random.choice([u1, u2]),
                    "body": fake.sentence(nb_words=10),
                    "sent_at": fake.date_time_between(start_date="-30d", end_date="now").isoformat(),
                }
            )

    scheduled_events: list[dict] = []
    for _ in range(N_SCHEDULED_EVENTS):
        jid = random.choice(jobs)["job_id"]
        mid = random.choice(member_ids)
        scheduled_events.append(
            {
                "event_id": str(uuid.uuid4()),
                "job_id": jid,
                "member_id": mid,
                "title": fake.catch_phrase(),
                "start_time": fake.date_time_between(start_date="+1d", end_date="+30d").isoformat(),
                "end_time": fake.date_time_between(start_date="+31d", end_date="+60d").isoformat(),
                "location": fake.city(),
            }
        )

    events: list[dict] = []
    event_types = ["profile_view", "job_view", "application_submit", "search", "login"]
    for _ in range(N_EVENTS):
        et = random.choice(event_types)
        uid = random.choice(member_ids)
        payload = {"query": fake.word()} if et == "search" else {}
        events.append(
            {
                "event_id": str(uuid.uuid4()),
                "event_type": et,
                "user_id": uid,
                "timestamp": fake.date_time_between(start_date="-30d", end_date="now").isoformat(),
                "payload": payload,
            }
        )

    def dump(name: str, data: list | dict) -> None:
        p = SEEDS / name
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Wrote {p} ({len(data) if isinstance(data, list) else 1} records)")

    dump("members.json", members)
    dump("member_experience.json", member_experience)
    dump("member_education.json", member_education)
    dump("member_skills.json", member_skills)
    dump("recruiters.json", recruiters)
    dump("jobs.json", jobs)
    dump("applications.json", applications)
    dump("connections.json", connections)
    dump("threads.json", threads)
    dump("messages.json", messages)
    dump("scheduled_events.json", scheduled_events)
    dump("events.json", events)
    print(f"\nDone. Output directory: {SEEDS}")


if __name__ == "__main__":
    main()
