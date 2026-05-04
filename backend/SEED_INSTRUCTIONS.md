# SkillSync — seed instructions (step-by-step)

End-to-end order for **Docker**, **base seed**, **Kaggle unzip/import**, and **optional volume scripts**.  
All shell commands assume **`cd backend`** first unless noted.

For deeper detail on each script, see **`SEEDING.md`** in the repo root.

---

## 0. One-time: Kaggle API (only if you download from Kaggle)

1. Kaggle → **Account** → **API** → **Create New Token** → save `kaggle.json`.
2. Recommended: **`~/.kaggle/kaggle.json`**
3. Or put **`KAGGLE_USERNAME`** and **`KAGGLE_KEY`** in **`backend/.env`** (do not commit secrets). The **`kaggle` CLI does not auto-load `.env`**, so export before download:

```bash
cd backend
set -a && source .env && set +a   # zsh/bash
pip install kaggle
```

---

## 1. Start the stack

```bash
cd backend
docker compose up --build -d
```

Wait until services are healthy (seed scripts poll **auth … analytics** on ports **3001–3008** by default).

---

## 2. Base dataset (always run this first for normal flows)

Creates Dana/Eli, Acme, demo jobs, connections, applications, analytics events, etc.

```bash
cd backend
pip install httpx
python scripts/seed.py
```

Default password for seeded accounts: **`SkillSync1!`** (`SEED_USER_PASSWORD` in `scripts/seed.py`).

**Rule:** Run **`seed.py` before `kaggle_jobs_seed.py`** when using **Dana/Eli mode** (not `--per-company-recruiters`).

---

## 3. LinkedIn Job 2023 (Kaggle) — download and unzip

Dataset: [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023)

**Recommended folder** (matches `populate_linkedin_job_2023.py` defaults):

`backend/data/kaggle/downloads/linkedin-job-2023/`

After unzip, **`job_postings.csv`**, **`companies.csv`**, and optional **`job_skills.csv`** should sit **in the same directory** (or `companies.csv` next to the resolved `job_postings.csv` path). `companies.csv` maps `company_id` → name for per-company recruiter mode.

### 3a. One-shot helper (download + unzip + import)

```bash
cd backend
pip install httpx kaggle
python scripts/seed.py   # if using Dana/Eli mode (omit if only --per-company-recruiters)
python scripts/populate_linkedin_job_2023.py --download
```

Per-company recruiters (6 per company):

```bash
python scripts/populate_linkedin_job_2023.py --download --per-company-recruiters --recruiters-per-company 6
```

Default import size is **`--limit 10000`** job rows per run (omit the flag to use it). Use **`--limit 0`** for the full CSV. The helper unzips under **`data/kaggle/downloads/linkedin-job-2023/`** and passes **`--companies-csv`** when `companies.csv` is beside `job_postings.csv`.

### 3b. Manual download and unzip

```bash
cd backend
mkdir -p data/kaggle/downloads/linkedin-job-2023
kaggle datasets download -d rajatraj0502/linkedin-job-2023 -p data/kaggle/downloads/linkedin-job-2023
unzip -o data/kaggle/downloads/linkedin-job-2023/*.zip -d data/kaggle/downloads/linkedin-job-2023
```

If archives nest another folder, run **`find data/kaggle/downloads/linkedin-job-2023 -name job_postings.csv`** and point **`--csv`** (and keep **`companies.csv`** in that same folder) or pass **`--data-dir`** to `populate_linkedin_job_2023.py` when only re-running the import step.

---

## 4. Import jobs via HTTP (`kaggle_jobs_seed.py`)

Still from **`backend/`**, services up.

Set the CSV path once (adjust if your unzip layout differs):

```bash
export JOB_CSV=data/kaggle/downloads/linkedin-job-2023/job_postings.csv
```

### 4a. Dry-run (no writes)

```bash
python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV" --dry-run --limit 5
```

### 4b. Dana / Eli mode (needs **`seed.py` first**)

```bash
python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV"
```

Optional skills (same directory as `job_postings.csv`):

```bash
python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV" \
  --skills-csv "$(dirname "$JOB_CSV")/job_skills.csv" \
  --limit 0
```

### 4c. Per-company recruiters (LinkedIn 2023 + `companies.csv`)

Use when `job_postings.csv` has **`company_id`** and **`companies.csv`** is present (same folder or **`--companies-csv`**).

```bash
python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV" \
  --per-company-recruiters \
  --recruiters-per-company 6 \
  --limit 200
```

**Chunk large files:**

```bash
python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV" \
  --per-company-recruiters --recruiters-per-company 6 --offset 0 --limit 10000

python scripts/kaggle_jobs_seed.py --csv "$JOB_CSV" \
  --per-company-recruiters --recruiters-per-company 6 --offset 10000 --limit 10000
```

Password for new recruiter accounts: **`SkillSync1!`**.

---

## 5. Résumé dataset (Kaggle) — download, unzip, seed

Dataset: [snehaanbhawal/resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset)

```bash
cd backend
mkdir -p data/kaggle/downloads
kaggle datasets download -d snehaanbhawal/resume-dataset -f Resume/Resume.csv -p data/kaggle/downloads
unzip -o data/kaggle/downloads/Resume.csv.zip -d data/kaggle/downloads
```

For **PDF** uploads, fetch and unzip the **full** archive (see **`SEEDING.md` §5.1**).

```bash
pip install httpx fpdf2
python scripts/kaggle_resume_seed.py --csv data/kaggle/downloads/Resume.csv
```

---

## 6. Optional — extra analytics / dashboard volume

```bash
cd backend
python scripts/seed_recruiter_dashboard.py --help
python scripts/seed_recruiter_dashboard.py --month 2026-03 --min-jobs 10
```

Requires **`seed.py`** (Dana) first.

