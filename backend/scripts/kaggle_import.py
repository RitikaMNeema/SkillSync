#!/usr/bin/env python3
"""
Import CSVs that you downloaded **only** from the DATA236 §9 Kaggle listings (no local
generated CSVs, no third-party job/resume exports):

  Jobs (9.1): rajatraj0502/linkedin-job-2023, joykimaiyo18/linkedin-data-jobs-dataset
  Resumes (9.2): snehaanbhawal/resume-dataset, hassnainzaidi/resume-classification-dataset-for-nlp

**Project requirement alignment (Option 1)** — matches the class doc §9 + §4 split:
  - **Kaggle:** job postings CSV + resume/profile CSV only.
  - **Not from Kaggle:** recruiter accounts, company (Acme), and demo members — created by
    `scripts/seed.py`. Imported jobs attach to the seed recruiter’s `company_id`
    (default `dana@acme.com`). Resume rows update seed members Alice, Bob, Charlie in rotation.
    If a row includes **HTTPS PDF** columns (`resume_pdf_url`, `pdf_url`, `resume_file_url`, or
    `cv_pdf_url`), the importer downloads valid `%PDF` bytes and POSTs them to `uploadResumeFile`
    before patching profile text (optional — most §9.2 CSVs are text-only).
    Text-only rows **do not** remove an existing uploaded PDF (class doc §4.1: PDF **or** extracted
    text — both may coexist).
  - This script does **not** create recruiters from `companies.csv` or any other table.

Job and profile fields are taken from the CSV cells only (missing optional columns stay empty/null).
`work_mode` / inferred seniority use text present **in that same row** (not fabricated defaults).

Optional `--analytics` ingests **synthetic dashboard events** (not Kaggle data); keep it off unless
you explicitly want chart filler.

Prerequisite: services up + `python scripts/seed.py` once (dana@acme.com + members).

Usage:
    cd backend && pip install httpx
    python scripts/kaggle_import.py --jobs-csv /path/from/kaggle/jobs.csv --resumes-csv /path/from/kaggle/resumes.csv
    # Default --max-job-rows is large (~12k scans); dedupe is title+location so more distinct postings import than title-only.
    # If jobs and companies.csv live in the same folder (LinkedIn job-2023 layout), hiring org names are joined
    # automatically; otherwise pass --companies-csv explicitly. Descriptions get a leading ``[employer:Name]`` line
    # for the job seeker UI while ``company_id`` remains the seed org (Option 1).
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import re
import sys
from datetime import timedelta
from pathlib import Path
from typing import Any

import httpx

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _load_seed():
    path = _BACKEND_ROOT / "scripts" / "seed.py"
    spec = importlib.util.spec_from_file_location("skillsync_seed", path)
    if spec is None or spec.loader is None:
        print(f"Cannot load {path}", file=sys.stderr)
        sys.exit(1)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


seed = _load_seed()

BASE = seed.BASE
post = seed.post
ingest = seed.ingest
wait_for_services = seed.wait_for_services
utc_month_window = seed.utc_month_window
SEED_USER_PASSWORD = seed.SEED_USER_PASSWORD
fetch_all_jobs_by_recruiter = seed.fetch_all_jobs_by_recruiter
find_job_id_title_location = seed.find_job_id_title_location
GREEN, YELLOW, RED, BOLD, RESET = seed.GREEN, seed.YELLOW, seed.RED, seed.BOLD, seed.RESET


def ok(label: str, data=None):
    print(f"  {GREEN}✓{RESET} {label}", f"→ {json.dumps(data)}" if data else "")


def norm_key(k: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", k.strip().lower()).strip("_")


def row_normalized(row: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in row.items():
        if k is None:
            continue
        nk = norm_key(str(k))
        if v is None:
            continue
        s = str(v).strip()
        if s:
            out[nk] = s
    return out


def pick(rn: dict[str, str], *aliases: str) -> str | None:
    for a in aliases:
        if a in rn and rn[a]:
            return rn[a]
    return None


def canonical_company_id(raw: str | None) -> str | None:
    """Normalize CSV company ids like 77766802.0 → 77766802 for joins."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        return str(int(float(s)))
    except ValueError:
        return s


