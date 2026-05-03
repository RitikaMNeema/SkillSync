#!/usr/bin/env python3
"""
Launcher: runs the AI demo seed generator at repo root `data/transform_ai_match_demo.py`.

From backend/:
    python3 scripts/transform_ai_match_demo.py

From repo root:
    python3 data/transform_ai_match_demo.py

After generating JSON, ingest via APIs (register, members/jobs/recruiters/applications):
    cd backend && python3 scripts/ingest_ai_demo_seeds.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "data" / "transform_ai_match_demo.py"


def main() -> None:
    if not _SCRIPT.is_file():
        print(f"Expected script at {_SCRIPT}", file=sys.stderr)
        sys.exit(1)
    raise SystemExit(subprocess.call([sys.executable, str(_SCRIPT), *sys.argv[1:]]))


if __name__ == "__main__":
    main()
