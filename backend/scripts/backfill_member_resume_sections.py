#!/usr/bin/env python3
"""
Populate Experience / Education / Skills / Languages / About / Summary / (optional) Headline from
résumé-shaped text in each member's summary and/or unstructured.about.

Uses resume_profile_text_parser.parse_resume_profile_blob (classic MM/YYYY layout and verbose
month-name layouts such as “May 2014 to Current Company Name … Education … Skills”).

With ``--include-flexible``, members whose text fails the strict gate but passes
``looks_flexible_parseable_resume_blob`` are parsed with ``parse_resume_profile_flexible``
(looser sections, MM/YYYY + Present/Current, relaxed job-line heuristics).

Mirrors scripts/backfill_recruiter_profiles.py: paginates /members/search, logs in per member with the
seed password when possible, calls POST /members/update.

Usage (from backend/, services up):
  pip install httpx

  # Preview updates (no writes):
  python scripts/backfill_member_resume_sections.py --dry-run

  # Only members missing experience OR education (default):
  python scripts/backfill_member_resume_sections.py --max 20

  # Every member whose summary/about looks parseable — overwrite structured fields + headline:
  python scripts/backfill_member_resume_sections.py --all-members --dry-run
  python scripts/backfill_member_resume_sections.py --all-members

  # Also attempt second-tier parsing for long non-strict résumé blobs (more coverage):
  python scripts/backfill_member_resume_sections.py --all-members --include-flexible --dry-run

  # Same as --all-members (long form):
  python scripts/backfill_member_resume_sections.py --no-only-sparse --force --update-headline

Requires each member's password to match SEED_USER_PASSWORD (SkillSync1!) unless login fails (skipped).
Search user (--search-as) must be allowed to call /members/search and /members/get.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import resume_profile_text_parser as rp  # noqa: E402
import seed as seed_mod  # noqa: E402

BASE = seed_mod.BASE
post = seed_mod.post
wait_for_services = seed_mod.wait_for_services
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
ok = seed_mod.ok
section = seed_mod.section


def _try_login_token(client: httpx.Client, email: str) -> str | None:
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


def _login_search_user(client: httpx.Client, email: str) -> str:
    login = post(client, "auth", "/auth/login", {"email": email, "password": SEED_USER_PASSWORD})
    return str(login["token"])


def _candidate_blobs(profile: dict) -> list[str]:
    s = (profile.get("summary") or "").strip()
    u = profile.get("unstructured") or {}
    a = (u.get("about") or "").strip()
    out: list[str] = []
    if s:
        out.append(s)
    if a:
        out.append(a)
    if s and a and s != a:
        out.append(f"{s}\n\n{a}")
    return out


def _pick_blob(profile: dict, *, flexible: bool) -> str | None:
    for blob in _candidate_blobs(profile):
        if flexible:
            if rp.looks_flexible_parseable_resume_blob(blob):
                return blob
        elif rp.looks_parseable_resume_blob(blob):
            return blob
    return None


def _is_sparse(profile: dict) -> bool:
    exp = profile.get("experience") or []
    edu = profile.get("education") or []
    return not exp or not edu


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill member profile tabs from résumé-shaped summary/about text")
    ap.add_argument(
        "--all-members",
        action="store_true",
        help="Parse and apply for every parseable profile: sets --no-only-sparse --force --update-headline",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--search-as",
        default="alice@example.com",
        help="Account used to paginate /members/search and /members/get",
    )
    ap.add_argument(
        "--no-only-sparse",
        action="store_true",
        help="Also attempt updates for members who already have experience and education (see --force)",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="Overwrite experience and education with parsed rows even when already populated",
    )
    ap.add_argument("--max", type=int, default=0, metavar="N", help="Stop after N members examined (0 = no limit)")
    ap.add_argument(
        "--update-headline",
        action="store_true",
        help="Also PATCH headline when parser extracts one",
    )
    ap.add_argument(
        "--include-flexible",
        action="store_true",
        help="If no strict-parseable blob, try looks_flexible_parseable_resume_blob + parse_resume_profile_flexible",
    )
    ap.add_argument(
        "--merge-skills",
        action="store_true",
        default=True,
        help="Union existing skills with parsed skills (default: on)",
    )
    ap.add_argument(
        "--no-merge-skills",
        action="store_true",
        help="Replace skills list with parsed skills only",
    )
    args = ap.parse_args()
    if args.all_members:
        args.no_only_sparse = True
        args.force = True
        args.update_headline = True
    only_sparse = not args.no_only_sparse
    merge_skills = False if args.no_merge_skills else args.merge_skills

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)
        section("Backfill member résumé sections")

        search_tok = _login_search_user(client, args.search_as)
        ok("Search token", {"email": args.search_as})

        examined = 0
        updated = 0
        skipped_login = 0
        skipped_dense = 0
        skipped_not_parseable = 0
        skipped_flex_unproductive = 0
        flex_parses = 0

        page = 1
        page_size = 20

        while True:
            data = post(
                client,
                "profile",
                "/members/search",
                {"page": page, "keyword": None, "skill": None, "location": None},
                token=search_tok,
            )
            rows = data.get("members") or []
            page_size = int(data.get("page_size") or page_size)
            if not rows:
                break

            stop = False
            for row in rows:
                if args.max and examined >= args.max:
                    stop = True
                    break

                mid = int(row["member_id"])
                examined += 1

                profile = post(client, "profile", "/members/get", {"member_id": mid}, token=search_tok)
                blob = _pick_blob(profile, flexible=False)
                used_flexible = False
                if not blob and args.include_flexible:
                    blob = _pick_blob(profile, flexible=True)
                    used_flexible = bool(blob)
                if not blob:
                    skipped_not_parseable += 1
                    continue

                if only_sparse and not args.force and not _is_sparse(profile):
                    skipped_dense += 1
                    continue

                email = str(profile.get("email") or "").strip()
                if not email:
                    skipped_login += 1
                    continue

                tok = _try_login_token(client, email)
                if not tok:
                    skipped_login += 1
                    continue

                parsed = (
                    rp.parse_resume_profile_flexible(blob)
                    if used_flexible
                    else rp.parse_resume_profile_blob(blob)
                )
                if used_flexible:
                    exp_n = len(parsed.get("experience") or [])
                    edu_n = len(parsed.get("education") or [])
                    sk_n = len(parsed.get("skills") or [])
                    if exp_n == 0 and edu_n == 0 and sk_n < 3:
                        skipped_flex_unproductive += 1
                        continue
                    flex_parses += 1

                payload: dict = {
                    "member_id": mid,
                    "summary": parsed.get("summary"),
                    "about": parsed.get("about"),
                    "experience": parsed.get("experience"),
                    "education": parsed.get("education"),
                }
                if parsed.get("languages"):
                    payload["languages"] = parsed["languages"]

                if args.update_headline and parsed.get("headline"):
                    payload["headline"] = parsed["headline"]

                if merge_skills:
                    payload["skills"] = rp.merge_skill_lists(profile.get("skills"), parsed.get("skills"))
                else:
                    payload["skills"] = parsed.get("skills")

                if args.dry_run:
                    print(f"  [dry-run] member_id={mid} email={email!r} skills_out={len(payload.get('skills') or [])}")
                    updated += 1
                    continue

                post(client, "profile", "/members/update", payload, token=tok)
                updated += 1
                ok(
                    "updated",
                    {"member_id": mid, "email": email[:80], "experience_n": len(parsed.get("experience") or [])},
                )

            if stop:
                break
            if len(rows) < page_size:
                break
            page += 1

        section("Done")
        print(
            json.dumps(
                {
                    "members_examined": examined,
                    "profiles_updated": updated,
                    "skipped_login_or_no_email": skipped_login,
                    "skipped_already_structured": skipped_dense,
                    "skipped_not_parseable": skipped_not_parseable,
                    "flexible_parse_attempts": flex_parses,
                    "skipped_flex_unproductive": skipped_flex_unproductive,
                    "include_flexible": args.include_flexible,
                    "dry_run": args.dry_run,
                    "only_sparse": only_sparse,
                    "force": args.force,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
