#!/usr/bin/env python3
"""
Parse a pasted résumé blob and PATCH a member profile via POST /members/update.

Uses the same HTTP + async command polling helpers as scripts/seed.py.

Example (use a real numeric member id, not the characters "<ID>"):
  cd backend && pip install httpx
  python scripts/apply_parsed_member_resume.py --member-id 42 --text-file /path/to/resume.txt
  python scripts/apply_parsed_member_resume.py --member-id 42 --stdin < resume.txt
  python scripts/apply_parsed_member_resume.py --member-id 42 --stdin --dry-run < resume.txt

The résumé input is plain UTF-8 text (.txt is optional; any file path works). The parser does not read
PDF/DOCX — export or paste the text body. Use --stdin with shell redirection, or --text-file path.
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

import resume_profile_text_parser as parser_mod  # noqa: E402
import seed as seed_mod  # noqa: E402

BASE = seed_mod.BASE
post = seed_mod.post
wait_for_services = seed_mod.wait_for_services
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
ok = seed_mod.ok
section = seed_mod.section


def _read_text(args: argparse.Namespace) -> str:
    if args.text_file:
        return Path(args.text_file).read_text(encoding="utf-8")
    if args.stdin:
        return sys.stdin.read()
    raise SystemExit("Provide --text-file or --stdin")


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Apply resume_profile_text_parser output to a member profile",
        epilog="Tip: in zsh/bash, <ID> in docs means substitute your member id (e.g. 42). "
        "Writing literally --member-id <ID> makes the shell try to open a file named ID.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--member-id",
        type=int,
        required=True,
        metavar="N",
        help="Target member's numeric id (from profile URL or DB), e.g. 42",
    )
    ap.add_argument(
        "--email",
        default="alice@example.com",
        help="Account used for Bearer token; must be allowed to update --member-id (typically the same member)",
    )
    ap.add_argument("--password", default=SEED_USER_PASSWORD)
    ap.add_argument("--text-file", type=str, default=None, help="UTF-8 file with résumé text")
    ap.add_argument("--stdin", action="store_true", help="Read résumé text from stdin")
    ap.add_argument("--dry-run", action="store_true", help="Print JSON payload only")
    ap.add_argument("--no-headline", action="store_true", help="Do not send parsed headline")
    args = ap.parse_args()

    text = _read_text(args)
    parsed = parser_mod.parse_resume_profile_blob(text)

    payload: dict = {
        "member_id": args.member_id,
        "summary": parsed.get("summary"),
        "about": parsed.get("about"),
        "experience": parsed.get("experience"),
        "education": parsed.get("education"),
        "skills": parsed.get("skills"),
    }
    if parsed.get("languages"):
        payload["languages"] = parsed["languages"]
    if not args.no_headline and parsed.get("headline"):
        payload["headline"] = parsed["headline"]

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)
        section("Apply parsed résumé to member")

        login = post(client, "auth", "/auth/login", {"email": args.email, "password": args.password})
        token = str(login["token"])
        ok("Auth", {"email": args.email})

        post(client, "profile", "/members/update", payload, token=token)
        ok("members/update", {"member_id": args.member_id})


if __name__ == "__main__":
    main()