---

## 7. Optional — AI demo JSON seeds

If you use **`data/seeds/`** `ai_demo_*.json` from **`data/transform_ai_match_demo.py`**:

```bash
cd backend
pip install httpx fpdf2
python scripts/ingest_ai_demo_seeds.py
```

---

## 8. Optional — bulk MySQL volume (dev / load testing only)

**Direct SQL** — bypasses HTTP/Kafka. Use only on a disposable DB.

```bash
cd backend
pip install pymysql faker bcrypt python-dotenv

python scripts/bulk_faker_mysql_seed.py --users 5000 --jobs 8000 --dry-run
python scripts/bulk_faker_mysql_seed.py --users 5000 --jobs 8000
```

- If **`.env`** has **`MYSQL_HOST=mysql`**, the script remaps to **`127.0.0.1`** and port **`3306` → `3310`** (Docker publish port in this repo).
- **`--users`** inserts **`users`** only (no **`members`** rows).
- **`--applications N`** needs existing **`members`** + **`jobs`** (see script docstring).

```bash
python scripts/bulk_faker_mysql_seed.py --applications 10000
```

---

## 9. Inspect data in MySQL Workbench

- Connect to **`127.0.0.1`**, port **`3310`** (host port mapped by **`docker-compose.yml`**), schema **`linkedin_db`**.
- **`localhost:3306`** is often a *different* MySQL than Docker — row counts will not match the app.

Useful checks:

```sql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM recruiters;
SELECT COUNT(*) FROM companies;
SELECT COUNT(*) FROM jobs;
SELECT COUNT(*) FROM members;
SELECT COUNT(*) FROM applications;
```

---

## 10. Quick reference — scripts (run from `backend/`)

| Script | Data source | Creates / processes | Volume (how many) |
|--------|-------------|---------------------|-------------------|
| **`scripts/seed.py`** | Hardcoded fixtures in the script (`user_defs`, `JOB_SPECS`, flows) | Users, member profiles, recruiters + Acme, **4** demo jobs, connections, applications, messaging, idempotent **Mongo** analytics for charts | **5** users (3 members + 2 recruiters), **1** company, **4** jobs, **~4** application flows (+ closed-job demo), **2** message threads, **~19** analytics ingests in `seed_analytics_charts` (fixed keys; safe re-run) |
| **`scripts/kaggle_resume_seed.py`** | Kaggle [resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset) `Resume.csv` (+ optional PDF tree) | Member register + profile + résumé upload per row | **All CSV rows** by default; cap with **`--limit N`**, resume with **`--offset N`** |
| **`scripts/kaggle_jobs_seed.py`** | Kaggle job CSVs (e.g. LinkedIn Job 2023 `job_postings.csv` + optional `companies.csv`, `job_skills.csv`) | `POST /jobs/create` (+ optional per-company recruiters/companies) | Default **`--limit 10000`** rows; **`--limit 0`** = entire CSV; **`--offset`** for chunked runs |
| **`scripts/populate_linkedin_job_2023.py`** | Same CSV pipeline; optional **`--download`** for [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023) | Unzip + invoke **`kaggle_jobs_seed.py`** (same limits) | Same as **`kaggle_jobs_seed`** (default **`--limit 10000`**, **`0`** = all) |
| **`scripts/seed_recruiter_dashboard.py`** | Synthetic fixtures in-script (`MEMBER_FIXTURES`, `UNIQUE_DANA_JOB_TITLES`, random placement) | Extra Dana jobs, **12** members, applications, `trackView` / `save`, month-scoped **Mongo** analytics | **12** members; **`≥ max(6, --min-jobs)`** unique Dana jobs (default **`--min-jobs 10`**); applications = up to **Σ (2 + (idx % 6))** per open Dana job (deduped); analytics includes **80 × (# open Dana jobs)** synthetic geo `application.submitted` events (+ saved-job + replay events) |
| **`scripts/ingest_ai_demo_seeds.py`** | `data/seeds/ai_demo_*.json` (from `data/transform_ai_match_demo.py`) | Recruiters, jobs, members, résumés, applications via HTTP | As shipped in repo: **2** recruiters, **7** jobs, **7** members, **7** applications (edit JSON / re-run transform to change counts) |
| **`scripts/ingest_kaggle_bulk_seeds.py`** | `data/seeds/kaggle_bulk/*.json` from `data/transform_kaggle_bulk.py` (reads `data/raw/*.csv`) | Bulk members, sidecars, recruiters, jobs, applications (+ optional connections/messages/events) via HTTP | Ingest: **all** JSON rows by default; optional **`--limit-members`**, **`--limit-jobs`**, etc. Generator env defaults: **`N_MEMBERS=300`**, **`N_RECRUITERS=80`**, **`N_JOBS=400`**, **`N_APPLICATIONS=800`**, **`N_CONNECTIONS=400`**, **`N_MESSAGES=200`**, **`N_EVENTS=500`**, **`N_SCHEDULED_EVENTS=100`** (see `data/transform_kaggle_bulk.py`) |
| **`scripts/bulk_faker_mysql_seed.py`** | **Faker**-generated strings (no seed files); reads existing `recruiters` for job FKs | Direct **`INSERT`** into MySQL: `users`, `jobs`, optional `applications` | **None until you pass flags:** `--users`, `--jobs`, `--applications` default **0**. Example: **`--users 5000 --jobs 8000`**. Applications use **`INSERT IGNORE`** — fewer than **`N`** if duplicate **(member, job)** pairs |

Run order for HTTP seeds: **`seed.py`** first when using Dana/Eli job mode; see sections **2–8** above for commands.

---

## 11. Related docs

- **`SEEDING.md`** (repo root) — full narrative, flags, and tables.
- **`README.md`** — project quick start.
