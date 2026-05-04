#!/usr/bin/env python3
"""
transform_ai_match_demo.py — ~100 seed records tuned for SkillSync AI match (≈60–85%).

For **real résumé-backed members** mapped from the Kaggle resume dataset (one pipeline, all
domains/categories in the CSV), use ``backend/scripts/kaggle_resume_seed.py`` + Resume.csv
instead of growing new per-domain generators.

The AI service blends skill overlap and embedding similarity:
  final_score ≈ 0.5 * overlap_score + 0.4 * embedding_score + location_bonus
  overlap = |candidate ∩ job_skills| / |job_skills|
  location_bonus = +10 when candidate location string equals job.location.

This script builds members whose headline/summary/experience echo each job’s
title, description, and required skills, and matches job location (city/state)
so typical runs land in the ~60–85% band (embedding still depends on your
embedding model).

Reads (optional):  data/raw/job_postings.csv  — if missing, uses built-in jobs.
Writes:          data/seeds/*.json

Usage:
    pip install faker pandas

From repository root:
    python3 data/transform_ai_match_demo.py

From backend/ (wrapper delegates to the same file):
    python3 scripts/transform_ai_match_demo.py

Environment (optional):
    AI_DEMO_COMPACT=1      # default 1 → ~6 jobs × 1 applicant ≈ ~100 rows total
    AI_DEMO_COMPACT=0    # richer demo: 12 jobs × 3 applicants (~390 rows)
    AI_DEMO_N_JOBS=7     # max jobs in compact mode (default 7 → ~100 total rows)
    AI_DEMO_TECH_JOBS_ONLY=1   # default 1 → when using job_postings.csv, keep rows that look tech;
                               # if too few remain, falls back to built-in CANONICAL_JOBS (all tech).
                               # Set to 0 to use the first CSV rows without a tech filter.
"""

from __future__ import annotations

import json
import math
import os
import random
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from faker import Faker

try:
    import pandas as pd
except ImportError:
    pd = None  # type: ignore

BASE = Path(__file__).resolve().parent
RAW = BASE / "raw"
SEEDS = BASE / "seeds"
SEEDS.mkdir(parents=True, exist_ok=True)

random.seed(202602)
Faker.seed(202602)
fake = Faker()

COMPACT = os.environ.get("AI_DEMO_COMPACT", "1").strip() not in ("0", "false", "no")
N_JOBS_CAP = int(os.environ.get("AI_DEMO_N_JOBS", "7"))
N_MEMBERS = int(os.environ.get("AI_DEMO_N_MEMBERS", "0"))  # 0 = derive from compact mode
TECH_JOBS_ONLY = os.environ.get("AI_DEMO_TECH_JOBS_ONLY", "1").strip() not in ("0", "false", "no")

# Heuristic: tech / software / data roles (used only when filtering Kaggle job CSV).
_TECH_JOB_RE = re.compile(
    r"\b(engineer|engineering|developer|development|software|programmer|architect|devops|sre\b|sysadmin|"
    r"data\s+scientist|data\s+science|data\s+analyst|data\s+engineer|machine\s+learning|ml\s+engineer|\bml\b|"
    r"cloud|kubernetes|docker|aws|azure|gcp|backend|front[\s-]?end|full[\s-]?stack|web\s+developer|"
    r"mobile|ios|android|java|python|react|node\.?js|typescript|sql|security\s+engineer|network\s+engineer|"
    r"qa\s+engineer|test\s+automation|dba\b|database\s+admin|platform\s+engineer|site\s+reliability|"
    r"analytics\s+engineer|embedded|firmware|blockchain)\b",
    re.I,
)

