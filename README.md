# LinkedIn (class project)

A LinkedIn-style professional networking platform built as a distributed systems class project. This app lets members create profiles, connect with each other, browse and apply to jobs, message recruiters, and track their application pipeline. Recruiters can post listings, manage applicants, and communicate with candidates. Activity is streamed through Kafka and aggregated into an analytics layer in real time.

---

## Stack

| Layer | Technology |
|---|---|
| API framework | Python 3.11 + FastAPI |
| Relational DB | MySQL 8 |
| Document DB | MongoDB 7 |
| Cache / sessions | Redis 7 |
| Async events | Apache Kafka |
| Auth | JWT + bcrypt + Redis blacklist |
| Containerisation | Docker + Docker Compose |

---

## Services

| Service | Port | Purpose |
|---|---|---|
| auth | 3001 | Register, login, JWT tokens |
| profile | 3002 | Member profiles |
| recruiter | 3003 | Recruiter & company management |
| connection | 3004 | Connections between members |
| job | 3005 | Job listings, search, save |
| application | 3006 | Apply, track, status flow |
| messaging | 3007 | Threads and messages |
| analytics | 3008 | Event aggregations and dashboards |

---

## Docs

- [Backend setup & running locally](backend/backend.md)
- [Full API reference for frontend](backend/api.md)

---

## Quick Start

```bash
cd backend
docker compose up --build -d
python scripts/seed.py      # loads realistic test data
cd ../frontend
npm install
npm run dev
```

Swagger UI available at `localhost:300X/docs` for each service.

### Frontend with Docker

Run the Vite dev server (hot reload) in Docker:

```bash
cd frontend
docker compose up --build frontend-dev
```

Run a production-like build served by nginx:

```bash
cd frontend
docker compose up --build frontend
```

- Dev runs at `http://localhost:5173`
- Prod runs at `http://localhost:8080`

---

## Repo Layout

```text
<repository>/
├── backend/    # FastAPI services, Docker Compose, Kafka, DB init, seed script
└── frontend/   # React + Vite frontend
```

---

## Environment Setup

The backend `.env` file is committed in `backend/.env` since it only contains local Docker config — no real secrets or API keys. All services read their configuration (database hosts, ports, JWT secret, etc.) from that file at runtime.

If the frontend or any service adds a new port or variable, update `backend/.env` and commit it so everyone stays in sync. If you need to override something locally, change your local copy — just don't commit a value that only works on your machine.

---

## Contributing

### First-time setup

Clone the repo over SSH:

```bash
git clone git@github.com:KruthikaVirupakshappa/SkillSync.git linkedin-class-project
cd linkedin-class-project
```

(The remote repository name on GitHub may still be `SkillSync`; cloning into `linkedin-class-project` is optional but keeps your local folder aligned with the product name.)

### Every development session

Always start fresh from `main` before every new change — never reuse or continue from an old branch, even if the previous PR was just merged:

```bash
git checkout main
git pull origin main
git checkout -b feature-name

# examples:
# git checkout -b job-search-filter
# git checkout -b fix-application-withdraw
# git checkout -b analytics-dashboard
```

### Making changes

Work on your branch. When ready:

```bash
git add .
git commit -m "Short meaningful description of what and why"
git push -u origin feature-name
```

Write commits that explain *why*, not just *what* — e.g. `"Verify recruiter ownership before status update"` not `"fix bug"`.

### Opening a PR

After pushing, go to GitHub — you'll see a **"Compare & pull request"** banner. Click it, fill in what you changed and why, and open the PR against `main`.

> **Never push directly to `main`.** Always go through a branch and PR.

### PR process

1. CI runs tests automatically — wait for them to pass before requesting review
2. **At least one teammate must approve** before merging — give them a heads-up so it doesn't sit idle
3. **If your changes touch someone else's service or shared code**, loop them in and get their explicit OK even if CI passes — don't just merge and hope for the best
4. Once approved, use **Squash and Merge** to keep `main` history clean
5. After merging, let the team know — everyone should pull latest `main` before starting their next branch, and always create a fresh branch, never continue from the merged one

```bash
# after a PR is merged
git checkout main
git pull origin main
# start fresh for your next change
git checkout -b next-feature-name
```

### Keeping your branch in sync with main

If `main` moves while you're still working on your branch:

```bash
git checkout main
git pull origin main
git checkout your-feature-name
git merge main
```

Resolve any conflicts, then continue.

### Frontend
```bash
cd frontend && docker compose up frontend --build --rmi local -d
```

### Backend service (e.g. job-service)

```bash
cd backend && docker compose up job-service --build --rmi local -d
```