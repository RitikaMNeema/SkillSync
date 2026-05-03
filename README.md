# LinkedIn

A LinkedIn-style professional networking platform built as a distributed systems class project. Members can create profiles, connect with each other, browse and apply to jobs, message recruiters, and track their application pipeline. Recruiters can post listings, manage applicants, and communicate with candidates. An AI layer powered by Ollama provides job-match recommendations and applicant screening. Activity is streamed through Kafka and aggregated into an analytics layer in real time.

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
| AI | Ollama (llama3.2:3b + nomic-embed-text) |
| Containerisation | Docker + Docker Compose |
| Frontend | React + Vite + TypeScript |

---

## Services

| Service | Port | Purpose |
|---|---|---|
| auth | 3001 | Register, login, JWT tokens |
| profile | 3002 | Member profiles, posts, resume |
| recruiter | 3003 | Recruiter & company management |
| connection | 3004 | Connections between members |
| job | 3005 | Job listings, search, save, benefits |
| application | 3006 | Apply, track, status flow |
| messaging | 3007 | Threads and messages |
| analytics | 3008 | Event aggregations and dashboards |
| ai | 3010 | Ollama-powered job match & applicant screening |

---

## Docs

- [Backend setup & running locally](backend/backend.md)
- [Full API reference for frontend](backend/api.md)
- [Kaggle dataset import (résumés & jobs)](backend/kaggle.md)

---

## Quick Start

```bash
cd backend
docker compose up --build -d
python scripts/seed.py          # loads realistic test data
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
├── backend/
│   ├── services/       # auth, profile, recruiter, connection, job,
│   │                   # application, messaging, analytics, ai
│   ├── shared/         # database, kafka_utils, middleware, redis_utils, utils
│   ├── tests/
│   │   ├── unit/       # connection controller unit tests
│   │   ├── api/        # connection route tests
│   │   └── integration/# end-to-end job-apply and connection flows
│   ├── scripts/        # seed data, Kaggle import, backfill scripts
│   ├── database/       # MySQL init SQL + migrations
│   └── docker-compose.yml
└── frontend/           # React + Vite + TypeScript
```

---

## Testing

All unit and API tests run offline (no Docker required):

```bash
cd backend

# Connection service tests
PYTHONPATH=.:./services/connection_service \
  python3 -m pytest tests/unit/ tests/api/ services/connection_service/tests/ -v

# Job service tests
PYTHONPATH=. python3 -m pytest services/job_service/tests/ -v

# Application service tests
PYTHONPATH=. python3 -m pytest services/application_service/tests/ -v

# Analytics + messaging tests
PYTHONPATH=. python3 -m pytest services/analytics_service/tests/ services/messaging_service/tests/ -v
```

Integration tests require all services running (`docker compose up -d`):

```bash
cd backend
PYTHONPATH=. python3 -m pytest tests/integration/ -v
```

---

## Environment Setup

Configuration uses a layered `.env` approach — Docker Compose loads all three files in order, later files win:

| File | Committed | Purpose |
|---|---|---|
| `backend/.env.example` | ✅ yes | Safe defaults for every variable — the source of truth |
| `backend/.env` | optional | Shared overrides for the team (commit only non-secret values) |
| `backend/.env.local` | ❌ gitignored | Your personal secrets; stable across branch switches |

**First-time setup** — copy the example to your local file once and leave it there:

```bash
cp backend/.env.example backend/.env.local
# edit .env.local to set your own passwords if desired
```

All services read configuration (database hosts, ports, JWT secret, Ollama URL, etc.) from these files at runtime. The infra containers publish on non-default host ports to avoid conflicts with other local stacks:

| Service | Host port | Container port |
|---|---|---|
| MySQL | 3310 | 3306 |
| MongoDB | 27018 | 27017 |
| Redis | 6380 | 6379 |
| Kafka | 9094 | 9093 |

If you add a new port or variable, update `backend/.env.example` and commit it so everyone stays in sync. Never commit `backend/.env.local`.

---

## Contributing

### First-time setup

Clone the repo over SSH:

```bash
git clone git@github.com:KruthikaVirupakshappa/SkillSync.git skillsync
cd skillsync
```

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

### Rebuilding a single service

```bash
# Frontend
cd frontend && docker compose up frontend --build --rmi local -d

# Any backend service (e.g. job-service)
cd backend && docker compose up job-service --build --rmi local -d
```