# ── Canonical jobs (used when CSV missing or exhausted) ─────────────────────
CANONICAL_JOBS: list[dict] = [
    {
        "title": "Data Scientist",
        "description": (
            "Drive ML model development and data insights across our product. "
            "You will build pipelines in Python, query large datasets with SQL, "
            "train deep learning models in PyTorch, process big data with Spark, "
            "and build dashboards in Tableau for stakeholders."
        ),
        "location": "Seattle, WA",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "onsite",
        "skills_required": ["Python", "SQL", "PyTorch", "Spark", "Tableau"],
    },
    {
        "title": "Senior Backend Engineer",
        "description": (
            "Build and scale microservices in Python using FastAPI, PostgreSQL, "
            "Docker, and Kafka. Own reliability, observability, and API design."
        ),
        "location": "San Francisco, CA",
        "seniority_level": "senior",
        "employment_type": "full-time",
        "work_mode": "remote",
        "skills_required": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kafka"],
    },
    {
        "title": "Frontend Engineer",
        "description": (
            "Ship accessible React UIs with TypeScript, GraphQL APIs, and modern CSS. "
            "Collaborate with design on component libraries."
        ),
        "location": "New York, NY",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "hybrid",
        "skills_required": ["React", "TypeScript", "GraphQL", "CSS"],
    },
    {
        "title": "ML Engineer",
        "description": (
            "Productionize models on AWS with Kubernetes, TensorFlow, and Python. "
            "Focus on latency, monitoring, and safe rollouts."
        ),
        "location": "Austin, TX",
        "seniority_level": "senior",
        "employment_type": "full-time",
        "work_mode": "hybrid",
        "skills_required": ["Python", "TensorFlow", "AWS", "Kubernetes"],
    },
    {
        "title": "Data Analyst",
        "description": (
            "Analyze product metrics with SQL, Excel, and Tableau. Partner with PMs "
            "on experimentation and reporting."
        ),
        "location": "Chicago, IL",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "onsite",
        "skills_required": ["SQL", "Excel", "Tableau", "Python"],
    },
    {
        "title": "DevOps Engineer",
        "description": (
            "Manage CI/CD, Docker, Kubernetes, and Terraform for multi-region deploys. "
            "Improve reliability and cost efficiency."
        ),
        "location": "Denver, CO",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "remote",
        "skills_required": ["Docker", "Kubernetes", "Terraform", "Python"],
    },
    {
        "title": "Security Engineer",
        "description": (
            "Harden cloud workloads on AWS, automate compliance checks with Python, "
            "and respond to security incidents."
        ),
        "location": "Boston, MA",
        "seniority_level": "senior",
        "employment_type": "full-time",
        "work_mode": "hybrid",
        "skills_required": ["Python", "AWS", "Kubernetes", "Linux"],
    },
    {
        "title": "Product Analyst",
        "description": (
            "Turn ambiguous questions into SQL analyses and executive-ready Tableau "
            "dashboards; light Python for automation."
        ),
        "location": "Los Angeles, CA",
        "seniority_level": "entry",
        "employment_type": "full-time",
        "work_mode": "onsite",
        "skills_required": ["SQL", "Tableau", "Excel", "Python"],
    },
    {
        "title": "Full Stack Developer",
        "description": (
            "Build features with React, TypeScript, Node.js patterns, PostgreSQL, "
            "and Docker-based local dev."
        ),
        "location": "Miami, FL",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "hybrid",
        "skills_required": ["React", "TypeScript", "PostgreSQL", "Docker"],
    },
    {
        "title": "Cloud Engineer",
        "description": (
            "Design AWS networking and IAM; deploy services with Kubernetes and "
            "Terraform; script operations in Python."
        ),
        "location": "Phoenix, AZ",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "remote",
        "skills_required": ["AWS", "Kubernetes", "Terraform", "Python"],
    },
    {
        "title": "BI Developer",
        "description": (
            "Model data in SQL, build Power BI / Tableau dashboards, and support "
            "finance with Excel-based planning templates."
        ),
        "location": "Atlanta, GA",
        "seniority_level": "mid",
        "employment_type": "full-time",
        "work_mode": "onsite",
        "skills_required": ["SQL", "Tableau", "Excel", "Python"],
    },
    {
        "title": "Software Engineer — Platform",
        "description": (
            "Own internal APIs in Python, streaming with Kafka, persistence in PostgreSQL, "
            "and containerized workloads in Docker and Kubernetes."
        ),
        "location": "Portland, OR",
        "seniority_level": "senior",
        "employment_type": "full-time",
        "work_mode": "hybrid",
        "skills_required": ["Python", "Kafka", "PostgreSQL", "Docker", "Kubernetes"],
    },
]

UNIVERSITIES = [
    "Stanford University",
    "MIT",
    "UC Berkeley",
    "Carnegie Mellon",
    "University of Washington",
    "Georgia Tech",
]


def new_uuid() -> str:
    return str(uuid.uuid4())


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def clean_text(val) -> str:
    if val is None:
        return ""
    if pd is not None and isinstance(val, float) and pd.isna(val):
        return ""
    s = str(val)
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def parse_city_state(location: str) -> tuple[str, str]:
    """Return (city, state_abbr_or_tail) for SkillSync location fields."""
    loc = clean_text(location)
    if not loc:
        return fake.city(), fake.state_abbr()
    if "," in loc:
        parts = [p.strip() for p in loc.split(",")]
        city = parts[0] or fake.city()
        st = parts[1] if len(parts) > 1 else fake.state_abbr()
        if len(st) > 2:
            st = st[:2].upper() if st[:2].isalpha() else fake.state_abbr()
        return city, st
    return loc, fake.state_abbr()


