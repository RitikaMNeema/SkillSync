#!/usr/bin/env python3
"""
Load AI demo JSON from data/seeds/ into running SkillSync services (same API flow as scripts/seed.py).

Registers members + recruiters with SEED_USER_PASSWORD (SkillSync1!), then:
  POST /recruiters/create, POST /jobs/create, POST /members/create,
  POST /members/uploadResumeFile (PDF from ``resume_plaintext`` when fpdf2 is installed),
  POST /members/uploadResume (``resume_url`` from JSON), POST /applications/submit

Prerequisites:
  - Docker / local stack up (health checks on ports in seed.BASE)
  - JSON produced by data/transform_ai_match_demo.py (or compatible files in --seeds-dir)

Usage (from backend/):
    pip install httpx fpdf2
    python3 scripts/ingest_ai_demo_seeds.py

Optional:
    python3 scripts/ingest_ai_demo_seeds.py --seeds-dir /path/to/seeds
"""

from __future__ import annotations

import argparse
import json
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
import kaggle_resume_seed as kaggle_pdf  # noqa: E402  # synthesize_resume_pdf_bytes
import recruiter_profile_defaults as recruiter_defaults  # noqa: E402
import seed as seed  # noqa: E402


def _parse_salary_range(s: str | None) -> tuple[float, float]:
    if not s or not str(s).strip():
        return 90_000.0, 130_000.0
    raw = str(s)
    nums = [int(x) for x in re.findall(r"\d+", raw.replace(",", ""))]
    if not nums:
        return 90_000.0, 130_000.0
    scaled: list[float] = []
    for n in nums:
        if n < 300:
            scaled.append(float(n * 1000))
        else:
            scaled.append(float(n))
    if len(scaled) == 1:
        return scaled[0] * 0.85, scaled[0] * 1.15
    return float(min(scaled)), float(max(scaled))


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


