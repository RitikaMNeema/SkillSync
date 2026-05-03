#!/usr/bin/env python3
"""
Import Kaggle LinkedIn-style job CSV rows via Job Service APIs (DATA236 §9.1).

Supports:
  - LinkedIn Job 2023-style files (rajatraj0502): job_postings.csv + optional job_skills.csv
  - Generic single-CSV exports (e.g. joykimaiyo18): column names normalized to common aliases

Default mode reuses **Dana / Eli** from `scripts/seed.py` (run `seed.py` once first).

**Per-company recruiters** (`--per-company-recruiters`): for each distinct employer name in the CSV,
registers a new **recruiter** user, creates a **company** row, and posts that company’s jobs under that
recruiter — intended for [joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset)
and similar exports with a **company** column.

Login pattern: **`{company_slug}_rec@example.com`** (e.g. `google_rec@example.com`). If two employers slug to the
same local part, a short hash segment is inserted before `_rec` so emails stay unique. Recruiter **display name** is a
random synthetic person name (unique per account). **Password** is the same as `scripts/seed.py`:
**`SkillSync1!`** (`SEED_USER_PASSWORD`), unless you changed it locally.

Each imported job gets a **`benefits`** array derived from the employer name (`scripts/company_job_benefits.py`): every job for the same company shares the same bundle.

Usage (from backend/):
  pip install httpx
  python scripts/seed.py   # once (optional for per-company mode; still need auth service up)
  python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv
  python scripts/kaggle_jobs_seed.py --csv path/to/linkedin_jobs.csv --per-company-recruiters --limit 200
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import secrets
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import company_job_benefits as job_benefits  # noqa: E402
import recruiter_profile_defaults as recruiter_defaults  # noqa: E402
import seed as seed_mod  # noqa: E402

BASE = seed_mod.BASE
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
post = seed_mod.post
fetch_all_jobs_by_recruiter = seed_mod.fetch_all_jobs_by_recruiter
wait_for_services = seed_mod.wait_for_services
ok = seed_mod.ok
section = seed_mod.section
BENIGN_DUP_MARKERS = seed_mod.BENIGN_DUP_MARKERS

DANA_EMAIL = "dana@acme.com"
ELI_EMAIL = "eli@acme.com"


def normalize_row(row: dict[str, str]) -> dict[str, str]:
    return {((k or "").strip().lower()): (v or "").strip() for k, v in row.items()}


def safe_float(raw: str | None) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def load_skills_by_job(skills_path: Path) -> dict[str, list[str]]:
    if not skills_path.is_file():
        return {}
    by_job: dict[str, list[str]] = defaultdict(list)
    with skills_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            jid = (row.get("job_id") or "").strip()
            sk = (row.get("skill_abr") or row.get("skill") or row.get("skills") or "").strip()
            if jid and sk:
                by_job[jid].append(sk)
    return {k: v[:35] for k, v in by_job.items()}


def detect_linkedin_job_2023(norm_keys: set[str]) -> bool:
    return "job_id" in norm_keys and "formatted_work_type" in norm_keys and "title" in norm_keys


def pick_company_name(norm: dict[str, str]) -> str:
    for key in (
        "company_name",
        "company",
        "employer",
        "employer_name",
        "organization",
        "organization_name",
        "hiring_organization",
        "hiring_company",
    ):
        v = (norm.get(key) or "").strip()
        if v:
            return v
    return ""


def pick_company_industry(norm: dict[str, str]) -> str | None:
    for key in ("industry", "sector", "company_industry", "job_industry"):
        v = (norm.get(key) or "").strip()
        if v:
            return v[:255]
    return None


def pick_company_hq(norm: dict[str, str]) -> str | None:
    for key in ("company_location", "headquarters", "headquarter", "hq", "employer_location"):
        v = (norm.get(key) or "").strip()
        if v:
            return v[:255]
    return None


_FIRST_NAMES = (
    "Jordan",
    "Taylor",
    "Morgan",
    "Riley",
    "Casey",
    "Avery",
    "Quinn",
    "Reese",
    "Skylar",
    "Dakota",
    "Rowan",
    "Sage",
    "Alex",
    "Cameron",
    "Jamie",
    "Devon",
    "Blair",
    "Emerson",
)
_LAST_NAMES = (
    "Nguyen",
    "Patel",
    "Hernandez",
    "Okonkwo",
    "Ibrahim",
    "Nakamura",
    "Silva",
    "Okafor",
    "Reyes",
    "Park",
    "Murphy",
    "Bennett",
    "Foster",
    "Hayes",
    "Coleman",
    "Thakur",
    "Yilmaz",
    "Santos",
)


def company_slug_local(company_display_name: str) -> str:
    key = company_display_name.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "_", key).strip("_")[:40] or "co"
    return re.sub(r"_+", "_", slug)


def company_seed_email(company_display_name: str, claimed_emails: dict[str, str]) -> str:
    """Login like google_rec@example.com; add _{hex} before _rec if another employer claims the same slug."""
    key = company_display_name.strip().lower()
    tag = hashlib.sha256(key.encode("utf-8")).hexdigest()[:6]
    base = company_slug_local(company_display_name)
    candidate = f"{base}_rec@example.com"
    owner = claimed_emails.get(candidate)
    if owner is None:
        claimed_emails[candidate] = key
        return candidate
    if owner == key:
        return candidate
    n = 0
    while True:
        mid = tag if n == 0 else f"{tag}_{n}"
        unique = f"{base}_{mid}_rec@example.com"
        u_owner = claimed_emails.get(unique)
        if u_owner is None:
            claimed_emails[unique] = key
            return unique
        if u_owner == key:
            return unique
        n += 1


def synthetic_recruiter_name(used: set[str]) -> str:
    for _ in range(120):
        name = f"{secrets.choice(_FIRST_NAMES)} {secrets.choice(_LAST_NAMES)}"
        if name not in used:
            used.add(name)
            return name[:100]
    suffix = secrets.token_hex(3).upper()
    name = f"Recruiter {suffix}"
    used.add(name)
    return name[:100]


def register_or_login_recruiter(client: httpx.Client, email: str) -> tuple[int, str]:
    r = client.post(
        f"{BASE['auth']}/auth/register",
        json={"email": email, "password": SEED_USER_PASSWORD, "role": "recruiter"},
        timeout=60,
    )
    if r.status_code not in (200, 201, 409):
        raise RuntimeError(f"recruiter register failed {r.status_code}: {r.text}")
    login = post(client, "auth", "/auth/login", {"email": email, "password": SEED_USER_PASSWORD})
    return int(login["user_id"]), str(login["token"])


def _recruiter_profile_is_sparse(rec: dict) -> bool:
    if not (rec.get("about") or "").strip():
        return True
    exp = rec.get("experience")
    if exp is None:
        return True
    return isinstance(exp, list) and len(exp) == 0


def sync_sparse_recruiter_profile(
    client: httpx.Client,
    user_id: int,
    token: str,
    company_name: str,
    industry: str | None,
    hq: str | None,
    recruiter_name: str,
) -> None:
    """PATCH defaults when an older import left About / Experience empty."""
    rec = post(client, "recruiter", "/recruiters/get", {"recruiter_id": user_id}, token=token)
    if not _recruiter_profile_is_sparse(rec):
        return
    name_parts = recruiter_name.split(None, 1)
    fallback_first = (name_parts[0] if name_parts else recruiter_name)[:120]
    fallback_last = (name_parts[1] if len(name_parts) > 1 else "")[:120]
    enrich = recruiter_defaults.recruiter_profile_enrichment(
        company_name,
        industry=industry,
        hq=hq,
        role_label="Recruiter",
        experience_job_title="Talent Acquisition Partner",
    )
    patch = {
        "recruiter_id": user_id,
        "first_name": (rec.get("first_name") or "").strip() or fallback_first,
        "last_name": (rec.get("last_name") or "").strip() or fallback_last,
        **enrich,
    }
    post(client, "recruiter", "/recruiters/update", patch, token=token)


def ensure_company_recruiter(
    client: httpx.Client,
    company_name: str,
    industry: str | None,
    hq: str | None,
    cache: dict[str, tuple[int, str, int, str, str]],
    email_claims: dict[str, str],
    used_recruiter_names: set[str],
    profile_synced: set[str],
) -> tuple[int, str, int, str, str]:
    """Return (recruiter_id, token, company_id, email, recruiter_display_name); create if new."""
    key = company_name.strip().lower()
    if key in cache:
        uid, tok, cid, em, rname = cache[key]
        if key not in profile_synced:
            sync_sparse_recruiter_profile(client, uid, tok, company_name, industry, hq, rname)
            profile_synced.add(key)
        return cache[key]

    email = company_seed_email(company_name, email_claims)
    recruiter_name = synthetic_recruiter_name(used_recruiter_names)
    user_id, token = register_or_login_recruiter(client, email)
    name_parts = recruiter_name.split(None, 1)
    first_nm = (name_parts[0] if name_parts else recruiter_name)[:120]
    last_nm = (name_parts[1] if len(name_parts) > 1 else "")[:120]
    enrich = recruiter_defaults.recruiter_profile_enrichment(
        company_name,
        industry=industry,
        hq=hq,
        role_label="Recruiter",
        experience_job_title="Talent Acquisition Partner",
    )
    body = {
        "recruiter_id": user_id,
        "name": recruiter_name,
        "email": email,
        "role": "Recruiter",
        "first_name": first_nm,
        "last_name": last_nm,
        **enrich,
        "company": {
            "name": company_name[:255],
            "industry": (industry or "General")[:255],
            "size": "1000-5000",
            "location": hq,
        },
    }
    result = post(
        client,
        "recruiter",
        "/recruiters/create",
        body,
        token=token,
        ignore=[409, 400],
        benign_async_fail=BENIGN_DUP_MARKERS,
    )
    if result is None:
        rec = post(client, "recruiter", "/recruiters/get", {"recruiter_id": user_id}, token=token)
    else:
        rec = result
    company_id = int(rec["company_id"])
    row = (user_id, token, company_id, email, recruiter_name)
    cache[key] = row
    if key not in profile_synced:
        sync_sparse_recruiter_profile(client, user_id, token, company_name, industry, hq, recruiter_name)
        profile_synced.add(key)
    return row


def map_employment(wt: str) -> str:
    raw = (wt or "FULL_TIME").strip()
    low = raw.lower().replace("_", "-").replace(" ", "-")
    if low in ("full-time", "fulltime"):
        return "full-time"
    if low in ("part-time", "parttime"):
        return "part-time"
    key = raw.upper().replace("-", "_").replace(" ", "_")
    m = {
        "FULL_TIME": "full-time",
        "CONTRACT": "contract",
        "PART_TIME": "part-time",
        "TEMPORARY": "contract",
        "INTERNSHIP": "internship",
        "VOLUNTEER": "volunteer",
        "OTHER": "full-time",
    }
    return m.get(key, "full-time")


def map_seniority(raw: str) -> str:
    fel = (raw or "").lower().strip()
    sm = {
        "entry level": "entry",
        "internship": "entry",
        "mid-senior level": "mid",
        "associate": "mid",
        "director": "director",
        "executive": "executive",
        "not applicable": "mid",
    }
    return sm.get(fel, "mid")


def infer_work_mode(norm: dict[str, str]) -> str:
    ra = norm.get("remote_allowed") or ""
    try:
        raf = float(ra) if ra not in ("", "nan") else 0.0
    except ValueError:
        raf = 0.0
    if raf == 1.0:
        return "remote"
    fw = (norm.get("formatted_work_type") or "").lower()
    if "hybrid" in fw:
        return "hybrid"
    wm = (norm.get("work_mode") or norm.get("workplace_type") or "").lower()
    if "remote" in wm:
        return "remote"
    if "hybrid" in wm:
        return "hybrid"
    return "onsite"


def row_linkedin_2023(norm: dict[str, str], skills_map: dict[str, list[str]]) -> dict[str, Any] | None:
    job_id = norm.get("job_id") or ""
    title_raw = (norm.get("title") or "").strip()
    if not title_raw:
        return None
    title = (title_raw[:200] + f" [{job_id}]")[:255]

    desc = (norm.get("description") or "").strip() or None
    if desc and len(desc) > 60000:
        desc = desc[:60000]

    work_mode = infer_work_mode(norm)
    employment_type = map_employment(norm.get("work_type") or "")
    seniority_level = map_seniority(norm.get("formatted_experience_level") or "")
    location = (norm.get("location") or norm.get("job_location") or "").strip() or None

    skills = skills_map.get(str(job_id), [])
    if not skills:
        sd = norm.get("skills_desc") or ""
        if sd:
            skills = [s.strip() for s in re.split(r"[,;|]", sd) if s.strip()][:30]

    return {
        "title": title,
        "description": desc,
        "work_mode": work_mode,
        "employment_type": employment_type,
        "seniority_level": seniority_level,
        "location": location,
        "skills_required": skills or None,
        "salary_min": safe_float(norm.get("min_salary")),
        "salary_max": safe_float(norm.get("max_salary")),
        "_source_job_id": job_id,
        "_company_name": pick_company_name(norm),
    }


def row_generic(norm: dict[str, str]) -> dict[str, Any] | None:
    job_id = norm.get("job_id") or norm.get("id") or ""
    title_raw = (
        norm.get("title")
        or norm.get("job_title")
        or norm.get("position")
        or norm.get("role")
        or ""
    ).strip()
    if not title_raw:
        return None

    suffix = f" [{job_id}]" if job_id else ""
    title = (title_raw[: max(0, 255 - len(suffix))] + suffix)[:255]

    desc = (
        norm.get("description")
        or norm.get("job_description")
        or norm.get("summary")
        or ""
    ).strip() or None
    if desc and len(desc) > 60000:
        desc = desc[:60000]

    location = (
        norm.get("location")
        or norm.get("job_location")
        or norm.get("city")
        or ""
    ).strip() or None

    smin = safe_float(norm.get("min_salary") or norm.get("salary_min"))
    smax = safe_float(norm.get("max_salary") or norm.get("salary_max"))

    skills_raw = norm.get("skills") or norm.get("skills_required") or norm.get("skill") or ""
    skills = [s.strip() for s in re.split(r"[,;|]", skills_raw) if s.strip()][:30] if skills_raw else None

    work_mode = infer_work_mode(norm)
    employment_type = map_employment(norm.get("work_type") or norm.get("employment_type") or "FULL_TIME")
    seniority_level = map_seniority(norm.get("formatted_experience_level") or norm.get("seniority_level") or "")

    return {
        "title": title,
        "description": desc,
        "work_mode": work_mode,
        "employment_type": employment_type,
        "seniority_level": seniority_level,
        "location": location,
        "skills_required": skills,
        "salary_min": smin,
        "salary_max": smax,
        "_source_job_id": job_id,
        "_company_name": pick_company_name(norm),
    }


def login_recruiter(client: httpx.Client, email: str) -> tuple[int, str]:
    login = post(client, "auth", "/auth/login", {"email": email, "password": SEED_USER_PASSWORD})
    return int(login["user_id"]), str(login["token"])


def recruiter_company(client: httpx.Client, recruiter_id: int, token: str) -> int:
    data = post(client, "recruiter", "/recruiters/get", {"recruiter_id": recruiter_id}, token=token)
    return int(data["company_id"])


def collect_existing_kaggle_titles(client: httpx.Client, pairs: list[tuple[int, str]]) -> set[str]:
    titles: set[str] = set()
    for rid, tok in pairs:
        for j in fetch_all_jobs_by_recruiter(client, rid, tok):
            t = (j.get("title") or "").strip()
            if t:
                titles.add(t)
    return titles


def default_jobs_csv() -> Path:
    base = Path(__file__).resolve().parent.parent / "data" / "kaggle" / "downloads"
    for name in ("job_postings.csv", "linkedin_jobs.csv", "jobs.csv"):
        p = base / name
        if p.is_file():
            return p
    return base / "job_postings.csv"


def load_job_rows(csv_path: Path, offset: int, limit: int | None) -> list[tuple[int, dict[str, str]]]:
    rows: list[tuple[int, dict[str, str]]] = []
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for line_no, row in enumerate(reader, start=1):
            if line_no <= offset:
                continue
            rows.append((line_no, row))
            if limit is not None and len(rows) >= limit:
                break
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed jobs from Kaggle LinkedIn-style CSV (DATA236 §9.1)")
    parser.add_argument("--csv", type=Path, default=None, help="job_postings.csv or compatible export")
    parser.add_argument("--skills-csv", type=Path, default=None, help="job_skills.csv (LinkedIn 2023)")
    parser.add_argument("--limit", type=int, default=500, metavar="N", help="Max rows (default 500; use 0 for all)")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N CSV data rows")
    parser.add_argument(
        "--recruiter",
        choices=("alternate", "dana", "eli"),
        default="alternate",
        help="Which recruiter owns imported jobs (ignored when --per-company-recruiters)",
    )
    parser.add_argument(
        "--per-company-recruiters",
        action="store_true",
        help="Create one recruiter user + company per distinct employer name in CSV; jobs attach to that company (joykimaiyo-style).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    csv_path = (args.csv or default_jobs_csv()).resolve()
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    skills_path = args.skills_csv.resolve() if args.skills_csv else csv_path.parent / "job_skills.csv"
    skills_map = load_skills_by_job(skills_path)

    limit = None if args.limit == 0 else args.limit
    rows = load_job_rows(csv_path, args.offset, limit)
    if not rows:
        print("No rows (check offset/limit).")
        sys.exit(0)

    sample_norm = normalize_row(rows[0][1])
    use_li2023 = detect_linkedin_job_2023(set(sample_norm.keys()))
    fmt = "linkedin-job-2023" if use_li2023 else "generic"
    print(
        json.dumps(
            {
                "csv": str(csv_path),
                "skills_csv": str(skills_path) if skills_path.is_file() else None,
                "detected_format": fmt,
                "rows": len(rows),
                "per_company_recruiters": args.per_company_recruiters,
            },
            indent=2,
        )
    )

    if args.dry_run:
        for line_no, row in rows[:5]:
            norm = normalize_row(row)
            body = row_linkedin_2023(norm, skills_map) if use_li2023 else row_generic(norm)
            print(f"line {line_no} →", json.dumps(body, indent=2)[:800] if body else "skip")
        if args.per_company_recruiters:
            seen: set[str] = set()
            order: list[str] = []
            for line_no, row in rows:
                norm = normalize_row(row)
                m = row_linkedin_2023(norm, skills_map) if use_li2023 else row_generic(norm)
                if not m:
                    continue
                c = (m.get("_company_name") or "").strip()
                if not c:
                    continue
                k = c.lower()
                if k not in seen:
                    seen.add(k)
                    order.append(c)
            print(f"--per-company-recruiters: {len(order)} distinct employers in this batch (showing up to 15)")
            print(f"  password (all): {SEED_USER_PASSWORD!r}")
            dry_claims: dict[str, str] = {}
            dry_names: set[str] = set()
            for c in order[:15]:
                login = company_seed_email(c, dry_claims)
                rname = synthetic_recruiter_name(dry_names)
                print(f"  company → {c[:100]!r} ; login → {login!r} ; recruiter name → {rname!r}")
        print("Dry run OK.")
        return

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)
        section("Kaggle jobs → Job Service")

        company_cache: dict[str, tuple[int, str, int, str, str]] = {}
        email_claims: dict[str, str] = {}
        used_recruiter_names: set[str] = set()
        profile_synced_keys: set[str] = set()
        existing: set[str] = set()

        if args.per_company_recruiters:
            company_order: list[tuple[str, str | None, str | None]] = []
            seen_co: set[str] = set()
            for line_no, row in rows:
                norm = normalize_row(row)
                mapped = row_linkedin_2023(norm, skills_map) if use_li2023 else row_generic(norm)
                if not mapped:
                    continue
                display = (mapped.get("_company_name") or "").strip()
                if not display:
                    continue
                key = display.lower()
                if key not in seen_co:
                    seen_co.add(key)
                    company_order.append(
                        (display, pick_company_industry(norm), pick_company_hq(norm)),
                    )

            section(f"Per-company recruiters ({len(company_order)} employers)")
            print(f"  Password for every imported recruiter account: {SEED_USER_PASSWORD!r}")
            for display, ind, hq in company_order:
                _uid, _tok, _cid, em, rname = ensure_company_recruiter(
                    client,
                    display,
                    ind,
                    hq,
                    company_cache,
                    email_claims,
                    used_recruiter_names,
                    profile_synced_keys,
                )
                ok("employer", {"company": display[:80], "login": em, "recruiter": rname})

            for rid, tok, _cid, _em, _rn in company_cache.values():
                for j in fetch_all_jobs_by_recruiter(client, rid, tok):
                    t = (j.get("title") or "").strip()
                    if t:
                        existing.add(t)

            dana_id = eli_id = 0
            dana_tok = eli_tok = ""
            company_id = 0
        else:
            dana_id, dana_tok = login_recruiter(client, DANA_EMAIL)
            eli_id, eli_tok = login_recruiter(client, ELI_EMAIL)
            company_id = recruiter_company(client, dana_id, dana_tok)
            existing = collect_existing_kaggle_titles(client, [(dana_id, dana_tok), (eli_id, eli_tok)])

        created = 0
        skipped = 0
        for i, (line_no, row) in enumerate(rows):
            norm = normalize_row(row)
            mapped = row_linkedin_2023(norm, skills_map) if use_li2023 else row_generic(norm)
            if not mapped:
                print(f"  skip line {line_no}: empty title")
                skipped += 1
                continue

            company_name = (mapped.pop("_company_name", None) or "").strip()
            title = mapped.pop("title")
            if title in existing:
                skipped += 1
                continue

            if args.per_company_recruiters:
                if not company_name:
                    print(f"  skip line {line_no}: no company column (need employer name for --per-company-recruiters)")
                    skipped += 1
                    continue
                rid, rtok, cid, _, _ = ensure_company_recruiter(
                    client,
                    company_name,
                    pick_company_industry(norm),
                    pick_company_hq(norm),
                    company_cache,
                    email_claims,
                    used_recruiter_names,
                    profile_synced_keys,
                )
            elif args.recruiter == "dana":
                rid, rtok, cid = dana_id, dana_tok, company_id
            elif args.recruiter == "eli":
                rid, rtok, cid = eli_id, eli_tok, company_id
            else:
                rid, rtok = (dana_id, dana_tok) if i % 2 == 0 else (eli_id, eli_tok)
                cid = company_id

            benefit_company = company_name if company_name else "Acme Corporation"
            body = {
                "company_id": cid,
                "recruiter_id": rid,
                "title": title,
                "description": mapped.get("description"),
                "work_mode": mapped["work_mode"],
                "employment_type": mapped["employment_type"],
                "seniority_level": mapped["seniority_level"],
                "location": mapped.get("location"),
                "skills_required": mapped.get("skills_required"),
                "benefits": job_benefits.benefits_for_company(benefit_company),
                "salary_min": mapped.get("salary_min"),
                "salary_max": mapped.get("salary_max"),
            }

            result = post(client, "job", "/jobs/create", body, token=rtok)
            jid = result.get("job_id") if isinstance(result, dict) else None
            existing.add(title)
            created += 1
            ok(
                f"line {line_no}",
                {"job_id": jid, "title": title[:80], "recruiter_id": rid, "company": company_name[:60] if company_name else None},
            )

        section("Done")
        print(json.dumps({"created": created, "skipped_existing_or_bad": skipped}, indent=2))
        if args.per_company_recruiters:
            print(f"  Recruiter password for all new accounts: {SEED_USER_PASSWORD!r}")


if __name__ == "__main__":
    main()
