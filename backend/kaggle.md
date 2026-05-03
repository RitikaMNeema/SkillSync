# Kaggle datasets — first-time setup (DATA236 §9)

Course reference: **Class Project Description — LinkedIn + Agentic AI**, §9 *Datasets*. Use **at least one jobs dataset and one résumé dataset**; you may add synthetic values for missing fields.

## Résumés (required pipeline)

This repo imports **[snehaanbhawal/resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset)** via `scripts/kaggle_resume_seed.py`. Steps below cover API keys, download, and seeding.

## Jobs (course-approved sources — choose one or more)

Per §**9.1 Jobs datasets**, approved Kaggle sources include:

| Dataset | Kaggle link |
|--------|-------------|
| **LinkedIn Job 2023** | [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023) |
| **LinkedIn Data Jobs Dataset** | [joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset) |

Download either (or both) with the same Kaggle CLI credentials as below, e.g.:

```bash
mkdir -p data/kaggle/downloads/jobs
kaggle datasets download -d joykimaiyo18/linkedin-data-jobs-dataset -p data/kaggle/downloads/jobs
# or:
kaggle datasets download -d rajatraj0502/linkedin-job-2023 -p data/kaggle/downloads/jobs
```

Unzip each archive into `data/kaggle/downloads/` or `data/kaggle/downloads/jobs/` as you prefer.

**Integrated importer:** `scripts/kaggle_jobs_seed.py` reads **LinkedIn Job 2023**-style `job_postings.csv` (+ optional `job_skills.csv`) or a **generic** jobs CSV (column aliases for title/description/location/salary). It creates rows through **`POST /jobs/create`** using **Dana / Eli** recruiters and **Acme** `company_id` from `scripts/seed.py`. Run **`python scripts/seed.py` first** so those accounts exist.

Small demo jobs still come from **`scripts/seed.py`** (`JOB_SPECS`); the Kaggle importer adds bulk listings for search/analytics scale targets (§11).

