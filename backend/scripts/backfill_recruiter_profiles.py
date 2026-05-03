#!/usr/bin/env python3
"""
Fill About, Experience, Education, Skills, and Languages for every recruiter,
using employer name + industry from the linked companies row.

Requires services up (same as scripts/seed.py). Uses:
  - POST /recruiters/search (any logged-in user) to list recruiters
  - POST /auth/login per recruiter with SEED_USER_PASSWORD (SkillSync1! by default)
  - POST /recruiters/update with recruiter_profile_defaults enrichment

Usage (from backend/):
  pip install httpx
  python scripts/backfill_recruiter_profiles.py
  python scripts/backfill_recruiter_profiles.py --dry-run
  python scripts/backfill_recruiter_profiles.py --only-sparse   # skip rows that already have about + experience
  python scripts/backfill_recruiter_profiles.py --max 50       # smoke test
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import recruiter_profile_defaults as recruiter_defaults  # noqa: E402
import seed as seed_mod  # noqa: E402

BASE = seed_mod.BASE
post = seed_mod.post
wait_for_services = seed_mod.wait_for_services
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
ok = seed_mod.ok
section = seed_mod.section


def _profile_is_sparse(rec: dict) -> bool:
    if not (rec.get("about") or "").strip():
        return True
    exp = rec.get("experience")
    if exp is None:
        return True
    return isinstance(exp, list) and len(exp) == 0


def _login_search_user(client: httpx.Client, email: str) -> str:
    login = post(client, "auth", "/auth/login", {"email": email, "password": SEED_USER_PASSWORD})
    return str(login["token"])


def _try_login_token(client: httpx.Client, email: str) -> str | None:
    """Do not sys.exit on wrong password — recruiters outside the seed may fail."""
    r = client.post(
        f"{BASE['auth']}/auth/login",
        json={"email": email, "password": SEED_USER_PASSWORD},
        timeout=60,
    )
    if r.status_code != 200:
        return None
    try:
        j = r.json()
    except Exception:
        return None
    data = j.get("data") if isinstance(j, dict) else None
    if isinstance(data, dict) and data.get("token"):
        return str(data["token"])
    return None


def _split_display_name(name: str | None) -> tuple[str, str]:
    text = (name or "").strip()
    if not text:
        return "", ""
    parts = text.split(None, 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill recruiter profile sections from company data")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only")
    parser.add_argument(
        "--only-sparse",
        action="store_true",
        help="Update only recruiters missing about text or experience entries",
    )
    parser.add_argument("--max", type=int, default=0, metavar="N", help="Stop after N recruiters (0 = no limit)")
    parser.add_argument(
        "--search-as",
        default="dana@acme.com",
        help="Account used to paginate /recruiters/search (must exist from seed)",
    )
    args = parser.parse_args()

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)
        section("Backfill recruiter profiles")

        search_tok = _login_search_user(client, args.search_as)
        ok("Search token", {"email": args.search_as})

        processed = 0
        updated = 0
        skipped_login = 0
        skipped_dense = 0
        page = 1
        page_size = 20

        while True:
            data = post(
                client,
                "recruiter",
                "/recruiters/search",
                {"page": page},
                token=search_tok,
            )
            rows = data.get("recruiters") or []
            page_size = int(data.get("page_size") or page_size)
            if not rows:
                break

            stop_all = False
            for row in rows:
                if args.max and processed >= args.max:
                    stop_all = True
                    break

                rid = int(row["recruiter_id"])
                email = str(row.get("email") or "").strip()
                company_name = str(row.get("company_name") or "").strip()
                processed += 1
                if not email or not company_name:
                    continue

                tok = _try_login_token(client, email)
                if not tok:
                    print(f"  skip recruiter_id={rid}: login failed ({email}) — wrong password or not a seed recruiter?")
                    skipped_login += 1
                    continue

                if args.only_sparse:
                    rec = post(client, "recruiter", "/recruiters/get", {"recruiter_id": rid}, token=tok)
                    if not _profile_is_sparse(rec):
                        skipped_dense += 1
                        continue

                role_label = (row.get("role") or "Recruiter").strip()[:120] or "Recruiter"
                exp_title = role_label if role_label != "Recruiter" else "Talent Acquisition Partner"
                hq_raw = row.get("company_location")
                hq = str(hq_raw).strip() if hq_raw else None
                enrich = recruiter_defaults.recruiter_profile_enrichment(
                    company_name,
                    industry=row.get("industry"),
                    hq=hq,
                    role_label=role_label,
                    experience_job_title=exp_title,
                )

                fn_db = (row.get("first_name") or "").strip()
                ln_db = (row.get("last_name") or "").strip()
                fn_fallback, ln_fallback = _split_display_name(row.get("name"))
                first_name = (fn_db or fn_fallback or "Recruiter")[:120]
                last_name = (ln_db or ln_fallback)[:120]

                patch = {
                    "recruiter_id": rid,
                    "first_name": first_name,
                    "last_name": last_name,
                    **enrich,
                }

                if args.dry_run:
                    print(f"  [dry-run] recruiter_id={rid} email={email!r} company={company_name[:60]!r}")
                    updated += 1
                    continue

                post(client, "recruiter", "/recruiters/update", patch, token=tok)
                updated += 1
                ok(
                    "updated",
                    {"recruiter_id": rid, "company": company_name[:70], "email": email[:70]},
                )

            if stop_all:
                break
            if len(rows) < page_size:
                break
            page += 1

        section("Done")
        print(
            {
                "recruiters_seen": processed,
                "profiles_updated": updated,
                "skipped_login": skipped_login,
                "skipped_already_complete": skipped_dense,
                "dry_run": args.dry_run,
                "only_sparse": args.only_sparse,
            }
        )


if __name__ == "__main__":
    main()
