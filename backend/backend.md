# LinkedIn (class project) — Backend Developer Guide

## Architecture

8 independent FastAPI microservices, each in its own Docker container.

| Service | Port | Database | Purpose |
|---|---|---|---|
| auth_service | 3001 | MySQL + Redis | Register, login, JWT tokens |
| profile_service | 3002 | MySQL + MongoDB | Member profiles |
| recruiter_service | 3003 | MySQL | Recruiter & company management |
| connection_service | 3004 | MySQL | Connections between members |
| job_service | 3005 | MySQL + Redis | Job listings |
| application_service | 3006 | MySQL | Job applications |
| messaging_service | 3007 | MongoDB | Threads and messages |
| analytics_service | 3008 | MongoDB + Redis | Event analytics |

**Shared infrastructure:** MySQL 8, MongoDB 6, Redis 7, Kafka (KRaft mode, no Zookeeper)

---

## Prerequisites

- Docker Desktop (running)
- Python 3.11+ (for running tests locally only)
- Git

---

## Running Locally

### Start everything

```bash
cd backend   # from your clone of the repository
docker compose up --build
```

First build: ~5–10 minutes (pulls base images, installs Python packages).  
Subsequent starts: ~30 seconds.

### Background mode

```bash
docker compose up --build -d
docker compose logs -f              # stream all logs
docker compose logs -f job_service  # stream one service
```

`mysql-init` and `mongo-init` run automatically in this mode and apply:
- `database/mysql/init.sql` to local MySQL (`host.docker.internal:3306`)
- `database/mongodb/init.js` to local MongoDB (`host.docker.internal:27017`)

This creates `linkedin_db` and required schema/indexes through code.

### Stop

```bash
docker compose down          # stop containers, keep data volumes
docker compose down -v       # stop and wipe all data (fresh start)
```

### GUI tools (MySQL Workbench, MongoDB Compass)

SkillSync is configured in "Yelp-style" mode: Docker runs app services, while MySQL/Mongo come from your existing local/Homebrew instances.

| | Host connection | Database |
|---|-----------------|----------|
| MySQL | Local socket `/tmp/mysql.sock` or `127.0.0.1:3306` | `linkedin_db` — user **`root`**, password from `backend/.env` |
| MongoDB | `mongodb://127.0.0.1:27017/linkedin_db` | same |

Step-by-step: `database/GUI_CLIENTS.txt`. Quick check: `bash backend/scripts/show_db_endpoints.sh`

### Rebuild a single service after code changes

```bash
docker compose up --build job_service
```

---

## Verify All Services Are Up

```bash
for port in 3001 3002 3003 3004 3005 3006 3007 3008; do
  echo -n "Port $port: "
  curl -s http://localhost:$port/health | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])"
done
```

All should print `ok`.

---

## Interactive API Docs (Swagger UI)

FastAPI auto-generates docs for every service. Open in browser after `docker compose up`:

| Service | URL |
|---|---|
| Auth | http://localhost:3001/docs |
| Profile | http://localhost:3002/docs |
| Recruiter | http://localhost:3003/docs |
| Connection | http://localhost:3004/docs |
| Job | http://localhost:3005/docs |
| Application | http://localhost:3006/docs |
| Messaging | http://localhost:3007/docs |
| Analytics | http://localhost:3008/docs |

### Authenticating in Swagger

1. POST `/auth/register` — create an account
2. POST `/auth/login` — copy the `token` from the response
3. Click **Authorize** (top-right lock icon) → enter `Bearer <your_token>`
4. All subsequent calls will include the token automatically

---

## Running Tests

Tests mock all infrastructure — no Docker required.

```bash
# Install test deps (once per service)
cd backend/services/job_service && pip install -r requirements.txt
cd backend/services/application_service && pip install -r requirements.txt
cd backend/services/messaging_service && pip install -r requirements.txt

# Run (PYTHONPATH must include the backend folder for `shared`)
cd backend/services/job_service && PYTHONPATH=../.. pytest tests/ -v
cd backend/services/application_service && PYTHONPATH=../.. pytest tests/ -v
cd backend/services/messaging_service && PYTHONPATH=../.. pytest tests/ -v
```

---

## Seeding Mock Data

A seed script is included to create users, profiles, jobs, connections, applications, and messages for manual testing:

```bash
# Services must be running first
docker compose up -d

pip install httpx
python scripts/seed.py
```

The script prints all created IDs and the tokens you can paste into Swagger.

---

## Environment Variables

Defined in `.env` at the project root. Key variables:

```
MYSQL_HOST=host.docker.internal
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=<same as MYSQL_ROOT_PASSWORD>
MYSQL_DATABASE=linkedin_db

MONGO_URI=mongodb://host.docker.internal:27017
MONGO_DB=linkedin_db

REDIS_HOST=redis
REDIS_PORT=6379

KAFKA_BROKER=kafka:9092

JWT_SECRET=changeme-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRY_HOURS=24
```

---

## Project Structure

```
backend/
├── docker-compose.yml
├── .env
├── database/
│   ├── mysql/init.sql          # Schema — runs automatically on first start
│   └── mongodb/init.js         # Indexes — runs automatically on first start
├── shared/                     # Shared Python package (importable by all services)
│   ├── database/               # MySQL pool, MongoDB motor client
│   ├── kafka_utils/            # Producer, consumer, envelope builder, topic constants
│   ├── redis_utils/            # Redis client, cache helpers
│   ├── middleware/             # JWT auth, error handler, request logger
│   └── utils/                  # Trace ID, idempotency, validation
├── services/
│   ├── auth_service/
│   ├── profile_service/
│   ├── recruiter_service/
│   ├── connection_service/
│   ├── job_service/
│   ├── application_service/
│   ├── messaging_service/
│   └── analytics_service/
└── scripts/
    └── seed.py
```

Each service follows the same layout:

```
<service>/
├── Dockerfile
├── requirements.txt
├── pytest.ini
├── main.py              # FastAPI app + lifespan
├── routes/              # URL handlers (thin — just call controllers)
├── controllers/         # Business logic
├── models/              # Database queries
├── schemas/             # Pydantic request models
├── producers/           # Kafka event emitters
└── consumers/           # Kafka event consumers (where applicable)
```

---

## Key Design Decisions

| Decision | Detail |
|---|---|
| All endpoints POST | Consistent with the spec; body carries all parameters |
| JWT + Redis blacklist | Logout invalidates tokens immediately via Redis TTL |
| Redis caching | Job get: 300s TTL. Job search: 120s TTL. Analytics dashboards: 300s TTL |
| FOR UPDATE lock | Application submission uses MySQL row lock to prevent race conditions |
| Status machine | `VALID_TRANSITIONS` dict enforces legal application status flow |
| Withdraw = status update | Withdrawn applications are kept in DB for audit trail and analytics |
| Kafka idempotency | Redis SET NX on `idempotency_key` prevents duplicate event processing |
| asyncio.create_task | Fire-and-forget Kafka events (e.g. job view tracking) don't block the response |

---

## CI / CD

GitHub Actions workflows live in `.github/workflows/`.

- `ci.yml` — runs all 3 tested services in parallel on every push/PR to `main`
- Per-service workflows trigger only when that service or `shared/` changes

Free tier: 2,000 minutes/month on private repos (~2,000 test runs).
