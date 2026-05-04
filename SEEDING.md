# SkillSync — data seeding guide

This document describes **how to run every seed script** in this repository and how **Kaggle datasets** integrate with SkillSync. All seeds call the running HTTP APIs (they do **not** bypass services or inject SQL directly).

---

## Prerequisites

1. **Microservices running** — From `backend/`, start the stack (typical local flow):

   ```bash
   cd backend
   docker compose up --build -d
   ```

   Wait until the services respond. The core seed script expects these **default local ports** (from `backend/scripts/seed.py`):

   | Service     | Port | Role in seeding                          |
   |------------|------|------------------------------------------|
   | auth       | 3001 | Register / login, JWTs                   |
   | profile    | 3002 | Member profiles, resume uploads          |
   | recruiter  | 3003 | Recruiters, companies                    |
   | connection | 3004 | Member connections                       |
   | job        | 3005 | Job listings (`POST /jobs/create`, etc.) |
   | application| 3006 | Applications                             |
   | messaging  | 3007 | Messages                                 |
   | analytics  | 3008 | Event ingest for dashboard charts        |

2. **Python 3** with **`httpx`** installed:

   ```bash
   pip install httpx
   ```

3. **Working directory** — Run scripts from **`backend/`** unless the script docstring says otherwise. Paths like `data/kaggle/downloads/...` are relative to `backend/`.

---

## Recommended order of operations

```text
1. docker compose up -d   (from backend/)
2. python scripts/seed.py   ← primary dataset; run first for normal workflows
3. (optional) python scripts/kaggle_resume_seed.py …
4. (optional) python scripts/kaggle_jobs_seed.py …
5. (optional) python scripts/seed_recruiter_dashboard.py …
```

**Rule:** Run **`scripts/seed.py` before** `kaggle_jobs_seed.py` in **default (Dana/Eli) mode**, because that mode needs **Dana** (`dana@acme.com`), **Eli** (`eli@acme.com`), and **Acme Corp** created by the base seed. The Kaggle jobs importer uses their recruiter and company IDs from the same base data.

---

## 1. Primary seed — `backend/scripts/seed.py`

**Purpose:** Idempotent “main” test data: users, recruiters, companies, jobs (`JOB_SPECS`), connections, applications, messages, and **analytics events** (Mongo) so recruiter dashboard charts have data even if Kafka did not persist events earlier.

**How to run:**

```bash
cd backend
pip install httpx
python scripts/seed.py
```

**Properties:**

- **Safe to re-run** — Reuses existing users/jobs when possible; duplicate applications/connections are treated as benign when the API returns known conflict messages.
- **Default member password** for seeded accounts: **`SkillSync1!`** (`SEED_USER_PASSWORD` in `seed.py`). This must satisfy the auth service password policy.
- The script **waits for services** and prints progress; it may poll Kafka **command status** endpoints for async profile/job/recruiter operations.

**Not included:** Kaggle bulk data. For large résumé/job imports, use the Kaggle scripts below.

---

## 2. Optional — `backend/scripts/seed_recruiter_dashboard.py`

**Purpose:** **Extra** analytics and dashboard coverage for **Dana** (`dana@acme.com`) — more jobs, members, applications, and **recruiter-scoped analytics events** (e.g. `application.submitted`, `job.saved`, job views). It is **not** a replacement for `seed.py` and **does not** use Kaggle.

**Prerequisite:** Base data from `scripts/seed.py` (Dana and core fixtures).

**Example:**

```bash
cd backend
python scripts/seed_recruiter_dashboard.py --month 2026-03 --min-jobs 10
```

Use `python scripts/seed_recruiter_dashboard.py --help` for all flags.

---

## 3. Kaggle overview (course / project context)

The class materials (DATA236 §9) expect **at least one jobs dataset and one résumé dataset**. This repo wires:

| Role        | Kaggle dataset | Importer script |
|------------|----------------|-----------------|
| **Résumés** | [snehaanbhawal/resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset) | `backend/scripts/kaggle_resume_seed.py` |
| **Jobs**    | Typically one of: [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023) or [joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset) | `backend/scripts/kaggle_jobs_seed.py` |