def _member_profile_body(m: dict[str, Any], user_id: int) -> dict[str, Any]:
    exp = m.get("skillsync_experience") or m.get("experience") or []
    edu = m.get("skillsync_education") or m.get("education") or []
    return {
        "member_id": user_id,
        "first_name": m["first_name"],
        "last_name": m["last_name"],
        "headline": m["headline"],
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


def _write_credentials(path: Path, password: str, members: list[dict], recruiters: list[dict]) -> None:
    lines = [
        "SkillSync AI demo — credentials after ingest",
        "",
        f"Password for every account listed below: {password}",
        "",
        "Job seekers (log in as member to browse and apply):",
    ]
    for m in members:
        lines.append(f"  {m.get('email')}")
    lines.append("")
    lines.append("Recruiters (log in as recruiter to post jobs and review applicants):")
    for r in recruiters:
        lines.append(f"  {r.get('email')}")
    lines.append("")
    lines.append("Emails match the JSON in data/seeds/ai_demo_*.json from your last generator run.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest ai_demo_*.json seeds via SkillSync HTTP APIs.")
    ap.add_argument(
        "--seeds-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "seeds",
        help="Directory containing ai_demo_*.json (default: <repo>/data/seeds)",
    )
    ap.add_argument(
        "--no-resume-file-upload",
        action="store_true",
        help="Skip POST /members/uploadResumeFile (no GridFS PDF from resume_plaintext)",
    )
    args = ap.parse_args()
    seeds_dir: Path = args.seeds_dir.resolve()

    paths = {
        "recruiters": seeds_dir / "ai_demo_recruiters.json",
        "jobs": seeds_dir / "ai_demo_jobs.json",
        "members": seeds_dir / "ai_demo_members.json",
        "applications": seeds_dir / "ai_demo_applications.json",
    }
    for label, p in paths.items():
        if not p.is_file():
            print(f"{seed.RED}✗ Missing {label} file: {p}{seed.RESET}")
            sys.exit(1)

    recruiters_in = _load_json(paths["recruiters"])
    jobs_in = _load_json(paths["jobs"])
    members_in = _load_json(paths["members"])
    applications_in = _load_json(paths["applications"])

    password = seed.SEED_USER_PASSWORD
    creds_out = seeds_dir / "AI_DEMO_CREDENTIALS.txt"

    with httpx.Client(timeout=120) as client:
        seed.wait_for_services(client)

        seed.section("AI demo / 1 — Recruiters (register + POST /recruiters/create)")
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

        seed.section("AI demo / 2 — Jobs (POST /jobs/create, idempotent by title + recruiter)")
        job_uuid_to_int: dict[str, int] = {}
        jobs_cache: dict[int, list] = {}

        def jobs_for(recruiter_user_id: int, tok: str) -> list:
            if recruiter_user_id not in jobs_cache:
                jobs_cache[recruiter_user_id] = seed.fetch_all_jobs_by_recruiter(client, recruiter_user_id, tok)
            return jobs_cache[recruiter_user_id]

        for job in jobs_in:
            rkey = str(job["recruiter_id"])
            if rkey not in rec_state:
                print(f"  {seed.RED}✗ Job references unknown recruiter_id {rkey}{seed.RESET}")
                sys.exit(1)
            st = rec_state[rkey]
            rid = st["user_id"]
            tok = st["token"]
            cid = st["company_id"]
            title = (job.get("title") or "").strip()
            jlist = jobs_for(rid, tok)
            found = seed.find_job_id(jlist, rid, title)
            if found:
                job_uuid_to_int[str(job["job_id"])] = int(found)
                seed.ok(f"Reuse job {title!r}", {"job_id": found})
                continue
            wm = (job.get("work_mode") or "remote").strip().lower()
            if wm not in ("remote", "hybrid", "onsite"):
                wm = "remote"
            smin, smax = _parse_salary_range(job.get("salary_range"))
            jd = {
                "title": title,
                "description": job.get("description") or "",
                "work_mode": wm,
                "employment_type": (job.get("employment_type") or "full-time").strip(),
                "seniority_level": (job.get("seniority_level") or "mid").strip(),
                "location": (job.get("location") or "").strip() or None,
                "skills_required": job.get("skills_required") or [],
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

        seed.section("AI demo / 3 — Members (register + POST /members/create + résumé PDF)")
        member_uuid_to_login: dict[str, dict[str, Any]] = {}
        for m in members_in:
            uid, tok = _register_or_login(client, m["email"], password, "member")
            body = _member_profile_body(m, uid)
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
                blob = (m.get("resume_plaintext") or "").strip()
                if len(blob) >= 40:
                    try:
                        pdf_bytes = kaggle_pdf.synthesize_resume_pdf_bytes(blob, row_id=f"ai_demo_{uid}")
                        fname = f"ai_demo_{uid}.pdf"
                        _upload_resume_file_bytes(client, uid, tok, fname, pdf_bytes, "application/pdf")
                        upload_meta["resume_file"] = "pdf-generated"
                    except RuntimeError as exc:
                        print(f"  {seed.YELLOW}⚠ {m['email']}: no résumé file ({exc}){seed.RESET}")
                else:
                    print(f"  {seed.YELLOW}⚠ {m['email']}: resume_plaintext too short — skip file upload{seed.RESET}")
            resume_url = (m.get("resume_url") or "").strip()
            if resume_url:
                seed.post(
                    client,
                    "profile",
                    "/members/uploadResume",
                    {"member_id": uid, "resume_url": resume_url},
                    token=tok,
                )
                upload_meta["resume_url"] = resume_url
            seed.ok(f"Member {m['email']}", {"user_id": uid, **upload_meta})
            member_uuid_to_login[str(m["member_id"])] = {"user_id": uid, "token": tok, "email": m["email"], "row": m}

        seed.section("AI demo / 4 — Applications (POST /applications/submit)")
        for app in applications_in:
            juid = str(app["job_id"])
            muid = str(app["member_id"])
            if juid not in job_uuid_to_int:
                print(f"  {seed.YELLOW}⚠ Skip application — unknown job_id {juid}{seed.RESET}")
                continue
            if muid not in member_uuid_to_login:
                print(f"  {seed.YELLOW}⚠ Skip application — unknown member_id {muid}{seed.RESET}")
                continue
            mid = member_uuid_to_login[muid]
            jid = job_uuid_to_int[juid]
            resume_url = app.get("resume_url") or mid["row"].get("resume_url")
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
                if (app.get("status") or "").strip().lower() == "reviewing":
                    rkey = None
                    for job in jobs_in:
                        if str(job["job_id"]) == juid:
                            rkey = str(job["recruiter_id"])
                            break
                    if rkey and rkey in rec_state:
                        seed.post(
                            client,
                            "application",
                            "/applications/updateStatus",
                            {
                                "application_id": res["application_id"],
                                "new_status": "reviewing",
                            },
                            token=rec_state[rkey]["token"],
                            ignore=[400],
                        )
            else:
                seed.ok("Application already exists (skipped)", {"job_id": jid, "member_id": mid["user_id"]})

    _write_credentials(creds_out, password, members_in, recruiters_in)
    seed.section("Done")
    print(f"  Credentials written to {creds_out}")
    print(f"  Password: {password}")
    if not args.no_resume_file_upload:
        print("  Résumé files: PDF from each row's resume_plaintext (needs fpdf2); use --no-resume-file-upload to skip.")


if __name__ == "__main__":
    main()
