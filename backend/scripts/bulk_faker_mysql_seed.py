#!/usr/bin/env python3
"""
Insert synthetic **users** and **jobs** into MySQL using Faker (DATA236-style volume testing).

**Direct SQL** — bypasses HTTP microservices and Kafka. Use only on a **dev** Docker DB you are
allowed to mutate. Uses **bcrypt** directly (avoids passlib + new bcrypt ``__about__`` incompatibilities in some Conda envs).
Hashes are compatible with the auth service’s bcrypt verifier.

- **Users:** ``INSERT INTO users`` (role ``member``). Does **not** create ``members`` profile rows;
  use profile APIs or another script if the UI needs full member profiles.
- **Jobs:** ``INSERT INTO jobs`` for random existing ``(company_id, recruiter_id)`` pairs taken
  from ``recruiters`` (one recruiter per company chosen as ``MIN(recruiter_id)`` per company).
- **Applications:** ``--applications N`` inserts ``applications`` rows using **existing**
  ``members.member_id`` and random ``jobs.job_id`` (``INSERT IGNORE`` skips duplicate job+member pairs).
  Requires at least one **member profile** in ``members`` (API seed / ``kaggle_resume_seed``); plain
  ``users`` rows from ``--users`` alone are **not** enough for applications.

Defaults target Docker MySQL published on host **port 3310** (see ``docker-compose.yml``). Override
with env vars or CLI flags.

Prerequisites (from ``backend/``)::

    pip install pymysql faker bcrypt
    # or: pip install -r requirements-dev.txt

Usage::

    python scripts/bulk_faker_mysql_seed.py --users 5000 --jobs 8000 --dry-run
    python scripts/bulk_faker_mysql_seed.py --users 5000 --jobs 8000
    python scripts/bulk_faker_mysql_seed.py --applications 10000

Env (optional): ``MYSQL_HOST``, ``MYSQL_PORT``, ``MYSQL_USER``, ``MYSQL_PASSWORD``,
``MYSQL_DATABASE``, ``BULK_FAKER_PASSWORD`` (default ``SkillSync1!`` — same rules as auth seed).

If ``.env`` sets ``MYSQL_HOST=mysql`` (Docker service name), this script **remaps to** ``127.0.0.1``
and, when port is still ``3306``, to the **published** host port (default ``3310`` from this repo’s compose).
Override with ``--mysql-host`` / ``--mysql-port`` if needed.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import uuid
from pathlib import Path

try:
    import pymysql
except ImportError:
    print("Missing pymysql. Install: pip install pymysql", file=sys.stderr)
    sys.exit(1)

try:
    from faker import Faker
except ImportError:
    print("Missing faker. Install: pip install faker", file=sys.stderr)
    sys.exit(1)

try:
    import bcrypt
except ImportError:
    print("Missing bcrypt. Install: pip install bcrypt", file=sys.stderr)
    sys.exit(1)

_SCRIPT_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _SCRIPT_DIR.parent

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_DIR / ".env")
    load_dotenv(_BACKEND_DIR / ".env.local")
except ImportError:
    pass


def _bcrypt_hash(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:
        raw = raw[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12)).decode("ascii")


def _mysql_connect_params(
    *,
    mysql_host: str | None,
    mysql_port: int | None,
    mysql_user: str | None,
    mysql_password: str | None,
    mysql_database: str | None,
) -> tuple[str, int, str, str, str]:
    host = (mysql_host or os.getenv("MYSQL_HOST") or "127.0.0.1").strip() or "127.0.0.1"
    port = mysql_port if mysql_port is not None else int(os.getenv("MYSQL_PORT", "3310"))
    user = (mysql_user or os.getenv("MYSQL_USER") or "linkedin_user").strip()
    password = (mysql_password or os.getenv("MYSQL_PASSWORD") or "changeme_app").strip()
    database = (mysql_database or os.getenv("MYSQL_DATABASE") or "linkedin_db").strip()

    # ``mysql`` is the Compose service hostname (works only inside the Docker network).
    if host in ("mysql", "linkedin_mysql"):
        print(
            f"Note: MYSQL_HOST was {host!r} (in-container). Using 127.0.0.1 for host-side pymysql.",
            file=sys.stderr,
        )
        host = "127.0.0.1"
        # In-network port is 3306; on Mac/Windows the published port is often 3310 (see docker-compose.yml).
        if mysql_port is None and port == 3306:
            pub = int(os.getenv("MYSQL_PUBLIC_PORT", "3310"))
            print(f"Note: MYSQL_PORT was 3306 (in-container). Using published port {pub}.", file=sys.stderr)
            port = pub

    return host, port, user, password, database


def _connect(
    *,
    mysql_host: str | None = None,
    mysql_port: int | None = None,
    mysql_user: str | None = None,
    mysql_password: str | None = None,
    mysql_database: str | None = None,
):
    host, port, user, password, database = _mysql_connect_params(
        mysql_host=mysql_host,
        mysql_port=mysql_port,
        mysql_user=mysql_user,
        mysql_password=mysql_password,
        mysql_database=mysql_database,
    )
    print(f"Connecting MySQL: {user}@{host}:{port}/{database}", file=sys.stderr)
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        autocommit=False,
    )


def _load_application_pairs(cur) -> set[tuple[int, int]]:
    cur.execute("SELECT job_id, member_id FROM applications")
    return {(int(r[0]), int(r[1])) for r in cur.fetchall()}


def _load_company_recruiters(cur) -> list[tuple[int, int]]:
    """(company_id, recruiter_id) — one recruiter per company (lowest recruiter_id)."""
    cur.execute(
        """
        SELECT company_id, MIN(recruiter_id) AS recruiter_id
        FROM recruiters
        GROUP BY company_id
        """
    )
    rows = cur.fetchall()
    return [(int(r[0]), int(r[1])) for r in rows]


def main() -> None:
    ap = argparse.ArgumentParser(description="Bulk-insert Faker users + jobs into MySQL (dev only).")
    ap.add_argument("--users", type=int, default=0, help="Number of member users to insert")
    ap.add_argument("--jobs", type=int, default=0, help="Number of jobs to insert")
    ap.add_argument(
        "--applications",
        type=int,
        default=0,
        help="Number of application rows (needs existing members + jobs; uses INSERT IGNORE)",
    )
    ap.add_argument("--batch-size", type=int, default=250, help="Commit every N rows")
    ap.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    ap.add_argument("--dry-run", action="store_true", help="Print counts only; no inserts")
    ap.add_argument("--mysql-host", default=None, help="Override MYSQL_HOST (default from env)")
    ap.add_argument("--mysql-port", type=int, default=None, help="Override MYSQL_PORT (default from env)")
    ap.add_argument("--mysql-user", default=None, help="Override MYSQL_USER")
    ap.add_argument("--mysql-password", default=None, help="Override MYSQL_PASSWORD")
    ap.add_argument("--mysql-database", default=None, help="Override MYSQL_DATABASE")
    args = ap.parse_args()

    if args.users < 0 or args.jobs < 0 or args.applications < 0:
        print("users, jobs, and applications must be >= 0", file=sys.stderr)
        sys.exit(2)
    if args.users == 0 and args.jobs == 0 and args.applications == 0:
        print("Specify at least one of --users, --jobs, or --applications", file=sys.stderr)
        sys.exit(2)

    random.seed(args.seed)
    fake = Faker()
    Faker.seed(args.seed)

    password = os.getenv("BULK_FAKER_PASSWORD", "SkillSync1!")
    pw_hash = _bcrypt_hash(password)

    conn = _connect(
        mysql_host=args.mysql_host,
        mysql_port=args.mysql_port,
        mysql_user=args.mysql_user,
        mysql_password=args.mysql_password,
        mysql_database=args.mysql_database,
    )
    try:
        with conn.cursor() as cur:
            pairs: list[tuple[int, int]] = []
            if args.jobs > 0:
                pairs = _load_company_recruiters(cur)
                if not pairs:
                    print("No (company_id, recruiter_id) rows in recruiters — cannot insert jobs.", file=sys.stderr)
                    sys.exit(1)

            cur.execute("SELECT COUNT(*) FROM users")
            u0 = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM jobs")
            j0 = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM applications")
            a0 = cur.fetchone()[0]
            print(
                f"Before: users={u0}, jobs={j0}, applications={a0}"
                + (f", company_recruiter_pairs={len(pairs)}" if pairs else ""),
            )

            if args.dry_run:
                print(
                    f"Dry run: would insert users={args.users}, jobs={args.jobs}, applications={args.applications}",
                )
                return

            u_ins = 0
            if args.users > 0:
                sql_u = "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, 'member')"
                batch: list[tuple[str, str]] = []
                for i in range(args.users):
                    email = f"faker_member_{uuid.uuid4().hex[:16]}_{i}@example.com"
                    batch.append((email, pw_hash))
                    if len(batch) >= args.batch_size:
                        cur.executemany(sql_u, batch)
                        conn.commit()
                        u_ins += len(batch)
                        batch.clear()
                        print(f"  users +{u_ins}/{args.users}")
                if batch:
                    cur.executemany(sql_u, batch)
                    conn.commit()
                    u_ins += len(batch)
                    print(f"  users done +{u_ins}")

            j_ins = 0
            if args.jobs > 0:
                sql_j = """
                    INSERT INTO jobs (
                        company_id, recruiter_id, title, description,
                        seniority_level, employment_type, location, work_mode,
                        skills_required, benefits, salary_min, salary_max, status
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, 'open'
                    )
                """
                wm_choices = ("remote", "hybrid", "onsite")
                batch_j: list[tuple] = []
                for i in range(args.jobs):
                    cid, rid = random.choice(pairs)
                    title = (fake.job() + f" [bulk-{i}]")[:255]
                    desc = (fake.text(max_nb_chars=800) or "Role description.")[:8000]
                    loc = fake.city()[:255]
                    skills = json.dumps([fake.job()[:40] for _ in range(random.randint(2, 6))])
                    benefits = json.dumps(["Health", "PTO", "401(k)"])
                    smin = float(random.randint(70, 130)) * 1000
                    smax = smin + float(random.randint(10, 60)) * 1000
                    batch_j.append(
                        (
                            cid,
                            rid,
                            title,
                            desc,
                            random.choice(["entry", "mid", "senior", "director"]),
                            random.choice(["full-time", "part-time", "contract"]),
                            loc,
                            random.choice(wm_choices),
                            skills,
                            benefits,
                            smin,
                            smax,
                        )
                    )
                    if len(batch_j) >= args.batch_size:
                        cur.executemany(sql_j, batch_j)
                        conn.commit()
                        j_ins += len(batch_j)
                        batch_j.clear()
                        print(f"  jobs +{j_ins}/{args.jobs}")
                if batch_j:
                    cur.executemany(sql_j, batch_j)
                    conn.commit()
                    j_ins += len(batch_j)
                    print(f"  jobs done +{j_ins}")

            a_ins = 0
            if args.applications > 0:
                cur.execute("SELECT member_id FROM members")
                mids = [int(r[0]) for r in cur.fetchall()]
                cur.execute("SELECT job_id FROM jobs")
                jids = [int(r[0]) for r in cur.fetchall()]
                if not mids:
                    print("No rows in ``members`` — cannot insert applications (FK). Seed members first.", file=sys.stderr)
                    sys.exit(1)
                if not jids:
                    print("No rows in ``jobs`` — cannot insert applications.", file=sys.stderr)
                    sys.exit(1)
                existing_pairs = _load_application_pairs(cur)
                sql_a = """
                    INSERT IGNORE INTO applications (job_id, member_id, resume_url, cover_letter, status)
                    VALUES (%s, %s, %s, %s, 'submitted')
                """
                rng = random.Random(args.seed + 911)
                max_tries = max(args.applications * 80, args.applications + 100)
                tries = 0
                batch_a: list[tuple[int, int, str, str]] = []
                while a_ins < args.applications and tries < max_tries:
                    tries += 1
                    jid = rng.choice(jids)
                    mid = rng.choice(mids)
                    if (jid, mid) in existing_pairs:
                        continue
                    existing_pairs.add((jid, mid))
                    resume = f"https://example.com/bulk-app/{mid}/{jid}.pdf"
                    cover = (fake.text(max_nb_chars=400) or "Interested in this role.")[:4000]
                    batch_a.append((jid, mid, resume, cover))
                    if len(batch_a) >= args.batch_size:
                        cur.executemany(sql_a, batch_a)
                        conn.commit()
                        a_ins += len(batch_a)
                        batch_a.clear()
                        print(f"  applications +{a_ins}/{args.applications} (attempts {tries})")
                if batch_a:
                    cur.executemany(sql_a, batch_a)
                    conn.commit()
                    a_ins += len(batch_a)
                    print(f"  applications done +{a_ins} (attempts {tries})")
                if a_ins < args.applications:
                    print(
                        f"Warning: only inserted {a_ins} applications (wanted {args.applications}). "
                        "Try more jobs/members or lower target; duplicate pairs exhaust random sampling.",
                        file=sys.stderr,
                    )

            cur.execute("SELECT COUNT(*) FROM users")
            u1 = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM jobs")
            j1 = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM applications")
            a1 = cur.fetchone()[0]
            print(f"After: users={u1} (+{u1 - u0}), jobs={j1} (+{j1 - j0}), applications={a1} (+{a1 - a0})")
            print(f"Bulk password for new users (if any): {password!r}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
