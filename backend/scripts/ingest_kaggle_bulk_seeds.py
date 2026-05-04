#!/usr/bin/env python3
"""
Load bulk JSON from data/seeds/kaggle_bulk/ (produced by data/transform_kaggle_bulk.py)
into running SkillSync services via the same HTTP API flow as ingest_ai_demo_seeds.py.

Does not write MySQL/Mongo directly — mirrors the clone's transform + seed_loader intent
using microservice endpoints.

Prerequisites:
  - Stack up (seed.BASE health checks)
  - Run: python3 data/transform_kaggle_bulk.py  (from repo root, with pandas + faker)

Usage (from backend/):
    pip install httpx fpdf2
    python3 scripts/ingest_kaggle_bulk_seeds.py

Optional:
    python3 scripts/ingest_kaggle_bulk_seeds.py --seeds-dir /path/to/kaggle_bulk
    python3 scripts/ingest_kaggle_bulk_seeds.py --limit-members 50 --limit-jobs 100
    python3 scripts/ingest_kaggle_bulk_seeds.py --no-resume-file-upload
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path
from typing import Any

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parents[1]
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import company_job_benefits as job_benefits  # noqa: E402
import kaggle_resume_seed as kaggle_pdf  # noqa: E402
import recruiter_profile_defaults as recruiter_defaults  # noqa: E402
import seed as seed  # noqa: E402


def _load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _register_or_login(client: httpx.Client, email: str, password: str, role: str) -> tuple[int, str]:
    r = client.post(
        f"{seed.BASE['auth']}/auth/register",
        json={"email": email, "password": password, "role": role},
        timeout=60,
    )
    if r.status_code not in (200, 201, 409):
        print(f"  {seed.RED}✗ /auth/register {email!r} → {r.status_code}: {r.text}{seed.RESET}")
        sys.exit(1)
    login = seed.post(client, "auth", "/auth/login", {"email": email, "password": password})
    return int(login["user_id"]), str(login["token"])


def _split_name(full: str) -> tuple[str, str]:
    parts = (full or "").strip().split(None, 1)
    if not parts:
        return "Demo", "Recruiter"
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def _display_recruiter_role(raw: str | None) -> str:
    if not raw or str(raw).strip().lower() == "recruiter":
        return "Technical Recruiter"
    return str(raw).strip()


def _ensure_recruiter(
    client: httpx.Client,
    rec: dict[str, Any],
    user_id: int,
    token: str,
) -> tuple[int, dict[str, Any]]:
    fn, ln = _split_name(rec.get("name") or "")
    enrich = recruiter_defaults.recruiter_profile_enrichment(
        (rec.get("company_name") or "Demo Company").strip(),
        industry=(rec.get("company_industry") or "").strip() or None,
        hq=None,
        role_label=_display_recruiter_role(rec.get("role")),
        experience_job_title=_display_recruiter_role(rec.get("role")),
    )
    body: dict[str, Any] = {
        "recruiter_id": user_id,
        "name": rec.get("name") or f"{fn} {ln}".strip(),
        "email": rec["email"],
        "phone": rec.get("phone"),
        "role": _display_recruiter_role(rec.get("role")),
        "access_level": (rec.get("access_level") or "recruiter").strip(),
        "first_name": fn,
        "last_name": ln or fn,
        **enrich,
        "company": {
            "name": (rec.get("company_name") or "Demo Company").strip(),
            "industry": (rec.get("company_industry") or "Technology").strip() or None,
            "size": (rec.get("company_size") or "201-500").strip() or None,
        },
    }
    data = seed.post(
        client,
        "recruiter",
        "/recruiters/create",
        body,
        token=token,
        ignore=[409, 400],
        benign_async_fail=seed.BENIGN_DUP_MARKERS,
    )
    if data and data.get("company_id") is not None:
        return int(data["company_id"]), data
    row = seed.post(client, "recruiter", "/recruiters/get", {"recruiter_id": user_id}, token=token)
    return int(row["company_id"]), row


def _iso_to_year_month(iso: str | None) -> str | None:
    if not iso:
        return None
    s = str(iso).strip()[:10]
    m = re.match(r"^(\d{4})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return None


def _employment_api(raw: str | None) -> str:
    s = (raw or "full_time").strip().lower().replace("-", "_")
    if s in ("full_time", "fulltime"):
        return "full-time"
    if s in ("part_time", "parttime"):
        return "part-time"
    if s == "contract":
        return "contract"
    return "full-time"


def _index_by_member_id(rows: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for row in rows:
        mid = str(row.get("member_id") or "")
        if not mid:
            continue
        out.setdefault(mid, []).append(row)
    return out


def _build_member_row(
    m: dict[str, Any],
    exp_by_mid: dict[str, list[dict]],
    edu_by_mid: dict[str, list[dict]],
    skills_by_mid: dict[str, list[dict]],
) -> dict[str, Any]:
    mid = str(m["member_id"])
    skills = [r["skill"] for r in skills_by_mid.get(mid, []) if r.get("skill")]
    experience: list[dict[str, Any]] = []
    for e in exp_by_mid.get(mid, []):
        experience.append(
            {
                "title": (e.get("title") or "Role")[:255],
                "company": (e.get("company") or "Company")[:255],
                "start": _iso_to_year_month(e.get("start_date")) or "2018-01",
                "end": _iso_to_year_month(e.get("end_date")),
            }
        )
    education: list[dict[str, Any]] = []
    for ed in edu_by_mid.get(mid, []):
        deg = str(ed.get("degree") or "BS")
        field = str(ed.get("field") or "")
        school = (ed.get("institution") or "School")[:255]
        year = int(ed["end_year"]) if ed.get("end_year") is not None else 2020
        education.append(
            {
                "school": school,
                "degree": f"{deg} {field}".strip()[:255],
                "year": year,
            }
        )
    return {
        **m,
        "skills": skills[:50],
        "skillsync_experience": experience,
        "skillsync_education": education,
        "resume_url": m.get("resume_url") or f"https://example.com/bulk-seed/resume/{mid}",
    }


def _member_profile_body(m: dict[str, Any], user_id: int) -> dict[str, Any]:
    exp = m.get("skillsync_experience") or m.get("experience") or []
    edu = m.get("skillsync_education") or m.get("education") or []
    hl = (m.get("headline") or "Professional")[:220]
    return {
        "member_id": user_id,
        "first_name": m["first_name"],
        "last_name": m["last_name"],
        "headline": hl,
        "location_city": m.get("location_city"),
        "location_state": m.get("location_state"),
        "location_country": m.get("location_country") or "US",
        "summary": m.get("summary"),
        "about": m.get("about"),
        "skills": m.get("skills") or [],
        "experience": exp,
        "education": edu,
        "resume_url": m.get("resume_url"),
        "open_to": m.get("open_to"),
        "profile_status": m.get("profile_status"),
        "phone": m.get("phone"),
    }


def _upload_resume_file_bytes(
    client: httpx.Client,
    member_id: int,
    token: str,
    filename: str,
    body: bytes,
    content_type: str,
) -> None:
    url = f"{seed.BASE['profile']}/members/uploadResumeFile"
    files = {"resume": (filename, body, content_type)}
    data = {"member_id": str(member_id)}
    r = client.post(url, files=files, data=data, headers={"Authorization": f"Bearer {token}"}, timeout=180)
    if r.status_code != 200:
        print(f"  {seed.RED}✗ uploadResumeFile → {r.status_code}: {r.text}{seed.RESET}")
        sys.exit(1)


def _write_credentials(path: Path, password: str, members: list[dict], recruiters: list[dict]) -> None:
    lines = [
        "SkillSync kaggle_bulk — credentials after ingest",
        "",
        f"Password for every account listed below: {password}",
        "",
        "Members:",
    ]
    for m in members:
        lines.append(f"  {m.get('email')}")
    lines.append("")
    lines.append("Recruiters:")
    for r in recruiters:
        lines.append(f"  {r.get('email')}")
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest kaggle_bulk JSON seeds via SkillSync HTTP APIs.")
    ap.add_argument(
        "--seeds-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "seeds" / "kaggle_bulk",
        help="Directory with members.json, jobs.json, etc. (default: <repo>/data/seeds/kaggle_bulk)",
    )
    ap.add_argument("--limit-members", type=int, default=0, help="Process only first N members (0 = all)")
    ap.add_argument("--limit-recruiters", type=int, default=0, help="Process only first N recruiters (0 = all)")
    ap.add_argument("--limit-jobs", type=int, default=0, help="Process only first N jobs (0 = all)")
    ap.add_argument("--limit-applications", type=int, default=0, help="Process only first N applications (0 = all)")
    ap.add_argument(
        "--no-resume-file-upload",
        action="store_true",
        help="Skip POST /members/uploadResumeFile (PDF from summary text)",
    )
    args = ap.parse_args()
    seeds_dir: Path = args.seeds_dir.resolve()

    required = ["recruiters.json", "jobs.json", "members.json", "applications.json"]
    for name in required:
        if not (seeds_dir / name).is_file():
            print(f"{seed.RED}✗ Missing {seeds_dir / name}{seed.RESET}")
            sys.exit(1)

    recruiters_in: list[dict] = _load_json(seeds_dir / "recruiters.json")
    jobs_in: list[dict] = _load_json(seeds_dir / "jobs.json")
    members_in: list[dict] = _load_json(seeds_dir / "members.json")
    applications_in: list[dict] = _load_json(seeds_dir / "applications.json")

    exp_path = seeds_dir / "member_experience.json"
    edu_path = seeds_dir / "member_education.json"
    sk_path = seeds_dir / "member_skills.json"
    exp_rows: list[dict] = _load_json(exp_path) if exp_path.is_file() else []
    edu_rows: list[dict] = _load_json(edu_path) if edu_path.is_file() else []
    sk_rows: list[dict] = _load_json(sk_path) if sk_path.is_file() else []
    exp_by = _index_by_member_id(exp_rows)
    edu_by = _index_by_member_id(edu_rows)
    sk_by = _index_by_member_id(sk_rows)

    if args.limit_recruiters > 0:
        recruiters_in = recruiters_in[: args.limit_recruiters]
    if args.limit_members > 0:
        members_in = members_in[: args.limit_members]
    if args.limit_jobs > 0:
        jobs_in = jobs_in[: args.limit_jobs]
    if args.limit_applications > 0:
        applications_in = applications_in[: args.limit_applications]

    allowed_member_ids = {str(m["member_id"]) for m in members_in}
    allowed_recruiter_ids = {str(r["recruiter_id"]) for r in recruiters_in}
    jobs_in = [j for j in jobs_in if str(j.get("recruiter_id")) in allowed_recruiter_ids]
    applications_in = [
        a
        for a in applications_in
        if str(a.get("member_id")) in allowed_member_ids and str(a.get("job_id")) in {str(j["job_id"]) for j in jobs_in}
    ]

    password = seed.SEED_USER_PASSWORD
    creds_out = seeds_dir / "KAGGLE_BULK_CREDENTIALS.txt"

    with httpx.Client(timeout=120) as client:
        seed.wait_for_services(client)

        seed.section("Kaggle bulk / 1 — Recruiters")
        rec_state: dict[str, dict[str, Any]] = {}
        for rec in recruiters_in:
            uid, tok = _register_or_login(client, rec["email"], password, "recruiter")
            company_id, row = _ensure_recruiter(client, rec, uid, tok)
            cname = (rec.get("company_name") or "").strip() or "Demo Company"
            seed.ok(f"Recruiter {rec['email']}", {"user_id": uid, "company_id": company_id})
            rec_state[str(rec["recruiter_id"])] = {
                "user_id": uid,
                "token": tok,
                "company_id": company_id,
                "company_name": cname,
            }

        seed.section("Kaggle bulk / 2 — Jobs")
        job_uuid_to_int: dict[str, int] = {}
        jobs_cache: dict[int, list] = {}

        def jobs_for(recruiter_user_id: int, tok: str) -> list:
            if recruiter_user_id not in jobs_cache:
                jobs_cache[recruiter_user_id] = seed.fetch_all_jobs_by_recruiter(client, recruiter_user_id, tok)
            return jobs_cache[recruiter_user_id]

        for job in jobs_in:
            rkey = str(job["recruiter_id"])
            if rkey not in rec_state:
                continue
            st = rec_state[rkey]
            rid = st["user_id"]
            tok = st["token"]
            cid = st["company_id"]
            title = (job.get("title") or "Role").strip()[:255]
            jlist = jobs_for(rid, tok)
            found = seed.find_job_id(jlist, rid, title)
            if found:
                job_uuid_to_int[str(job["job_id"])] = int(found)
                seed.ok(f"Reuse job {title!r}", {"job_id": found})
                continue
            smin = float(job.get("salary_min") or 80_000)
            smax = float(job.get("salary_max") or max(smin + 10_000, 100_000))
            jd = {
                "title": title,
                "description": (job.get("description") or "")[:8000],
                "work_mode": random.choice(["remote", "hybrid", "onsite"]),
                "employment_type": _employment_api(job.get("employment_type")),
                "seniority_level": "mid",
                "location": (job.get("location") or "").strip() or None,
                "skills_required": [],
                "benefits": job_benefits.benefits_for_company(st["company_name"]),
                "salary_min": smin,
                "salary_max": smax,
                "company_id": cid,
                "recruiter_id": rid,
            }
            created = seed.post(client, "job", "/jobs/create", jd, token=tok)
            jid = int(created["job_id"])
            job_uuid_to_int[str(job["job_id"])] = jid
            jobs_cache.pop(rid, None)
            seed.ok(f"Created job {title!r}", {"job_id": jid})

        seed.section("Kaggle bulk / 3 — Members")
        member_uuid_to_login: dict[str, dict[str, Any]] = {}
        for m in members_in:
            merged = _build_member_row(m, exp_by, edu_by, sk_by)
            uid, tok = _register_or_login(client, merged["email"], password, "member")
            body = _member_profile_body(merged, uid)
            seed.post(
                client,
                "profile",
                "/members/create",
                body,
                token=tok,
                ignore=[409, 400],
                benign_async_fail=seed.BENIGN_DUP_MARKERS,
            )
            upload_meta: dict[str, Any] = {}
            if not args.no_resume_file_upload:
                blob = (merged.get("summary") or merged.get("about") or "").strip()
                if len(blob) >= 40:
                    try:
                        pdf_bytes = kaggle_pdf.synthesize_resume_pdf_bytes(blob, row_id=f"kaggle_bulk_{uid}")
                        fname = f"kaggle_bulk_{uid}.pdf"
                        _upload_resume_file_bytes(client, uid, tok, fname, pdf_bytes, "application/pdf")
                        upload_meta["resume_file"] = "pdf-generated"
                    except RuntimeError as exc:
                        print(f"  {seed.YELLOW}⚠ {merged['email']}: no résumé file ({exc}){seed.RESET}")
                else:
                    print(f"  {seed.YELLOW}⚠ {merged['email']}: summary too short — skip file upload{seed.RESET}")
            resume_url = (merged.get("resume_url") or "").strip()
            if resume_url:
                seed.post(
                    client,
                    "profile",
                    "/members/uploadResume",
                    {"member_id": uid, "resume_url": resume_url},
                    token=tok,
                )
                upload_meta["resume_url"] = resume_url
            seed.ok(f"Member {merged['email']}", {"user_id": uid, **upload_meta})
            member_uuid_to_login[str(merged["member_id"])] = {
                "user_id": uid,
                "token": tok,
                "email": merged["email"],
                "row": merged,
            }

        seed.section("Kaggle bulk / 4 — Applications")
        for app in applications_in:
            juid = str(app["job_id"])
            muid = str(app["member_id"])
            if juid not in job_uuid_to_int or muid not in member_uuid_to_login:
                continue
            mid = member_uuid_to_login[muid]
            jid = job_uuid_to_int[juid]
            resume_url = (app.get("resume_url") or mid["row"].get("resume_url") or "").strip()
            if not resume_url:
                resume_url = f"https://example.com/bulk-seed/application/{app.get('application_id', 'x')}"
            body = {
                "job_id": jid,
                "member_id": mid["user_id"],
                "resume_url": resume_url,
                "cover_letter": (app.get("cover_letter") or "").strip() or None,
                "answers": None,
            }
            res = seed.try_submit_application(client, body, mid["token"])
            if res:
                seed.ok("Submitted", {"application_id": res.get("application_id"), "job_id": jid})
            else:
                seed.ok("Application already exists (skipped)", {"job_id": jid, "member_id": mid["user_id"]})

    _write_credentials(creds_out, password, members_in, recruiters_in)
    seed.section("Done")
    print(f"  Credentials: {creds_out}")
    print(f"  Password: {password}")
    print("  connections/messages/events JSON are not ingested here (use seed.py patterns if needed).")


if __name__ == "__main__":
    main()