**Optional résumé alternative** (not wired by default in this repo): [resume-classification-dataset-for-nlp](https://www.kaggle.com/datasets/hassnainzaidi/resume-classification-dataset-for-nlp).

Small demo jobs remain in **`seed.py`** (`JOB_SPECS`). Kaggle job import adds **bulk listings** for search and analytics at scale.

**Licenses:** Follow each dataset’s Kaggle license and your course rules for LinkedIn-derived data.

---

## 4. Kaggle API setup

### 4.1 Credentials

1. Sign in at [kaggle.com](https://www.kaggle.com) → **Account** → **API** → **Create New Token** (downloads `kaggle.json`).
2. **Recommended:** Place it at **`~/.kaggle/kaggle.json`** so the official Kaggle CLI finds it automatically.

### 4.2 Optional: `backend/.env`

You may store credentials in **`backend/.env`** (do **not** commit real secrets):

```bash
KAGGLE_USERNAME=your_kaggle_username
KAGGLE_KEY=your_kaggle_api_key
```

`KAGGLE_KEY` is the `"key"` field and `KAGGLE_USERNAME` is the `"username"` field from `kaggle.json`.

The **`kaggle` CLI does not load `.env` automatically.** Export variables before downloading, for example:

```bash
cd backend
set -a && source .env && set +a
```

Then run `kaggle datasets …` commands.

### 4.3 Install CLI

```bash
pip install kaggle
```

---

## 5. Résumé dataset — download and seed

### 5.1 Download files (from `backend/`)

Create the download folder and fetch the CSV:

```bash
mkdir -p data/kaggle/downloads
kaggle datasets download -d snehaanbhawal/resume-dataset -f Resume/Resume.csv -p data/kaggle/downloads
unzip -o data/kaggle/downloads/Resume.csv.zip -d data/kaggle/downloads
```

For **PDF uploads** (matches the default importer behavior when the PDF tree exists), download and unzip the **full** dataset so paths like `data/data/<Category>/<id>.pdf` exist:

```bash
kaggle datasets download -d snehaanbhawal/resume-dataset -p data/kaggle/downloads
unzip -o data/kaggle/downloads/resume-dataset.zip -d data/kaggle/downloads
```

Adjust inner zip names if Kaggle serves slightly different filenames. You want:

- **`Resume.csv`** under `backend/data/kaggle/downloads/` (or `Resume/Resume.csv` inside the archive — the script can resolve both).
- **`data/kaggle/downloads/data/data/<Category>/<id>.pdf`** for PDF-backed uploads.

### 5.2 What `kaggle_resume_seed.py` does

- Registers **member** accounts via Auth + Profile APIs.
- Prefers **PDF** from the full dataset tree; falls back to **HTML/text** from the CSV cell if needed.
- Builds headline, skills, experience/education when columns or parsed résumé text allow.
- Emails: **`kaggle_resume_<CSV_ID>@example.com`** (stable per row).
- **Password:** same as **`scripts/seed.py`** → **`SkillSync1!`** unless you changed `SEED_USER_PASSWORD` locally.

### 5.3 Run the résumé seed

```bash
cd backend
pip install httpx
python scripts/kaggle_resume_seed.py --csv data/kaggle/downloads/Resume.csv
```

**Useful flags** (see script header for the full list):

| Flag | Purpose |
|------|--------|
| `--limit N` | Process at most N rows |
| `--offset N` | Skip first N rows (batching / resume) |
| `--resume-upload csv-only` | Upload from CSV cell only (no PDF tree) |
| `--names-only` | Refresh **first_name / last_name** for existing `kaggle_resume_*@example.com` accounts only |

Example — names only:

```bash
python scripts/kaggle_resume_seed.py --names-only --csv data/kaggle/downloads/Resume.csv
```

---

## 6. Jobs dataset — download and seed

### 6.1 Download (examples)

```bash
mkdir -p data/kaggle/downloads/jobs
kaggle datasets download -d joykimaiyo18/linkedin-data-jobs-dataset -p data/kaggle/downloads/jobs
# or:
kaggle datasets download -d rajatraj0502/linkedin-job-2023 -p data/kaggle/downloads/jobs
```

Unzip into `data/kaggle/downloads/` or `data/kaggle/downloads/jobs/` as you prefer. Use the **actual** CSV filename from `ls` when passing `--csv` (do not rely on placeholder names).

### 6.2 What `kaggle_jobs_seed.py` does

- Calls **`POST /jobs/create`** (and related flows) on the **job** service.
- **LinkedIn Job 2023** style: expects **`job_postings.csv`** and optionally **`job_skills.csv`** (join on `job_id`).
- **Generic** CSVs (e.g. joykimaiyo18): maps flexible column aliases for title, description, location, salary, etc.
- **Default mode:** Alternates **Dana / Eli** and uses **Acme** `company_id` from **`seed.py`** → run **`python scripts/seed.py` first**.
- **Idempotency:** Imported job titles include a source **`[job_id]`** suffix so re-runs skip duplicates already owned by Dana/Eli.

### 6.3 Run the jobs seed

**Prerequisite:** Services up; **`python scripts/seed.py`** has created Dana, Eli, and Acme (for default mode).

Omitting **`--limit`** imports up to **10,000** job CSV rows per run (default cap). Use **`--limit 0`** for the entire file.

```bash
cd backend
pip install httpx

# Preview mapping (no API writes):
python scripts/kaggle_jobs_seed.py --dry-run --limit 5

# Import (example paths — adjust to your extracted CSV):
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv

# With optional skills file (LinkedIn Job 2023):
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv \
  --skills-csv data/kaggle/downloads/job_skills.csv

# Entire CSV:
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv --limit 0

# All jobs under Dana only:
python scripts/kaggle_jobs_seed.py --recruiter dana --limit 200
```

**Per-company recruiters** (`--per-company-recruiters`) — for CSVs with a **company / employer** column (typical for joykimaiyo18-style exports):

1. For each distinct employer, registers a new **recruiter** user.
2. Email pattern: **`{company_slug}_rec@example.com`** (with hash suffix if slugs collide).
3. Password: **`SkillSync1!`** (same as base seed).
4. Display name: **random synthetic person** per account; **company** name comes from the CSV.
5. Creates company + posts jobs for that recruiter.

Example:

```bash
python scripts/kaggle_jobs_seed.py \
  --csv data/kaggle/downloads/jobs/<your-actual-file>.csv \
  --per-company-recruiters --limit 100 --dry-run

python scripts/kaggle_jobs_seed.py \
  --csv data/kaggle/downloads/jobs/<your-actual-file>.csv \
  --per-company-recruiters --limit 10000
```

**Note:** `job_postings.csv` from **LinkedIn Job 2023** often has **no employer name** per row. For that file, omit `--per-company-recruiters` and use Dana/Eli, unless you join another source for `company_name`.

Job import requires the **job-service** Kafka consumer to process commands (same as creating jobs from the UI).

---

## 7. Local data and Git

- Large downloads live under **`backend/data/kaggle/`** by convention; keep datasets **local**.
- The repo **`.gitignore`** ignores `*.pdf`, `*.csv`, and `*.zip` globally so accidental commits of heavy files are avoided.
- Do not commit **Kaggle API keys** or real secrets.

---

## 8. Quick reference — scripts

| Script | Run from | Depends on | Purpose |
|--------|----------|------------|---------|
| `scripts/seed.py` | `backend/` | All services on default ports | Core SkillSync demo data |
| `scripts/seed_recruiter_dashboard.py` | `backend/` | `seed.py` (Dana) | Extra analytics / dashboard volume |
| `scripts/kaggle_resume_seed.py` | `backend/` | Services + `Resume.csv` (and optional PDF tree) | Bulk member résumés from Kaggle |
| `scripts/kaggle_jobs_seed.py` | `backend/` | Services + jobs CSV; `seed.py` for Dana/Eli mode | Bulk jobs from Kaggle |

---

## 9. Related documentation

- **`backend/SEED_INSTRUCTIONS.md`** — Step-by-step order: Docker, unzip, Kaggle imports, optional bulk SQL.
- **`README.md`** — Quick start including `python scripts/seed.py`.
- **`backend/backend.md`** — Local Docker setup and seeding snippet.

If service URLs or ports change on your machine, update the **`BASE`** URLs in `backend/scripts/seed.py` (shared by the other seeds that `import seed`).
