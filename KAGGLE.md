# Kaggle data import (SkillSync)

How teammates use **§9 Kaggle** jobs/resume CSVs with this repo **without committing datasets or PDFs to git**.

---

## What stays out of git

**You do not need to push CSV (or ZIP) files to git** for teammates to use Kaggle data. Same reasons as PDFs: size, **Kaggle dataset license / redistribution rules**, and everyone’s paths differ.

- **Do not commit** Kaggle **ZIPs**, unpacked **CSVs**, or **PDF** résumé exports.
- The repo **`.gitignore`** already excludes:
  - **`*.pdf` / `*.PDF`** anywhere in the tree
  - **`backend/data/kaggle/`** — recommended place to unzip downloads (`job_postings.csv`, `companies.csv`, `Resume.csv`, etc.)
- Each teammate **downloads from Kaggle locally** (or copies from shared storage **outside** git) and passes the real paths into `kaggle_import.py`.

**If CSVs were committed before** `.gitignore` was updated, remove them from the index (files stay on disk):

```bash
git rm -r --cached backend/data/kaggle/
git commit -m "Stop tracking local Kaggle data"
```

For tiny **project-owned** fixtures (not Kaggle), keep them under something like `backend/tests/fixtures/` (not under `backend/data/kaggle/`).

---

## Prerequisites

1. **Backend running** (Docker or local): auth/profile/job/application services reachable (see [backend/backend.md](backend/backend.md)).
2. **Seed once** (creates Acme, `dana@acme.com`, Alice/Bob/Charlie, demo jobs):

   ```bash
   cd backend
   python scripts/seed.py
   ```

3. **Python + httpx** (for the importer):

   ```bash
   pip install httpx
   ```

4. **Kaggle CLI** (optional but convenient) — [Kaggle API credentials](https://www.kaggle.com/docs/api):

   ```bash
   pip install kaggle
   # Place ~/.kaggle/kaggle.json with your API token
   ```

---

## Approved datasets (class doc §9)

Use CSVs **only** from these listings (names may vary slightly after unzip):

| Section | Purpose | Example Kaggle datasets |
|--------|---------|-------------------------|
| **§9.1 Jobs** | Job postings CSV | [linkedin-job-2023](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023), [linkedin-data-jobs-dataset](https://www.kaggle.com/datasets/joykimaiyo18/linkedin-data-jobs-dataset) |
| **§9.2 Resumes** | Profile / résumé text CSV | [resume-dataset](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset), [resume-classification-dataset-for-nlp](https://www.kaggle.com/datasets/hassnainzaidi/resume-classification-dataset-for-nlp) |

Importer logic lives in `backend/scripts/kaggle_import.py` (including column aliases and dedupe rules).

---

## Download datasets locally

Use the **gitignored** folder **`backend/data/kaggle/`** (created by you; not part of the repo) so large CSVs never show up in PRs.

Example with Kaggle CLI:

```bash
mkdir -p backend/data/kaggle/downloads
cd backend/data/kaggle/downloads

kaggle datasets download -d rajatraj0502/linkedin-job-2023
unzip -o '*.zip'

kaggle datasets download -d snehaanbhawal/resume-dataset
unzip -o '*.zip'
```

Then locate the real CSV paths (filenames differ by dataset version):

```bash
find . -name '*.csv' | head -40
```

---

## Run the importer

Always from **`backend/`** so imports resolve `scripts/` and service URLs from seed config:

```bash
cd backend
python scripts/kaggle_import.py \
  --jobs-csv /absolute/or/relative/path/to/job_postings.csv \
  --resumes-csv /absolute/or/relative/path/to/resumes.csv
```

### Useful flags

| Flag | Purpose |
|------|---------|
| `--jobs-csv` | Jobs CSV (§9.1). |
| `--resumes-csv` | Résumés / profile CSV (§9.2). |
| `--companies-csv` | Optional `companies.csv` for employer names (LinkedIn Job 2023 layout); if omitted, the script looks beside `--jobs-csv`. |
| `--recruiter-email` | Defaults to `dana@acme.com` — must match a seeded recruiter who owns imported jobs. |
| `--password` | Matches seed password (see `backend/scripts/seed.py` / your `.env`). |
| `--max-job-rows` | Cap rows processed from jobs CSV (default in script: **500**; raise for larger imports, e.g. `12000`). |
| `--max-resume-rows` | Cap rows from résumé CSV (default **300**). |
| `--analytics` | Optional synthetic Mongo events for dashboard charts — **not** from Kaggle; omit unless you want filler analytics. |
| `--dry-run` | Print one mapped jobs row and/or one mapped résumé row as JSON; **no** HTTP writes. |

You may pass **only** `--jobs-csv` or **only** `--resumes-csv`.

---

## How imports map (Option 1)

- **Jobs** → created via job service for the seed recruiter’s `company_id`; dedupe uses **title + location**. Descriptions can get a leading `[employer:…]` line for UI display while `company_id` stays the seed org.
- **Résumé rows** → rotate across seeded members **Alice, Bob, Charlie** (`/members/update`): summary, headline, skills, location fields, depending on CSV columns.
- **Optional PDF columns**: if a row has `resume_pdf_url`, `pdf_url`, `resume_file_url`, or `cv_pdf_url` with an **https** URL returning a real **PDF** (`%PDF` header, ≤ 5MB), the script streams bytes in memory and uploads via **`uploadResumeFile`** (Mongo GridFS). Most §9.2 CSVs are **text-only**; no PDF folder is written by the importer.
- **Text-only rows** update **summary / headline / skills / location** only; they **do not** delete an existing profile PDF (class doc §4.1: PDF **or** extracted text — both can coexist). Remove a test PDF manually in the UI if you want text-only display.

---

## Troubleshooting

- **“CSV not found”** — expand `~` paths; run `find` in your download folder and paste the **exact** filename.
- **401 / login** — seed must exist; password must match `--password` / env used by `seed.py`.
- **MySQL `resume_text` column** — new installs get it from `backend/database/mysql/init.sql`. If an **old** DB was created before that column existed, run once against `linkedin_db`:
  `ALTER TABLE applications ADD COLUMN resume_text TEXT NULL AFTER resume_url;`  
  (Skip if MySQL reports “Duplicate column name”.)

---

## One-liner reference

```bash
cd backend && python scripts/kaggle_import.py --jobs-csv PATH/to/jobs.csv --resumes-csv PATH/to/resumes.csv
```

For authoritative column mapping and edge cases, read the module docstring in `backend/scripts/kaggle_import.py`.
