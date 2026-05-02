"""Optional startup import of Kaggle job CSV when open-job count is below a floor (no manual CLI).

Enable with env (typically on job-service in Docker):
  AUTO_KAGGLE_IMPORT=true
  KAGGLE_JOBS_CSV=/data/kaggle/job_postings.csv   # mounted CSV path inside container
  KAGGLE_IMPORT_MIN_JOBS=500                       # skip import when open jobs >= this
  KAGGLE_MAX_JOB_ROWS=12000                       # passed through to kaggle_import.py

Requires scripts/kaggle_import.py in the image (Dockerfile COPY scripts/) and SKILLSYNC_HTTP_*
service URLs when running inside Compose (see docker-compose.yml job-service).
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

log = logging.getLogger(__name__)


def schedule_auto_kaggle_import() -> None:
    if os.getenv("AUTO_KAGGLE_IMPORT", "").strip().lower() not in ("1", "true", "yes", "on"):
        return

    csv_path = os.getenv("KAGGLE_JOBS_CSV", "").strip()
    if not csv_path:
        log.warning("AUTO_KAGGLE_IMPORT is set but KAGGLE_JOBS_CSV is empty; skipping.")
        return

    p = Path(csv_path)
    if not p.is_file():
        log.warning("AUTO_KAGGLE_IMPORT: CSV not found at %s; skipping.", csv_path)
        return

    try:
        min_jobs = int(os.getenv("KAGGLE_IMPORT_MIN_JOBS", "500"))
    except ValueError:
        min_jobs = 500
    max_rows = os.getenv("KAGGLE_MAX_JOB_ROWS", "12000").strip() or "12000"

    async def _task():
        # Let Kafka consumer and peer services finish wiring before hammering create endpoints.
        await asyncio.sleep(int(os.getenv("AUTO_KAGGLE_IMPORT_DELAY_SEC", "12")))

        from shared.database.mysql import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT COUNT(*) AS c FROM jobs WHERE status='open'")
                row = await cur.fetchone()
        n_open = int(row["c"]) if row else 0

        if n_open >= min_jobs:
            log.info(
                "AUTO_KAGGLE_IMPORT: skip (%s open jobs >= floor %s).",
                n_open,
                min_jobs,
            )
            return

        script = Path("/app/scripts/kaggle_import.py")
        if not script.is_file():
            log.error("AUTO_KAGGLE_IMPORT: missing %s (rebuild job-service image).", script)
            return

        exe = sys.executable
        cmd = [
            exe,
            str(script),
            "--jobs-csv",
            str(p.resolve()),
            "--max-job-rows",
            max_rows,
        ]
        log.info(
            "AUTO_KAGGLE_IMPORT: starting subprocess (%s open < %s): %s",
            n_open,
            min_jobs,
            " ".join(cmd),
        )

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env={**os.environ, "PYTHONPATH": "/app"},
        )
        out, _ = await proc.communicate()
        text = (out or b"").decode("utf-8", errors="replace")
        if proc.returncode != 0:
            log.error(
                "AUTO_KAGGLE_IMPORT: subprocess exit %s\n%s",
                proc.returncode,
                text[-8000:],
            )
        else:
            log.info("AUTO_KAGGLE_IMPORT: finished OK.\n%s", text[-4000:])

    asyncio.create_task(_task(), name="auto_kaggle_import")
