#!/usr/bin/env python3
"""
Download [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023)
and populate SkillSync job data through the running stack (``POST /jobs/create`` → MySQL/Kafka paths),
by delegating to ``kaggle_jobs_seed.py``.

**Default mode (Dana / Eli):** run ``python scripts/seed.py`` once before this script so recruiters exist.

**``--per-company-recruiters``:** creates one recruiter + company per employer in the CSV; ``seed.py`` is not required.

Prerequisites:
  - Services up (same health checks as ``seed.py``).
  - ``pip install kaggle`` and Kaggle credentials (``~/.kaggle/kaggle.json`` or ``KAGGLE_USERNAME`` / ``KAGGLE_KEY``).

Usage (from ``backend/``)::

    python scripts/populate_linkedin_job_2023.py --download
    python scripts/populate_linkedin_job_2023.py --limit 500   # optional: smaller batch than default 10000
    python scripts/populate_linkedin_job_2023.py --download --per-company-recruiters --limit 150
    python scripts/populate_linkedin_job_2023.py --dry-run --limit 5
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _SCRIPT_DIR.parent
_DATASET_SLUG = "rajatraj0502/linkedin-job-2023"
_EXTRACT_ROOT = _BACKEND_ROOT / "data" / "kaggle" / "downloads" / "linkedin-job-2023"


def _find_kaggle_cli() -> str:
    exe = shutil.which("kaggle")
    if not exe:
        print(
            "Kaggle CLI not found. Install with: pip install kaggle\n"
            "Then add API credentials: https://www.kaggle.com/settings → API → Create New Token\n"
            "Place the token at ~/.kaggle/kaggle.json",
            file=sys.stderr,
        )
        sys.exit(1)
    return exe


def _unzip_archives(directory: Path) -> None:
    for zpath in sorted(directory.glob("*.zip")):
        with zipfile.ZipFile(zpath, "r") as zf:
            zf.extractall(directory)
        print(f"Extracted: {zpath.name}")


def _find_job_postings_csv(root: Path) -> Path:
    matches = sorted(root.rglob("job_postings.csv"))
    if not matches:
        print(f"No job_postings.csv under {root}. Listing directory:", file=sys.stderr)
        for p in sorted(root.rglob("*"))[:40]:
            print(f"  {p.relative_to(root)}", file=sys.stderr)
        sys.exit(1)
    if len(matches) > 1:
        # Prefer shallowest path (usually archive root)
        matches.sort(key=lambda p: (len(p.parts), str(p)))
    chosen = matches[0]
    print(f"Using CSV: {chosen}")
    return chosen


def _skills_csv(job_csv: Path) -> Path | None:
    p = job_csv.parent / "job_skills.csv"
    return p if p.is_file() else None


def _download_dataset(extract_root: Path) -> None:
    kaggle = _find_kaggle_cli()
    extract_root.mkdir(parents=True, exist_ok=True)
    cmd = [
        kaggle,
        "datasets",
        "download",
        "-d",
        _DATASET_SLUG,
        "-p",
        str(extract_root),
        "--force",
    ]
    print("Running:", " ".join(cmd))
    r = subprocess.run(cmd, cwd=str(_BACKEND_ROOT))
    if r.returncode != 0:
        print("kaggle datasets download failed. Check credentials and network.", file=sys.stderr)
        sys.exit(r.returncode or 1)
    _unzip_archives(extract_root)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Download LinkedIn Job 2023 from Kaggle and seed jobs via kaggle_jobs_seed.py.",
    )
    ap.add_argument(
        "--download",
        action="store_true",
        help=f"Run `kaggle datasets download -d {_DATASET_SLUG}` into data/kaggle/downloads/linkedin-job-2023/",
    )
    ap.add_argument(
        "--data-dir",
        type=Path,
        default=_EXTRACT_ROOT,
        help=f"Directory containing job_postings.csv (default: {_EXTRACT_ROOT})",
    )
    ap.add_argument("--limit", type=int, default=10000, help="Max job rows (0 = all; passed to kaggle_jobs_seed.py)")
    ap.add_argument("--offset", type=int, default=0, help="Skip first N CSV rows")
    ap.add_argument(
        "--per-company-recruiters",
        action="store_true",
        help="One or more recruiters per employer name (see kaggle_jobs_seed.py)",
    )
    ap.add_argument(
        "--recruiters-per-company",
        type=int,
        default=1,
        help="With --per-company-recruiters: N recruiter accounts per company (default 1)",
    )
    ap.add_argument(
        "--recruiter",
        choices=("alternate", "dana", "eli"),
        default="alternate",
        help="Ignored when --per-company-recruiters is set",
    )
    ap.add_argument("--dry-run", action="store_true", help="Pass through to kaggle_jobs_seed.py")
    args = ap.parse_args()

    data_dir = args.data_dir.resolve()
    if args.download:
        _download_dataset(data_dir)

    job_csv = _find_job_postings_csv(data_dir)
    skills = _skills_csv(job_csv)
    companies = job_csv.parent / "companies.csv"

    seed_script = _SCRIPT_DIR / "kaggle_jobs_seed.py"
    cmd: list[str] = [
        sys.executable,
        str(seed_script),
        "--csv",
        str(job_csv),
        "--limit",
        str(args.limit),
        "--offset",
        str(args.offset),
        "--recruiter",
        args.recruiter,
    ]
    if skills:
        cmd.extend(["--skills-csv", str(skills)])
    if companies.is_file():
        cmd.extend(["--companies-csv", str(companies)])
    if args.per_company_recruiters:
        cmd.append("--per-company-recruiters")
    if args.recruiters_per_company != 1:
        cmd.extend(["--recruiters-per-company", str(args.recruiters_per_company)])
    if args.dry_run:
        cmd.append("--dry-run")

    if not args.per_company_recruiters:
        print(
            "\nNote: Default mode uses Dana/Eli from seed.py. If imports fail with auth errors, run:\n"
            "  python scripts/seed.py\n",
        )

    print("Running:", " ".join(cmd))
    r = subprocess.run(cmd, cwd=str(_BACKEND_ROOT))
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