**Optional résumé alternatives** from §9.2 (not wired in this repo by default): [resume-classification-dataset-for-nlp](https://www.kaggle.com/datasets/hassnainzaidi/resume-classification-dataset-for-nlp).

## 1. Kaggle API credentials

1. Sign in at [kaggle.com](https://www.kaggle.com), open **Account** → **API** → **Create New Token**. That downloads `kaggle.json`.
2. **Recommended for CLI:** put the file at `~/.kaggle/kaggle.json` (create `~/.kaggle` if needed). The official Kaggle CLI reads it automatically.

### Declaring credentials in `backend/.env` (optional)

If you prefer not to rely on `~/.kaggle/kaggle.json`, add these variables to **`backend/.env`** (create the file from `.env.example` if needed). **Do not commit real keys.**

```bash
# Kaggle API (used by the `kaggle` CLI when exported into the shell)
KAGGLE_USERNAME=your_kaggle_username
KAGGLE_KEY=your_kaggle_api_key
```

The API key is the string labeled `"key"` inside `kaggle.json`; the username is the `"username"` field.

The Kaggle CLI reads **`KAGGLE_USERNAME`** and **`KAGGLE_KEY`** from the environment. `.env` is **not** loaded automatically by the bare `kaggle` command, so before downloading you must export the variables, for example from `backend/`:

```bash
set -a
source .env
set +a
```

(or use any tool you already use to load `backend/.env` into your shell). After that, `kaggle datasets …` commands below will authenticate.

## 2. Install the Kaggle CLI

```bash
pip install kaggle
```

## 3. Download the résumé dataset files

From **`backend/`**, create the download folder and fetch the CSV (and unzip):

```bash
mkdir -p data/kaggle/downloads
kaggle datasets download -d snehaanbhawal/resume-dataset -f Resume/Resume.csv -p data/kaggle/downloads
unzip -o data/kaggle/downloads/Resume.csv.zip -d data/kaggle/downloads
```

For **PDF uploads** (default seed behavior), you need the full archive so `data/data/<Category>/<ID>.pdf` exists next to the CSV:

```bash
kaggle datasets download -d snehaanbhawal/resume-dataset -p data/kaggle/downloads
unzip -o data/kaggle/downloads/resume-dataset.zip -d data/kaggle/downloads
```

Adjust the inner zip name if Kaggle serves a slightly different filename; you want **`Resume.csv`** under `data/kaggle/downloads/` and **`data/kaggle/downloads/data/data/<Category>/<id>.pdf`**.

## 4. Run the microservices

The seed script calls Auth and Profile (and checks other services). Start your stack the way your team documents (for example Docker Compose from `backend/`), then wait until APIs respond.

## 5. Seed members

From **`backend/`**:

```bash
pip install httpx
python scripts/kaggle_resume_seed.py --csv data/kaggle/downloads/Resume.csv
```

Default password for seeded accounts matches `scripts/seed.py` (see `SEED_USER_PASSWORD` there). Emails look like **`kaggle_resume_<CSV_ID>@example.com`**.

### Refresh names only (existing accounts)

```bash
python scripts/kaggle_resume_seed.py --names-only --csv data/kaggle/downloads/Resume.csv
```

## 6. Seed jobs (Kaggle CSV → APIs)

**Prerequisite:** microservices up; **`python scripts/seed.py`** has created Dana (`dana@acme.com`) and Eli (`eli@acme.com`) plus **Acme Corp**.

Place **`job_postings.csv`** (and **`job_skills.csv`** if you use LinkedIn Job 2023) under `data/kaggle/downloads/` — matching [rajatraj0502/linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023). For [joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset), pass `--csv /path/to/export.csv`; the script uses **generic** column mapping when headers don’t match the 2023 schema.

```bash
pip install httpx
# Preview mapping (no API calls):
python scripts/kaggle_jobs_seed.py --dry-run --limit 5

# Import 500 rows (default), alternating Dana / Eli:
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv

# Optional skills join (same folder by default):
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv --skills-csv data/kaggle/downloads/job_skills.csv

# Large batches: --limit 0 means entire CSV; --offset N to resume chunks
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/job_postings.csv --limit 0

# All jobs attributed to one recruiter:
python scripts/kaggle_jobs_seed.py --recruiter dana --limit 200
```

Rows are **idempotent** by title: titles include the source **`[job_id]`** suffix so re-runs skip jobs already present for Dana/Eli.

### One recruiter + company per employer (joykimaiyo18-style)

For **[joykimaiyo18/linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset)** (and similar CSVs with a **company / employer** column), use **`--per-company-recruiters`**:

1. The script finds **distinct company names** in the batch.
2. For each employer it **registers** a new auth user (`role: recruiter`) with email **`{company_slug}_rec@example.com`** (e.g. `google_rec@example.com`; if two employers collide on slug, a short hash is inserted before `_rec`). Password is always **`SkillSync1!`** (same as `scripts/seed.py` / `SEED_USER_PASSWORD`), unless you changed it locally. Recruiter **display name** is a **random synthetic person name** (unique per account); the **company** record still uses the CSV employer name.
3. It calls **`POST /recruiters/create`** with a new **`companies`** row (`name`, `industry`, `size`, optional HQ `location` from the CSV when columns exist).
4. Each job row is posted with that company’s **`company_id`** and the new recruiter’s **`recruiter_id`**.

After `unzip`, use the **actual** CSV filename from `ls data/kaggle/downloads/jobs` (do not copy placeholder names):

```bash
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/jobs/<actual-file-from-kaggle>.csv --per-company-recruiters --limit 100 --dry-run
python scripts/kaggle_jobs_seed.py --csv data/kaggle/downloads/jobs/<actual-file-from-kaggle>.csv --per-company-recruiters --limit 500
```

**Note:** `job_postings.csv` from **LinkedIn Job 2023** often has **no employer name** in-row; for that file, omit `--per-company-recruiters` and keep Dana/Eli, or join another table that supplies `company_name`.

## 7. Notes

- `backend/data/kaggle/` is gitignored; datasets stay local.
- If `kaggle` reports authentication errors, verify `~/.kaggle/kaggle.json` **or** exported `KAGGLE_USERNAME` / `KAGGLE_KEY` from `backend/.env`.
- Profile uploads require the Profile service to allow resume MIME types configured for your branch (PDF and, if applicable, HTML/text fallbacks).
- Follow each dataset’s **Kaggle license** and course rules for LinkedIn-derived data.
- Job import requires the **job-service** consumer to process Kafka commands (same as normal UI creates).