def sanitize_employer_tag_name(name: str) -> str:
    """Tag format is [employer:NAME] — NAME must not contain ]."""
    s = re.sub(r"\]+", "", (name or "").strip())
    return s[:500] if s else ""


def load_company_id_names(companies_csv: Path) -> dict[str, str]:
    """Build company_id → display name from Kaggle companies.csv (same folder as job_postings often)."""
    out: dict[str, str] = {}
    with companies_csv.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rn = row_normalized(row)
            cid = canonical_company_id(pick(rn, "company_id", "id", "companyid"))
            if not cid:
                continue
            nm = pick(rn, "name", "company_name", "company", "title")
            if nm:
                out[cid] = nm.strip()
    return out


def resolve_companies_csv_path(jobs_csv: Path | None, explicit: Path | None) -> Path | None:
    if explicit is not None:
        p = explicit.expanduser().resolve()
        return p if p.is_file() else None
    if jobs_csv is None:
        return None
    parent = jobs_csv.expanduser().resolve().parent
    for name in ("companies.csv", "company.csv"):
        c = parent / name
        if c.is_file():
            return c
    return None


def employer_display_name_for_job_row(
    rn: dict[str, str], company_id_to_name: dict[str, str] | None
) -> str | None:
    cid = canonical_company_id(pick(rn, "company_id", "companyid", "comp_id", "employer_company_id"))
    if cid and company_id_to_name is not None:
        hit = company_id_to_name.get(cid)
        if hit:
            return hit
    return pick(rn, "company", "company_name", "employer", "organization")


def parse_skills_blob(blob: str | None) -> list[str] | None:
    if not blob:
        return None
    parts = re.split(r"[,;|]", blob)
    skills = [p.strip() for p in parts if p.strip()]
    return skills[:40] if skills else None


def infer_work_mode(rn: dict[str, str], title: str, description: str) -> str:
    ra = pick(rn, "remote_allowed")
    if ra and ra.strip().lower() in ("1", "true", "yes", "y"):
        return "remote"
    desc = (description or "")[:500]
    blob = " ".join(
        filter(
            None,
            [
                pick(rn, "work_mode", "workplace_type", "work_type", "formatted_work_type", "remote"),
                pick(rn, "job_type", "employment_type"),
                title,
                desc,
            ],
        )
    ).lower()
    if "hybrid" in blob:
        return "hybrid"
    if "remote" in blob or "work from home" in blob or "wfh" in blob:
        return "remote"
    return "onsite"


def infer_seniority(title: str) -> str:
    tl = title.lower()
    if any(x in tl for x in ("senior", " sr ", "sr.", "lead", "principal", "staff")):
        return "senior"
    if any(x in tl for x in ("junior", " jr ", "jr.", "entry", "intern")):
        return "junior"
    return "mid"


def normalize_employment_type(raw: str | None) -> str | None:
    """Map LinkedIn/Kaggle CSV tokens to values used by job search filters (see JobFilters)."""
    if not raw:
        return None
    u = raw.strip().upper().replace(" ", "_").replace("-", "_")
    if u == "FULL_TIME":
        return "full-time"
    if u == "PART_TIME":
        return "part-time"
    if u == "CONTRACT":
        return "contract"
    if u == "TEMPORARY":
        return "temporary"
    if u == "INTERNSHIP":
        return "internship"
    if u == "VOLUNTEER":
        return "volunteer"
    s = raw.strip().lower()
    if s in ("full-time", "full time", "fulltime"):
        return "full-time"
    if s in ("part-time", "part time", "parttime"):
        return "part-time"
    return raw[:64]


