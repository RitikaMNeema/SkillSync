#!/usr/bin/env python3
"""
Sync AI-demo (or compatible) seed JSON into live member profiles + resume URL mapping.

Reads members with résumé text from data/seeds/ai_demo_members.json (or --members-json),
keeps rows that look **tech-oriented** (headline / skills / résumé keywords), then for each:

  1. Logs in as that member (password must match scripts/seed.py SEED_USER_PASSWORD).
  2. Parses ``resume_plaintext`` with resume_profile_text_parser (strict; optional --include-flexible).
  3. POST /members/update — experience, education, skills (merged), summary, about, headline,
     plus identity/location/open_to from JSON when present.
  4. POST /members/uploadResume — sets ``resume_url`` from JSON so applications / UI map to the same link.

Prerequisites: members already exist in auth + profile (e.g. after scripts/ingest_ai_demo_seeds.py).

Usage (from backend/, services up):
  pip install httpx
  python3 scripts/sync_tech_resume_profiles_from_seed_json.py --dry-run
  python3 scripts/sync_tech_resume_profiles_from_seed_json.py --max 5
  python3 scripts/sync_tech_resume_profiles_from_seed_json.py
  python3 scripts/sync_tech_resume_profiles_from_seed_json.py --all-members --include-flexible
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parents[1]
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import resume_profile_text_parser as rp  # noqa: E402
import seed as seed_mod  # noqa: E402

post = seed_mod.post
wait_for_services = seed_mod.wait_for_services
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
ok = seed_mod.ok
section = seed_mod.section

# Headline / résumé / skills — broad tech + data roles (case-insensitive).
_TECH_RE = re.compile(
    r"\b(data\s+scientist|data\s+science|data\s+engineer|data\s+analyst|machine\s+learning|"
    r"ml\s+engineer|m\.l\.|analytics|bi\s+developer|software\s+engineer|swe\b|developer|"
    r"programmer|backend|front[\s-]?end|full[\s-]?stack|devops|sre\b|cloud\s+engineer|"
    r"platform\s+engineer|kubernetes|docker|python|java|react|typescript|sql\b|"
    r"engineer|scientist|architect)\b",
    re.I,
)


def _load_members(path: Path) -> list[dict]:
    if not path.is_file():
        print(f"  {seed_mod.RED}✗ Missing file: {path}{seed_mod.RESET}")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print(f"  {seed_mod.RED}✗ Expected JSON array in {path}{seed_mod.RESET}")
        sys.exit(1)
    return data


def _looks_tech(row: dict) -> bool:
    parts: list[str] = []
    for key in ("headline", "summary", "resume_plaintext"):
        v = row.get(key)
        if isinstance(v, str) and v.strip():
            parts.append(v)
    skills = row.get("skills")
    if isinstance(skills, list):
        parts.append(" ".join(str(s) for s in skills if s))
    blob = "\n".join(parts)
    return bool(blob.strip()) and _TECH_RE.search(blob) is not None


def _resume_blob(row: dict) -> str | None:
    raw = (row.get("resume_plaintext") or "").strip()
    if len(raw) >= 80:
        return raw
    # Fallback: long summary often mirrors résumé in ai_demo JSON
    s = (row.get("summary") or "").strip()
    if len(s) >= 200:
        return s
    return None


def _try_login(client: httpx.Client, email: str, password: str) -> tuple[int, str] | None:
    r = client.post(
        f"{seed_mod.BASE['auth']}/auth/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    if r.status_code != 200:
        return None
    try:
        data = (r.json() or {}).get("data") or {}
        uid = int(data["user_id"])
        tok = str(data["token"])
        return uid, tok
    except Exception:
        return None


def _open_to_safe(v) -> str | None:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()
    return s if s in {"job", "hiring", "services", "volunteer"} else None


def _profile_status_safe(v) -> str | None:
    if v is None or str(v).strip() == "":
        return None
    s = str(v).strip()
    return s if s in {"none", "open_to_work", "hiring"} else None


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Apply ai_demo_members.json résumé text to live profiles + resume_url",
    )
    ap.add_argument(
        "--seeds-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "seeds",
        help="Directory containing members JSON",
    )
    ap.add_argument(
        "--members-json",
        default="ai_demo_members.json",
        help="Filename under seeds-dir (default: ai_demo_members.json)",
    )
    ap.add_argument("--password", default=SEED_USER_PASSWORD, help="Member login password")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max", type=int, default=0, metavar="N", help="Stop after N successful updates (0 = no limit)")
    ap.add_argument(
        "--all-members",
        action="store_true",
        help="Skip tech filter; still requires parseable résumé blob",
    )
    ap.add_argument(
        "--include-flexible",
        action="store_true",
        help="If strict parse gate fails, try flexible parser (same rules as backfill_member_resume_sections)",
    )
    ap.add_argument(
        "--about-max-chars",
        type=int,
        default=8000,
        help="Trim résumé plaintext stored in Mongo ``about`` (mapping / future backfills)",
    )
    args = ap.parse_args()

    path = (args.seeds_dir / args.members_json).resolve()
    rows = _load_members(path)

    stats = {
        "rows_in_file": len(rows),
        "skipped_not_tech": 0,
        "skipped_no_blob": 0,
        "skipped_login": 0,
        "skipped_unparseable": 0,
        "skipped_flex_unproductive": 0,
        "updated": 0,
    }

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)
        section(f"Sync tech résumés from {path.name}")

        done = 0
        for row in rows:
            if args.max and done >= args.max:
                break

            if not args.all_members and not _looks_tech(row):
                stats["skipped_not_tech"] += 1
                continue

            blob = _resume_blob(row)
            if not blob:
                stats["skipped_no_blob"] += 1
                continue

            email = str(row.get("email") or "").strip()
            if not email:
                stats["skipped_login"] += 1
                continue

            auth = _try_login(client, email, args.password)
            if not auth:
                stats["skipped_login"] += 1
                continue
            member_id, token = auth

            used_flex = False
            if rp.looks_parseable_resume_blob(blob):
                parsed = rp.parse_resume_profile_blob(blob)
            elif args.include_flexible and rp.looks_flexible_parseable_resume_blob(blob):
                parsed = rp.parse_resume_profile_flexible(blob)
                used_flex = True
            else:
                stats["skipped_unparseable"] += 1
                continue

            if used_flex:
                exp_n = len(parsed.get("experience") or [])
                edu_n = len(parsed.get("education") or [])
                sk_n = len(parsed.get("skills") or [])
                if exp_n == 0 and edu_n == 0 and sk_n < 3:
                    stats["skipped_flex_unproductive"] += 1
                    continue

            json_skills = row.get("skills") if isinstance(row.get("skills"), list) else []
            merged_skills = rp.merge_skill_lists(json_skills, parsed.get("skills"))

            about_body = (parsed.get("about") or "").strip()
            if not about_body and blob:
                about_body = blob[: max(500, args.about_max_chars)]
            elif len(about_body) < 200 and blob:
                about_body = (about_body + "\n\n" + blob)[: args.about_max_chars]

            payload: dict = {
                "member_id": member_id,
                "first_name": (row.get("first_name") or "").strip() or None,
                "last_name": (row.get("last_name") or "").strip() or None,
                "phone": (row.get("phone") or "").strip() or None,
                "location_city": (row.get("location_city") or "").strip() or None,
                "location_state": (row.get("location_state") or "").strip() or None,
                "location_country": (row.get("location_country") or "").strip() or None,
                "headline": parsed.get("headline") or (row.get("headline") or "").strip() or None,
                "summary": parsed.get("summary") or (row.get("summary") or "").strip() or None,
                "about": about_body or None,
                "experience": parsed.get("experience"),
                "education": parsed.get("education"),
                "skills": merged_skills,
            }
            if parsed.get("languages"):
                payload["languages"] = parsed["languages"]

            ot = _open_to_safe(row.get("open_to"))
            if ot is not None:
                payload["open_to"] = ot
            ps = _profile_status_safe(row.get("profile_status"))
            if ps is not None:
                payload["profile_status"] = ps

            # Drop empty strings that would violate headline validator on update
            if payload.get("headline") == "":
                payload.pop("headline", None)

            resume_url = (row.get("resume_url") or "").strip() or None

            if args.dry_run:
                print(
                    f"  [dry-run] member_id={member_id} email={email!r} "
                    f"exp={len(parsed.get('experience') or [])} edu={len(parsed.get('education') or [])} "
                    f"skills={len(merged_skills or [])} flex={used_flex} resume_url={resume_url!r}"
                )
                done += 1
                stats["updated"] += 1
                continue

            post(client, "profile", "/members/update", payload, token=token)
            if resume_url:
                post(
                    client,
                    "profile",
                    "/members/uploadResume",
                    {"member_id": member_id, "resume_url": resume_url},
                    token=token,
                )
            ok(
                "synced",
                {
                    "member_id": member_id,
                    "email": email[:80],
                    "flexible": used_flex,
                    "resume_url_set": bool(resume_url),
                },
            )
            done += 1
            stats["updated"] += 1

        section("Summary")
        print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