def pick_member_skills(job_skills: list[str], variant_index: int) -> list[str]:
    """
    variant_index 0 = all job skills (max overlap).
    1 = drop one skill (still strong).
    2 = drop two if len>=4 else drop one (moderate overlap for 60–80 band).
    """
    js = [s for s in job_skills if s and str(s).strip()]
    if not js:
        return ["Python", "SQL", "Communication"]
    n = len(js)
    drop = 0
    if variant_index % 3 == 1:
        drop = 1
    elif variant_index % 3 == 2:
        drop = 2 if n >= 4 else 1
    keep = max(1, n - drop)
    return js[:keep]


def build_summary(job: dict, member_skills: list[str]) -> str:
    """Dense overlap with job text for embedding similarity."""
    jd = clean_text(job["description"])[:2500]
    title = clean_text(job["title"])
    skill_blob = " ".join(member_skills + job["skills_required"])
    filler = fake.paragraph(nb_sentences=3)
    return (
        f"{title}. {jd} Core strengths: {skill_blob}. "
        f"Hands-on experience across the full stack of this role. {filler}"
    )[:12000]


def build_resume_plaintext(job: dict, member_skills: list[str], exp: list[dict]) -> str:
    lines = [
        clean_text(job["title"]).upper(),
        "",
        "PROFESSIONAL SUMMARY",
        build_summary(job, member_skills)[:4000],
        "",
        "CORE SKILLS",
        ", ".join(member_skills),
        "",
        "EXPERIENCE",
    ]
    for e in exp:
        start = e.get("start_date") or e.get("start") or ""
        end = e.get("end_date") or e.get("end") or "Present"
        lines.append(f"{e.get('title')} — {e.get('company')} ({start}–{end})")
        lines.append(e.get("description", ""))
        lines.append("")
    lines.append("EDUCATION")
    lines.append(fake.catch_phrase())
    return "\n".join(lines)[:8000]


def _row_looks_tech(title: str, description: str, skills_desc: str) -> bool:
    blob = f"{title} {description} {skills_desc}"
    return _TECH_JOB_RE.search(blob) is not None


def load_jobs_from_csv(max_rows: int) -> list[dict]:
    path = RAW / "job_postings.csv"
    if pd is None or not path.exists():
        return []
    df = pd.read_csv(path, low_memory=False)
    df = df.dropna(subset=["title", "description"])
    df["title"] = df["title"].apply(clean_text)
    df["description"] = df["description"].apply(clean_text)
    df["location"] = df["location"].apply(clean_text) if "location" in df.columns else ""
    if "skills_desc" in df.columns:
        df["_skills_desc"] = df["skills_desc"].apply(lambda x: clean_text(x))
    else:
        df["_skills_desc"] = ""
    df = df[df["title"].str.len() > 2]
    df = df.drop_duplicates(subset=["description"])
    if TECH_JOBS_ONLY:
        pool = df[df.apply(lambda r: _row_looks_tech(r["title"], r["description"], r["_skills_desc"]), axis=1)]
        if len(pool) < 6:
            return []
        df = pool.head(max(max_rows * 8, 80))
    else:
        df = df.head(max(max_rows * 4, 40))
    out: list[dict] = []
    for _, row in df.iterrows():
        if len(out) >= max_rows:
            break
        skills_desc = row["_skills_desc"]
        raw_skills = [s.strip() for s in skills_desc.split(",") if s.strip()][:12]
        if len(raw_skills) < 3:
            raw_skills = (raw_skills + ["Python", "SQL", "Communication"])[:6]
        out.append(
            {
                "title": row["title"][:300],
                "description": row["description"][:10000],
                "location": (row.get("location") or "Remote")[:255],
                "seniority_level": "mid",
                "employment_type": "full-time",
                "work_mode": "hybrid",
                "skills_required": raw_skills,
            }
        )
    return out