def normalize_seniority_level(raw: str | None, title: str) -> str:
    """Map LinkedIn experience strings + title to values used by JobFilters / search."""
    if raw:
        v = raw.lower()
        if "intern" in v:
            return "internship"
        if "entry" in v and "mid" not in v:
            return "entry"
        if "director" in v:
            return "director"
        if any(x in v for x in ("executive", "vice president", "vp,", " vp", "chief ", " cfo", " cto")):
            return "executive"
        if "principal" in v or v.startswith("staff ") or " staff" in v:
            return "lead"
        if "mid-senior" in v or "senior" in v or "sr." in v:
            return "senior"
        if "mid" in v:
            return "mid"
        if "associate" in v and "senior" not in v:
            return "entry"
    tl = title.lower()
    if any(x in tl for x in ("vice president", " chief", " cto", " cfo", "general counsel")):
        return "executive"
    if "director" in tl:
        return "director"
    if any(x in tl for x in ("lead ", " principal", "staff engineer")):
        return "lead"
    if any(x in tl for x in ("senior", " sr ", "sr.")):
        return "senior"
    if any(x in tl for x in ("junior", " jr ", "jr.", "intern", "entry level")):
        return "entry"
    inf = infer_seniority(title)
    return {"senior": "senior", "mid": "mid", "junior": "entry"}.get(inf, "mid")


def parse_salary(rn: dict[str, str]) -> tuple[float | None, float | None]:
    # LinkedIn Job 2023 (rajatraj0502): min_salary, max_salary, med_salary
    smin = pick(rn, "salary_min", "minsalary", "min_salary", "min_salary_usd")
    smax = pick(rn, "salary_max", "maxsalary", "max_salary", "max_salary_usd")
    smed = pick(rn, "med_salary", "median_salary")
    lo = hi = None
    if smin:
        try:
            lo = float(re.sub(r"[^\d.]", "", smin[:32]))
        except ValueError:
            pass
    if smax:
        try:
            hi = float(re.sub(r"[^\d.]", "", smax[:32]))
        except ValueError:
            pass
    if smed:
        try:
            med = float(re.sub(r"[^\d.]", "", smed[:32]))
            lo = lo if lo is not None else med
            hi = hi if hi is not None else med
        except ValueError:
            pass
    sr = pick(rn, "salary", "salary_range", "compensation")
    if sr and (lo is None or hi is None):
        m = re.findall(r"\d[\d,]*(?:\.\d+)?", sr.replace(",", ""))
        nums = []
        for g in m[:4]:
            try:
                nums.append(float(g))
            except ValueError:
                pass
        if len(nums) >= 2:
            lo = lo or nums[0]
            hi = hi or nums[1]
        elif len(nums) == 1:
            lo = lo or nums[0]
            hi = hi or nums[0]
    return lo, hi


def map_job_row(
    rn: dict[str, str], company_id_to_name: dict[str, str] | None = None
) -> dict[str, Any] | None:
    """Map one §9 Kaggle jobs CSV row → CreateJobRequest-shaped dict (caller adds company_id, recruiter_id).

    When ``companies.csv`` is loaded, hiring org is prepended as the first line of ``description``:
    ``[employer:Company Name]`` so the job seeker UI can show the real employer while ``company_id`` stays Acme (Option 1).
    """
    title = pick(
        rn,
        "title",
        "job_title",
        "position",
        "name",
        "role",
        "job_title_text",
        "job_position",
    )
    if not title:
        return None
    description = pick(
        rn,
        "description",
        "job_description",
        "full_description",
        "job_summary",
        "summary",
        "job_summary_text",
        "details",
        "about_job",
    )
    location = pick(
        rn,
        "location",
        "job_location",
        "geo_location",
        "city",
        "job_city",
        "place",
        "mapped_city_state_country",
    )
    skills_raw = pick(
        rn,
        "skills",
        "skills_desc",
        "skills_required",
        "required_skills",
        "skill_list",
        "technical_skills",
        "hard_skills",
    )
    skills = parse_skills_blob(skills_raw)
    emp = normalize_employment_type(
        pick(rn, "employment_type", "job_type", "type", "employment", "formatted_work_type", "work_type")
    )
    seniority = normalize_seniority_level(
        pick(rn, "seniority_level", "seniority", "experience_level", "job_level", "formatted_experience_level"),
        title,
    )
    work_mode = infer_work_mode(rn, title, description)
    salary_min, salary_max = parse_salary(rn)
    employer_raw = employer_display_name_for_job_row(rn, company_id_to_name)
    emp_tag = sanitize_employer_tag_name(employer_raw) if employer_raw else ""
    desc = (description or "").lstrip()
    if emp_tag and not re.match(r"^\[employer:", desc, re.IGNORECASE):
        description = f"[employer:{emp_tag}]\n{desc}" if desc else f"[employer:{emp_tag}]"
    if description:
        description = description[:32000]
    return {
        "title": title[:512],
        "description": description if description else None,
        "work_mode": work_mode,
        "employment_type": emp[:64] if emp else None,
        "seniority_level": seniority[:64],
        "location": location[:255] if location else None,
        "skills_required": skills,
        "salary_min": salary_min,
        "salary_max": salary_max,
    }


