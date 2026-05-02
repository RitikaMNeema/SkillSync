#!/usr/bin/env python3
"""
Backfill ``[employer:Company Name]`` as the first line of ``jobs.description`` for listings
that were imported before ``companies.csv`` was joined (UI otherwise shows Acme only).

Matches CSV rows to existing MySQL jobs by **title + location** (same fields used at import).
When several DB rows share that pair, picks the one whose description prefix best matches the CSV row.

Prerequisite: backend services up; recruiter owns the imported jobs (default ``dana@acme.com``).

Usage:
    cd backend && pip install httpx
    python scripts/backfill_listing_employer_tags.py \\
        --job-postings-csv data/kaggle/downloads/job_postings.csv

Defaults to recruiter logins ``dana@acme.com`` and ``eli@acme.com`` (seed). Override with one or more
``--recruiter-email``. ``companies.csv`` is resolved beside ``job_postings.csv`` when omitted.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from pathlib import Path

import httpx

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _load_kaggle_import():
    path = _BACKEND_ROOT / "scripts" / "kaggle_import.py"
    spec = importlib.util.spec_from_file_location("skillsync_kaggle_import", path)
    if spec is None or spec.loader is None:
        print(f"Cannot load {path}", file=sys.stderr)
        sys.exit(1)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_seed():
    path = _BACKEND_ROOT / "scripts" / "seed.py"
    spec = importlib.util.spec_from_file_location("skillsync_seed", path)
    if spec is None or spec.loader is None:
        print(f"Cannot load {path}", file=sys.stderr)
        sys.exit(1)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ki = _load_kaggle_import()
seed = _load_seed()

post = seed.post
wait_for_services = seed.wait_for_services
fetch_all_jobs_by_recruiter = seed.fetch_all_jobs_by_recruiter
SEED_USER_PASSWORD = seed.SEED_USER_PASSWORD
GREEN, YELLOW, RED, BOLD, RESET = seed.GREEN, seed.YELLOW, seed.RED, seed.BOLD, seed.RESET


def _norm_ws(s: str | None) -> str:
    return " ".join((s or "").split())


def _desc_prefix(desc: str | None, n: int = 96) -> str:
    d = (desc or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return d[:n]


def _already_tagged(description: str | None) -> bool:
    return bool(re.match(r"^\s*\[employer:", (description or "").lstrip(), re.IGNORECASE))


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill [employer:…] lines on imported job descriptions.")
    ap.add_argument("--job-postings-csv", type=Path, required=True)
    ap.add_argument("--companies-csv", type=Path, default=None)
    ap.add_argument(
        "--recruiter-email",
        action="append",
        dest="recruiter_emails",
        default=None,
        help="Recruiter login that owns imported jobs (repeat flag for Dana + Eli). "
        "Default: dana@acme.com and eli@acme.com",
    )
    ap.add_argument("--password", default=SEED_USER_PASSWORD)
    ap.add_argument("--max-rows", type=int, default=50_000, help="CSV rows to scan (default 50k)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    jobs_csv = args.job_postings_csv.expanduser().resolve()
    if not jobs_csv.is_file():
        print(f"{RED}job postings CSV not found:{RESET} {jobs_csv}", file=sys.stderr)
        sys.exit(1)

    explicit_companies = args.companies_csv.expanduser().resolve() if args.companies_csv is not None else None
    if explicit_companies is not None and not explicit_companies.is_file():
        print(f"{RED}Companies CSV not found:{RESET} {explicit_companies}", file=sys.stderr)
        sys.exit(1)
    companies_path = ki.resolve_companies_csv_path(jobs_csv, explicit_companies)
    if companies_path is None:
        print(
            f"{RED}No companies.csv found.{RESET} Place it next to job_postings.csv or pass --companies-csv.",
            file=sys.stderr,
        )
        sys.exit(1)

    company_map = ki.load_company_id_names(companies_path)
    print(f"  {GREEN}✓{RESET} Loaded {len(company_map)} company names from {companies_path.name}")

    with httpx.Client(timeout=120) as client:
        wait_for_services(client)
        recruiter_emails = args.recruiter_emails or ["dana@acme.com", "eli@acme.com"]
        by_tl: dict[tuple[str, str], list[dict]] = {}
        token_by_uid: dict[int, str] = {}
        for email in recruiter_emails:
            rec = post(client, "auth", "/auth/login", {"email": email, "password": args.password})
            uid = int(rec["user_id"])
            tok = rec["token"]
            token_by_uid[uid] = tok
            db_jobs = fetch_all_jobs_by_recruiter(client, uid, tok)
            for j in db_jobs:
                key = (_norm_ws(j.get("title")), _norm_ws(j.get("location")))
                by_tl.setdefault(key, []).append(j)

        updated_ids: set[int] = set()
        scanned = 0
        updated = 0
        skipped_tagged = 0
        skipped_no_employer = 0
        skipped_no_match = 0
        ambiguous = 0

        import csv

        with jobs_csv.open(newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if scanned >= args.max_rows:
                    break
                scanned += 1
                rn = ki.row_normalized(row)
                title = ki.pick(
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
                    continue
                location = ki.pick(
                    rn,
                    "location",
                    "job_location",
                    "geo_location",
                    "city",
                    "job_city",
                    "place",
                    "mapped_city_state_country",
                )
                key = (_norm_ws(title), _norm_ws(location))
                candidates = by_tl.get(key)
                if not candidates:
                    skipped_no_match += 1
                    continue

                emp_raw = ki.employer_display_name_for_job_row(rn, company_map)
                emp_tag = ki.sanitize_employer_tag_name(emp_raw or "")
                if not emp_tag:
                    skipped_no_employer += 1
                    continue

                csv_desc_hint = _desc_prefix(
                    ki.pick(
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
                )

                untagged = [j for j in candidates if j["job_id"] not in updated_ids and not _already_tagged(j.get("description"))]
                if not untagged:
                    skipped_tagged += 1
                    continue

                chosen = untagged[0]
                if len(untagged) > 1 and csv_desc_hint:
                    best = None
                    best_score = -1
                    for j in untagged:
                        pj = _desc_prefix(j.get("description"))
                        prefix = csv_desc_hint[:48]
                        score = 0
                        if prefix and pj.startswith(prefix):
                            score = len(prefix)
                        elif prefix and prefix[:24] in pj:
                            score = 12
                        if score > best_score:
                            best_score = score
                            best = j
                    chosen = best if best is not None else untagged[0]
                    if best_score <= 0:
                        ambiguous += 1

                jid = int(chosen["job_id"])
                old_desc = (chosen.get("description") or "").lstrip()
                new_desc = f"[employer:{emp_tag}]\n{old_desc}" if old_desc else f"[employer:{emp_tag}]"

                if args.dry_run:
                    print(f"  {YELLOW}dry-run{RESET} job_id={jid} employer={emp_tag!r} title={title[:56]!r}")
                    updated_ids.add(jid)
                    updated += 1
                    continue

                owner_tok = token_by_uid.get(int(chosen.get("recruiter_id") or 0)) or next(iter(token_by_uid.values()))
                post(
                    client,
                    "job",
                    "/jobs/update",
                    {"job_id": jid, "description": new_desc[:32000]},
                    token=owner_tok,
                )
                updated_ids.add(jid)
                updated += 1
                chosen["description"] = new_desc

        print(
            f"\n{BOLD}{GREEN}Done.{RESET} scanned={scanned} updated={updated} "
            f"skipped_already_tagged_or_done={skipped_tagged} skipped_no_employer={skipped_no_employer} "
            f"csv_rows_no_db_match={skipped_no_match} ambiguous_guesses={ambiguous}\n"
        )


if __name__ == "__main__":
    main()