def main() -> None:
    print("=" * 60)
    print("AI-aligned demo seeds (~100 records)")
    print("=" * 60)

    jobs_source = load_jobs_from_csv(24)
    if jobs_source:
        print(f"  Jobs from CSV: {len(jobs_source)} rows" + (" (tech-filtered)" if TECH_JOBS_ONLY else ""))
    elif TECH_JOBS_ONLY and (RAW / "job_postings.csv").exists():
        print("  Jobs from CSV: tech filter left <6 rows — using built-in CANONICAL_JOBS")
    jobs_tpl = jobs_source if len(jobs_source) >= 6 else CANONICAL_JOBS
    target_job_count = N_JOBS_CAP if COMPACT else 12
    while len(jobs_tpl) < target_job_count:
        jobs_tpl = jobs_tpl + CANONICAL_JOBS
    jobs_tpl = jobs_tpl[:target_job_count]

    n_recruiters = min(4, max(2, math.ceil(len(jobs_tpl) / 4))) if COMPACT else min(6, max(3, math.ceil(len(jobs_tpl) / 3)))
    recruiters: list[dict] = []
    recruiter_ids: list[str] = []
    for _ in range(n_recruiters):
        rid = new_uuid()
        cid = new_uuid()
        recruiter_ids.append(rid)
        recruiters.append(
            {
                "recruiter_id": rid,
                "company_id": cid,
                "name": fake.name()[:200],
                "email": fake.unique.email()[:255],
                "phone": fake.phone_number()[:20],
                "company_name": fake.company()[:300],
                "company_industry": "Technology",
                "company_size": "201-500",
                "role": "recruiter",
                "access_level": "recruiter",
                "created_at": fmt_dt(fake.date_time_between(start_date="-1y", end_date="now")),
            }
        )

    jobs_out: list[dict] = []
    job_ids: list[str] = []
    job_skills_out: list[dict] = []

    for i, spec in enumerate(jobs_tpl):
        jid = new_uuid()
        rid = recruiter_ids[i % len(recruiter_ids)]
        cid = next(r["company_id"] for r in recruiters if r["recruiter_id"] == rid)
        job_ids.append(jid)
        jobs_out.append(
            {
                "job_id": jid,
                "company_id": cid,
                "recruiter_id": rid,
                "title": spec["title"][:255],
                "description": spec["description"],
                "seniority_level": spec.get("seniority_level", "mid"),
                "employment_type": spec.get("employment_type", "full-time"),
                "work_mode": spec.get("work_mode", "hybrid"),
                "location": spec["location"][:255],
                "remote_type": spec.get("work_mode", "hybrid"),
                "salary_range": f"${random.randint(90, 140)}k - ${random.randint(140, 190)}k",
                "status": "open",
                "posted_datetime": fmt_dt(fake.date_time_between(start_date="-6M", end_date="now")),
                "views_count": random.randint(20, 500),
                "applicants_count": 0,
                "skills_required": list(spec["skills_required"]),
            }
        )
        for sk in spec["skills_required"]:
            job_skills_out.append({"job_id": jid, "skill": sk[:200]})

    # Members: 3 variants per job → controlled overlap bands
    members: list[dict] = []
    member_skills_rows: list[dict] = []
    member_experience: list[dict] = []
    member_education: list[dict] = []
    applications: list[dict] = []
    member_ids: list[str] = []

    if N_MEMBERS > 0:
        n_per_job = max(1, min(5, N_MEMBERS // max(1, len(jobs_out))))
    elif COMPACT:
        n_per_job = 1
    else:
        n_per_job = 3
    variant = 0
    for job_row, jid in zip(jobs_out, job_ids):
        req_skills = list(job_row.get("skills_required") or [])
        spec = {
            "title": job_row["title"],
            "description": job_row["description"],
            "skills_required": req_skills,
            "location": job_row["location"],
        }
        city, state = parse_city_state(job_row["location"])
        for k in range(n_per_job):
            mid = new_uuid()
            member_ids.append(mid)
            skills = pick_member_skills(spec["skills_required"], variant)
            variant += 1

            fn, ln = fake.first_name()[:80], fake.last_name()[:80]
            email = f"ai_demo_{len(member_ids):04d}@example.com"
            headline = f"{job_row['title']} | {fake.bs()[:120]}"[:220]
            summary = build_summary(spec, skills)
            co = fake.company()[:200]
            exp1 = {
                "exp_id": new_uuid(),
                "member_id": mid,
                "company": co,
                "title": job_row["title"][:200],
                "start_date": "2021-03-01",
                "end_date": None,
                "description": (job_row["description"][:800] + " " + fake.sentence())[:1200],
                "is_current": True,
            }
            exp2 = {
                "exp_id": new_uuid(),
                "member_id": mid,
                "company": fake.company()[:200],
                "title": f"Associate {job_row['title']}"[:200],
                "start_date": "2018-06-01",
                "end_date": "2021-02-28",
                "description": fake.paragraph(nb_sentences=4)[:1000],
                "is_current": False,
            }
            member_experience.extend([exp1, exp2])

            sy = random.randint(2014, 2020)
            member_education.append(
                {
                    "edu_id": new_uuid(),
                    "member_id": mid,
                    "institution": random.choice(UNIVERSITIES),
                    "degree": random.choice(["BS", "MS", "MBA"]),
                    "field": "Computer Science" if "Engineer" in job_row["title"] else "Business Analytics",
                    "start_year": sy,
                    "end_year": sy + random.randint(2, 5),
                }
            )

            resume_plain = build_resume_plaintext(spec, skills, [exp1, exp2])

            members.append(
                {
                    "member_id": mid,
                    "first_name": fn,
                    "last_name": ln,
                    "email": email,
                    "phone": fake.phone_number()[:30],
                    "location": job_row["location"],
                    "location_city": city,
                    "location_state": state,
                    "location_country": "US",
                    "headline": headline,
                    "summary": summary,
                    "about": summary[:4000],
                    "skills": skills,
                    "open_to": "job",
                    "profile_status": "open_to_work",
                    "resume_url": "https://example.com/resumes/ai_demo_sample.pdf",
                    "resume_plaintext": resume_plain,
                    "connections_count": random.randint(0, 200),
                    "created_at": fmt_dt(fake.date_time_between(start_date="-2y", end_date="now")),
                    "updated_at": fmt_dt(datetime.now()),
                    "aligned_job_id": jid,
                    "skillsync_experience": [
                        {
                            "title": exp1["title"],
                            "company": exp1["company"],
                            "start": "2021-03",
                            "end": None,
                            "is_current": True,
                            "description": exp1["description"],
                        },
                        {
                            "title": exp2["title"],
                            "company": exp2["company"],
                            "start": "2018-06",
                            "end": "2021-02",
                            "is_current": False,
                            "description": exp2["description"],
                        },
                    ],
                    "skillsync_education": [
                        {
                            "school": member_education[-1]["institution"],
                            "degree": member_education[-1]["degree"],
                            "field": member_education[-1]["field"],
                            "year": member_education[-1]["end_year"],
                        }
                    ],
                }
            )

            for sk in skills:
                member_skills_rows.append({"member_id": mid, "skill": sk[:200]})

            applications.append(
                {
                    "application_id": new_uuid(),
                    "job_id": jid,
                    "member_id": mid,
                    "resume_url": None,
                    "resume_text": resume_plain,
                    "cover_letter": fake.paragraph(nb_sentences=4)[:2000],
                    "application_datetime": fmt_dt(
                        fake.date_time_between(start_date="-4M", end_date="now")
                    ),
                    "status": random.choices(
                        ["submitted", "reviewing", "rejected"],
                        weights=[70, 20, 10],
                    )[0],
                }
            )

    # Small event sample
    events = []
    n_events = min(8, len(applications)) if COMPACT else min(25, len(applications))
    for _ in range(n_events):
        a = random.choice(applications)
        events.append(
            {
                "event_type": "application.submitted",
                "trace_id": new_uuid(),
                "timestamp": (datetime.now() - timedelta(days=random.randint(1, 90))).isoformat() + "Z",
                "actor_id": a["member_id"],
                "entity": {"entity_type": "application", "entity_id": a["application_id"]},
                "payload": {"job_id": a["job_id"]},
                "idempotency_key": new_uuid(),
            }
        )

    def write(name: str, data: list) -> None:
        p = SEEDS / name
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        print(f"  {name:<32} {len(data):>6,} rows  {p.stat().st_size // 1024:>6,} KB")

    print("\nWriting data/seeds/ …")
    write("ai_demo_recruiters.json", recruiters)
    write("ai_demo_jobs.json", jobs_out)
    write("ai_demo_job_skills.json", job_skills_out)
    write("ai_demo_members.json", members)
    write("ai_demo_member_skills.json", member_skills_rows)
    write("ai_demo_member_experience.json", member_experience)
    write("ai_demo_member_education.json", member_education)
    write("ai_demo_applications.json", applications)
    write("ai_demo_events.json", events)

    total = (
        len(recruiters)
        + len(jobs_out)
        + len(job_skills_out)
        + len(members)
        + len(member_skills_rows)
        + len(member_experience)
        + len(member_education)
        + len(applications)
        + len(events)
    )
    print("\nDone.")
    print(f"  Total JSON rows written: {total:,}")
    print("  Password for demo accounts when ingesting: same as scripts/seed.py → SkillSync1!")
    print("  Load into running services:  cd backend && python3 scripts/ingest_ai_demo_seeds.py")
    print("  (writes data/seeds/AI_DEMO_CREDENTIALS.txt with member + recruiter emails after ingest.)")
    print("  Match formula reminder: 0.5*skill_overlap + 0.4*embedding_similarity + location_bonus(10).")


if __name__ == "__main__":
    main()