def map_resume_row(rn: dict[str, str]) -> dict[str, Any] | None:
    """Map one §9 Kaggle resume CSV row → /members/update body (caller adds member_id)."""
    body = pick(
        rn,
        "resume_str",
        "resume",
        "resume_text",
        "cleaned_resume",
        "cv",
        "text",
        "content",
    )
    if not body:
        return None
    category = pick(rn, "category", "job_category", "label", "class", "job_title")
    headline_src = (category.replace("_", " ").replace("-", " ").strip()) if category else ""
    headline = (headline_src[:220] if headline_src else None)
    summary = body[:24000]
    skills_blob = pick(rn, "skills", "skill_set", "skills_list")
    skills = parse_skills_blob(skills_blob)
    if skills is None and headline_src:
        skills = [headline_src[:80]]
    city = pick(rn, "location_city", "city", "job_city")
    state = pick(rn, "location_state", "state", "region")
    patch: dict[str, Any] = {"summary": summary}
    if headline:
        patch["headline"] = headline
    if skills is not None:
        patch["skills"] = skills
    if city:
        patch["location_city"] = city[:128]
    if state:
        patch["location_state"] = state[:64]
    return patch


def resume_pdf_http_url(rn: dict[str, str]) -> str | None:
    raw = pick(rn, "resume_pdf_url", "pdf_url", "resume_file_url", "cv_pdf_url")
    if not raw:
        return None
    u = raw.strip()
    if not u.startswith(("http://", "https://")):
        return None
    return u


def upload_resume_pdf_row(client: httpx.Client, member_id: int, token: str, url: str) -> bool:
    """Download PDF bytes and store via profile GridFS (same path as UI upload)."""
    headers = {"Authorization": f"Bearer {token}"}
    try:
        gr = client.get(url, follow_redirects=True, timeout=120.0)
        gr.raise_for_status()
    except Exception as exc:
        print(f"  {YELLOW}⚠ PDF fetch skipped ({url[:80]}…): {exc}{RESET}")
        return False
    data = gr.content
    if len(data) > 5 * 1024 * 1024:
        print(f"  {YELLOW}⚠ PDF too large (>5MB), skip{RESET}")
        return False
    if not data.startswith(b"%PDF"):
        print(f"  {YELLOW}⚠ URL did not return a PDF (missing %PDF header), skip{RESET}")
        return False
    ct = (gr.headers.get("content-type") or "").split(";")[0].strip().lower()
    if not ct or ct == "application/octet-stream":
        ct = "application/pdf"
    fn = url.split("?", maxsplit=1)[0].rstrip("/").split("/")[-1] or "resume.pdf"
    if not fn.lower().endswith(".pdf"):
        fn = f"{fn[:80]}.pdf"
    upload_url = BASE["profile"] + "/members/uploadResumeFile"
    try:
        files = {"resume": (fn[:160], data, ct)}
        form = {"member_id": str(member_id)}
        pr = client.post(upload_url, headers=headers, files=files, data=form, timeout=120.0)
    except Exception as exc:
        print(f"  {YELLOW}⚠ uploadResumeFile failed: {exc}{RESET}")
        return False
    if pr.status_code not in (200, 201):
        print(f"  {YELLOW}⚠ uploadResumeFile → {pr.status_code}: {pr.text[:200]}{RESET}")
        return False
    ok(f"PDF résumé stored", {"member_id": member_id, "bytes": len(data)})
    return True


def login(client: httpx.Client, email: str, password: str) -> dict[str, Any]:
    return post(client, "auth", "/auth/login", {"email": email, "password": password})


def bulk_analytics_doc9(
    client: httpx.Client,
    token: str,
    recruiter_id: int,
    job_ids: list[int],
    member_ids: dict[str, str],
) -> None:
    """Populate recruiter dashboard charts (§8.1) via Mongo ingest; idempotent keys."""
    if not job_ids:
        print(f"  {YELLOW}⚠ No job IDs — skip analytics ingest{RESET}")
        return
    start, end, _ = utc_month_window()
    span = max(1, int((end - start).total_seconds()) - 3600)

    def ts_at(fraction: float):
        return start + timedelta(seconds=min(span - 1, max(0, int(span * fraction))))

    rid = str(recruiter_id)
    a, b, c = member_ids["alice"], member_ids["bob"], member_ids["charlie"]
    mids = [a, b, c]
    cities = [
        ("San Francisco", "CA"),
        ("New York", "NY"),
        ("Seattle", "WA"),
        ("Austin", "TX"),
        ("Chicago", "IL"),
        ("Denver", "CO"),
        ("Boston", "MA"),
        ("Atlanta", "GA"),
    ]

    capped = job_ids[:80]
    ai = 0
    for ji, jid in enumerate(capped):
        n_apps = 1 + (ji % 4)
        for k in range(n_apps):
            mid = mids[(ji + k) % 3]
            city, st = cities[ai % len(cities)]
            ingest(
                client,
                token,
                event_type="application.submitted",
                ts=ts_at(0.02 + ai * 0.007),
                payload={
                    "job_id": str(jid),
                    "member_id": mid,
                    "recruiter_id": rid,
                    "city": city,
                    "state": st,
                },
                idempotency_key=f"skillsync-doc9-kaggle-app-{jid}-{ai}",
                actor_id=mid,
            )
            ai += 1

    vi = 0
    for ji, jid in enumerate(capped[:60]):
        for _ in range(2 + (ji % 3)):
            ingest(
                client,
                token,
                event_type="job.viewed",
                ts=ts_at(0.15 + vi * 0.005),
                payload={"job_id": str(jid), "recruiter_id": rid},
                idempotency_key=f"skillsync-doc9-kaggle-view-{jid}-{vi}",
                actor_id="0",
            )
            vi += 1

    for day_i in range(7):
        jid = capped[day_i % len(capped)]
        ingest(
            client,
            token,
            event_type="job.saved",
            ts=start + timedelta(days=min(day_i + 1, 28), hours=14),
            payload={"job_id": str(jid), "recruiter_id": rid},
            idempotency_key=f"skillsync-doc9-kaggle-saved-{rid}-{day_i}-{jid}",
            actor_id="99",
        )

    for i in range(min(5, len(capped))):
        jid = capped[i]
        ingest(
            client,
            token,
            event_type="application.statusChanged",
            ts=ts_at(0.55 + i * 0.01),
            payload={
                "job_id": str(jid),
                "member_id": a,
                "recruiter_id": rid,
                "old_status": "submitted",
                "new_status": "reviewing",
            },
            idempotency_key=f"skillsync-doc9-kaggle-stat-{jid}-{i}",
            actor_id=str(recruiter_id),
        )

    ok(
        "Analytics ingest (§8.1 helpers)",
        {"jobs_used": len(capped), "month": "current UTC month"},
    )


def main():
    ap = argparse.ArgumentParser(
        description="Import CSVs downloaded from DATA236 §9 Kaggle datasets only (see module docstring)."
    )
    ap.add_argument("--jobs-csv", type=Path, default=None, help="Path to jobs CSV from §9.1")
    ap.add_argument(
        "--companies-csv",
        type=Path,
        default=None,
        help="Path to companies.csv (joins company_id → name). If omitted, the same folder as --jobs-csv is searched for companies.csv.",
    )
    ap.add_argument("--resumes-csv", type=Path, default=None, help="Path to resumes CSV from §9.2")
    ap.add_argument("--max-job-rows", type=int, default=500)
    ap.add_argument("--max-resume-rows", type=int, default=300)
    ap.add_argument(
        "--recruiter-email",
        default="dana@acme.com",
        help="Seed recruiter who will own imported jobs (must exist via seed.py). Default dana@acme.com — Option 1.",
    )
    ap.add_argument("--password", default=SEED_USER_PASSWORD)
    ap.add_argument(
        "--analytics",
        action="store_true",
        help="Ingest synthetic Mongo analytics events for dashboards (not from Kaggle CSVs).",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.jobs_csv and not args.resumes_csv:
        print(
            f"{RED}Provide --jobs-csv and/or --resumes-csv (§9 Kaggle downloads). "
            f"See module docstring for dataset URLs.{RESET}",
            file=sys.stderr,
        )
        sys.exit(2)

    _DOC_PLACEHOLDERS = (
        "JOBS_FILE_FROM_FIND",
        "RESUME_FILE_FROM_FIND",
        "YOUR_REAL",
        "your_actual_file",
    )

    def _missing_csv(kind: str, p: Path) -> None:
        resolved = p.expanduser().resolve()
        print(
            f"{RED}{kind} CSV not found:{RESET} {p}\n"
            f"  {YELLOW}(Expanded:{RESET} {resolved})\n",
            file=sys.stderr,
        )
        if any(ph in p.name for ph in _DOC_PLACEHOLDERS):
            print(
                f"  {YELLOW}Tip:{RESET} `{p.name}` was never a real file — it meant “paste the output of "
                "`find … -name '*.csv'` here.” Use the exact filename Kaggle gave you after unzip.\n",
                file=sys.stderr,
            )
        parent = resolved.parent
        if not parent.is_dir():
            print(
                f"  {YELLOW}Folder missing:{RESET} {parent}\n"
                "  Create it, then download + unzip §9 Kaggle datasets into it "
                "(see module docstring).\n",
                file=sys.stderr,
            )
        else:
            found: list[Path] = []
            for c in sorted(parent.rglob("*.csv")):
                found.append(c)
                if len(found) >= 30:
                    break
            if found:
                print(f"  {GREEN}.csv files under {parent}:{RESET}", file=sys.stderr)
                for c in found:
                    print(f"    {c}", file=sys.stderr)
                print(
                    f"\n  {YELLOW}Example:{RESET} copy one path above into --jobs-csv or --resumes-csv.\n",
                    file=sys.stderr,
                )
            else:
                print(
                    f"  {YELLOW}No .csv files under {parent}.{RESET}\n"
                    "  Run Kaggle download + unzip first, e.g.:\n"
                    "    kaggle datasets download -d rajatraj0502/linkedin-job-2023 -p data/kaggle/downloads/\n"
                    "    cd data/kaggle/downloads && unzip -o '*.zip'\n",
                    file=sys.stderr,
                )

    if args.jobs_csv:
        args.jobs_csv = args.jobs_csv.expanduser()
    if args.resumes_csv:
        args.resumes_csv = args.resumes_csv.expanduser()
    if args.companies_csv:
        args.companies_csv = args.companies_csv.expanduser()

    if args.jobs_csv and not args.jobs_csv.is_file():
        _missing_csv("Jobs", args.jobs_csv)
        sys.exit(1)
    if args.resumes_csv and not args.resumes_csv.is_file():
        _missing_csv("Resumes", args.resumes_csv)
        sys.exit(1)

    companies_path: Path | None = None
    if args.companies_csv is not None:
        cp = args.companies_csv.expanduser().resolve()
        if not cp.is_file():
            print(f"{RED}Companies CSV not found:{RESET} {cp}", file=sys.stderr)
            sys.exit(1)
        companies_path = cp
    elif args.jobs_csv and args.jobs_csv.is_file():
        companies_path = resolve_companies_csv_path(args.jobs_csv, None)

    company_id_to_name: dict[str, str] | None = None
    if companies_path is not None:
        company_id_to_name = load_company_id_names(companies_path)
        print(
            f"  {GREEN}✓{RESET} Loaded {BOLD}{len(company_id_to_name)}{RESET} company id→name rows from {companies_path.name}"
        )

    if args.dry_run:
        if args.jobs_csv:
            with args.jobs_csv.open(newline="", encoding="utf-8", errors="replace") as f:
                r = csv.DictReader(f)
                row = next(iter(r), None)
                if row:
                    mapped = map_job_row(row_normalized(row), company_id_to_name)
                    print(json.dumps(mapped, indent=2, default=str))
                else:
                    print("Empty jobs CSV")
        if args.resumes_csv:
            with args.resumes_csv.open(newline="", encoding="utf-8", errors="replace") as f:
                r = csv.DictReader(f)
                row = next(iter(r), None)
                if row:
                    mapped = map_resume_row(row_normalized(row))
                    print(json.dumps(mapped, indent=2, default=str))
                else:
                    print("Empty resumes CSV")
        return

    with httpx.Client(timeout=120) as client:
        wait_for_services(client)

        print(
            f"\n{BOLD}Option 1 (class doc){RESET}: Kaggle → jobs + resumes only; "
            f"recruiter/company/members from {YELLOW}scripts/seed.py{RESET}. "
            f"Posting as {YELLOW}{args.recruiter_email}{RESET}.\n"
        )

        rec = login(client, args.recruiter_email, args.password)
        recruiter_uid = rec["user_id"]
        rec_token = rec["token"]
        rec_profile = post(
            client,
            "recruiter",
            "/recruiters/get",
            {"recruiter_id": recruiter_uid},
            token=rec_token,
        )
        company_id = rec_profile.get("company_id")
        if company_id is None:
            print(
                f"{RED}Recruiter profile has no company_id. Run `python scripts/seed.py` first "
                f"(creates Acme + Dana/Eli).{RESET}",
                file=sys.stderr,
            )
            sys.exit(1)

        member_aliases = [
            ("alice", "alice@example.com"),
            ("bob", "bob@example.com"),
            ("charlie", "charlie@example.com"),
        ]
        member_ids_int: dict[str, int] = {}
        member_tokens: dict[str, str] = {}
        member_ids_str: dict[str, str] = {}
        for alias, email in member_aliases:
            pl = login(client, email, args.password)
            member_ids_int[alias] = pl["user_id"]
            member_tokens[alias] = pl["token"]
            member_ids_str[alias] = str(pl["user_id"])

        if args.jobs_csv:
            print(f"\n{BOLD}Import jobs (§9.1){RESET}")
            existing = fetch_all_jobs_by_recruiter(client, recruiter_uid, rec_token)
            with args.jobs_csv.open(newline="", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    if i >= args.max_job_rows:
                        break
                    rn = row_normalized(row)
                    jd = map_job_row(rn, company_id_to_name)
                    if not jd:
                        continue
                    title = jd["title"]
                    loc = (jd.get("location") or "").strip()
                    found = find_job_id_title_location(existing, recruiter_uid, title, loc)
                    if found:
                        ok(f"Skip duplicate title+location: {title[:40]}… @ {loc[:32]}…", {"job_id": found})
                        continue
                    body = {
                        **jd,
                        "company_id": company_id,
                        "recruiter_id": recruiter_uid,
                    }
                    out = post(client, "job", "/jobs/create", body, token=rec_token)
                    jid = int(out["job_id"])
                    existing = fetch_all_jobs_by_recruiter(client, recruiter_uid, rec_token)
                    ok(f"Job: {title[:60]}", {"job_id": jid})

        if args.resumes_csv:
            print(f"\n{BOLD}Import resumes → member profiles (§9.2){RESET}")
            with args.resumes_csv.open(newline="", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    if i >= args.max_resume_rows:
                        break
                    rn = row_normalized(row)
                    patch = map_resume_row(rn)
                    if not patch:
                        continue
                    alias = member_aliases[i % 3][0]
                    uid = member_ids_int[alias]
                    tok = member_tokens[alias]
                    pdf_u = resume_pdf_http_url(rn)
                    if pdf_u:
                        upload_resume_pdf_row(client, uid, tok, pdf_u)
                    post(
                        client,
                        "profile",
                        "/members/update",
                        {"member_id": uid, **patch},
                        token=tok,
                    )
                    ok(f"Profile row {i + 1} → {alias}", {"member_id": uid})

        if args.analytics:
            print(f"\n{BOLD}Analytics backfill (§8.1){RESET}")
            final_jobs = fetch_all_jobs_by_recruiter(client, recruiter_uid, rec_token)
            all_ids = [int(j["job_id"]) for j in final_jobs]
            bulk_analytics_doc9(client, rec_token, recruiter_uid, all_ids, member_ids_str)

        print(f"\n{BOLD}{GREEN}Done.{RESET} Open recruiter dashboard as {args.recruiter_email}\n")


if __name__ == "__main__":
    main()
