# LinkedIn (class project) API Reference

## Conventions

- **All endpoints accept and return JSON**
- **All endpoints use HTTP POST**
- **Base URLs:** each service runs on its own port (see table below)
- **Auth:** include `Authorization: Bearer <token>` header on all endpoints except `/auth/register`, `/auth/login`, `/auth/validate`
- **Response envelope:**
  ```json
  { "success": true, "data": { ... } }
  { "success": false, "error": "message" }
  ```

| Service | Base URL |
|---|---|
| Auth | `http://localhost:3001` |
| Profile | `http://localhost:3002` |
| Recruiter | `http://localhost:3003` |
| Connection | `http://localhost:3004` |
| Job | `http://localhost:3005` |
| Application | `http://localhost:3006` |
| Messaging | `http://localhost:3007` |
| Analytics | `http://localhost:3008` |

---

## Auth Service — `localhost:3001`

### POST /auth/register
Create a new user account. Returns the user ID and role.

**No auth required.**

```json
// Request
{
  "email": "alice@example.com",
  "password": "secret123",
  "role": "member"        // "member" | "recruiter"
}

// Response 201
{
  "success": true,
  "data": { "user_id": 1, "email": "alice@example.com", "role": "member" }
}
```

**Errors:** `409` email already registered

---

### POST /auth/login
Authenticate and receive a JWT token.

**No auth required.**

```json
// Request
{ "email": "alice@example.com", "password": "secret123" }

// Response 200
{
  "success": true,
  "data": { "token": "eyJhbGci...", "user_id": 1, "role": "member" }
}
```

**Errors:** `401` invalid credentials

---

### POST /auth/logout
Invalidate the current token (adds to Redis blacklist).

**Header:** `Authorization: Bearer <token>`

```json
// Request — empty body {}

// Response 200
{ "success": true, "data": { "logged_out": true } }
```

---

### POST /auth/validate
Check if a token is valid and not blacklisted.

**No auth required.**

```json
// Request
{ "token": "eyJhbGci..." }

// Response 200
{ "success": true, "data": { "user_id": 1, "role": "member", "email": "alice@example.com" } }
```

**Errors:** `401` invalid or expired token

---

## Profile Service — `localhost:3002`

### POST /members/create
Create a member profile. `member_id` must match a registered user's ID from auth service.

```json
// Request
{
  "member_id": 1,
  "first_name": "Alice",
  "last_name": "Smith",
  "headline": "Software Engineer at Google",
  "location_city": "San Francisco",
  "location_state": "CA",
  "location_country": "US",
  "skills": ["Python", "React", "Docker"],
  "experience": [
    { "title": "SWE", "company": "Google", "start": "2021-01", "end": null }
  ],
  "education": [
    { "school": "UC Berkeley", "degree": "BS Computer Science", "year": 2021 }
  ],
  "summary": "Passionate engineer...",
  "about": "I love building distributed systems."
}

// Response 201
{ "success": true, "data": { "member_id": 1, "first_name": "Alice", ... } }
```

---

### POST /members/get

```json
// Request
{ "member_id": 1 }

// Response 200
{
  "success": true,
  "data": {
    "member_id": 1, "first_name": "Alice", "last_name": "Smith",
    "headline": "Software Engineer at Google",
    "location_city": "San Francisco", "location_state": "CA",
    "skills": ["Python", "React", "Docker"],
    "connection_count": 12,
    "resume_url": null,
    "experience": [...], "education": [...]
  }
}
```

**Errors:** `404` member not found

---

### POST /members/update

```json
// Request — only include fields to change
{
  "member_id": 1,
  "headline": "Senior SWE",
  "skills": ["Python", "React", "Docker", "Kubernetes"]
}

// Response 200
{ "success": true, "data": { "member_id": 1, "headline": "Senior SWE", ... } }
```

---

### POST /members/delete

```json
// Request
{ "member_id": 1 }

// Response 200
{ "success": true, "data": { "deleted": true } }
```

---

### POST /members/search

```json
// Request
{ "keyword": "engineer", "skill": "Python", "location": "San Francisco", "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "members": [ { "member_id": 1, "first_name": "Alice", ... } ],
    "total": 1, "page": 1, "page_size": 20
  }
}
```

---

### POST /members/uploadResume

```json
// Request
{ "member_id": 1, "resume_url": "https://s3.amazonaws.com/bucket/alice-resume.pdf" }

// Response 200
{ "success": true, "data": { "member_id": 1, "resume_url": "https://..." } }
```

---

### POST /members/getResume

```json
// Request
{ "member_id": 1 }

// Response 200
{ "success": true, "data": { "member_id": 1, "resume_url": "https://..." } }
```

---

## Recruiter Service — `localhost:3003`

### POST /recruiters/create
Create a recruiter profile. Pass either `company_id` (existing) or `company` (new company to create).

```json
// Request — new company
{
  "recruiter_id": 2,
  "name": "Bob HR",
  "email": "bob@acme.com",
  "role": "Senior Recruiter",
  "company": { "name": "Acme Corp", "industry": "Technology", "size": "1000-5000" }
}

// Request — existing company
{
  "recruiter_id": 2,
  "name": "Bob HR",
  "email": "bob@acme.com",
  "company_id": 1
}

// Response 201
{
  "success": true,
  "data": { "recruiter_id": 2, "name": "Bob HR", "company_id": 1, "company_name": "Acme Corp" }
}
```

---

### POST /recruiters/get

```json
// Request
{ "recruiter_id": 2 }

// Response 200
{
  "success": true,
  "data": {
    "recruiter_id": 2, "name": "Bob HR", "email": "bob@acme.com",
    "role": "Senior Recruiter", "company_id": 1, "company_name": "Acme Corp",
    "industry": "Technology"
  }
}
```

---

### POST /recruiters/update

```json
// Request
{ "recruiter_id": 2, "role": "Lead Recruiter" }

// Response 200
{ "success": true, "data": { "recruiter_id": 2, "role": "Lead Recruiter", ... } }
```

---

### POST /recruiters/search

```json
// Request
{ "company": "Acme", "industry": "Technology", "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "recruiters": [ { "recruiter_id": 2, "name": "Bob HR", ... } ],
    "total": 1, "page": 1, "page_size": 20
  }
}
```

---

### POST /recruiters/byCompany

```json
// Request
{ "company_id": 1, "page": 1 }

// Response 200
{ "success": true, "data": { "recruiters": [...], "total": 1, "page": 1, "page_size": 20 } }
```

---

## Connection Service — `localhost:3004`

### POST /connections/request

```json
// Request
{ "requester_id": 1, "receiver_id": 3 }

// Response 201
{ "success": true, "data": { "request_id": 5, "status": "pending" } }
```

**Errors:** `400` self-connection, `409` request already exists

---

### POST /connections/accept

```json
// Request
{ "request_id": 5 }

// Response 200
{ "success": true, "data": { "request_id": 5, "status": "accepted" } }
```

---

### POST /connections/reject

```json
// Request
{ "request_id": 5 }

// Response 200
{ "success": true, "data": { "request_id": 5, "status": "rejected" } }
```

---

### POST /connections/list

```json
// Request
{ "user_id": 1 }

// Response 200
{
  "success": true,
  "data": [
    { "user_id": 3, "connected_at": "2026-01-15T10:00:00" }
  ]
}
```

---

### POST /connections/pending
Returns incoming pending requests for a user.

```json
// Request
{ "user_id": 1 }

// Response 200
{
  "success": true,
  "data": [
    { "request_id": 6, "requester_id": 4, "created_at": "2026-01-20T09:00:00" }
  ]
}
```

---

### POST /connections/mutual

```json
// Request
{ "user_id_1": 1, "user_id_2": 3 }

// Response 200
{ "success": true, "data": { "mutual_connections": [5, 7] } }
```

---

### POST /connections/remove

```json
// Request
{ "user_id_1": 1, "user_id_2": 3 }

// Response 200
{ "success": true, "data": { "removed": true } }
```

---

## Job Service — `localhost:3005`

### POST /jobs/create

```json
// Request
{
  "company_id": 1,
  "recruiter_id": 2,
  "title": "Senior Backend Engineer",
  "description": "Build scalable APIs...",
  "work_mode": "remote",         // "remote" | "hybrid" | "onsite"
  "employment_type": "full-time",
  "seniority_level": "senior",
  "location": "San Francisco, CA",
  "skills_required": ["Python", "FastAPI", "Kafka"],
  "salary_min": 150000,
  "salary_max": 200000
}

// Response 201
{
  "success": true,
  "data": {
    "job_id": 10, "title": "Senior Backend Engineer", "status": "open",
    "work_mode": "remote", "views_count": 0, "applicants_count": 0,
    "company_name": "Acme Corp", ...
  }
}
```

---

### POST /jobs/get

```json
// Request
{ "job_id": 10 }

// Response 200
{ "success": true, "data": { "job_id": 10, "title": "...", "status": "open", ... } }
```

**Errors:** `404` job not found

---

### POST /jobs/update

```json
// Request — only include fields to change
{ "job_id": 10, "title": "Staff Backend Engineer", "salary_max": 220000 }

// Response 200
{ "success": true, "data": { "job_id": 10, "title": "Staff Backend Engineer", ... } }
```

---

### POST /jobs/search

```json
// Request — all fields optional
{
  "keyword": "backend",
  "location": "San Francisco",
  "employment_type": "full-time",
  "work_mode": "remote",
  "industry": "Technology",
  "page": 1
}

// Response 200
{
  "success": true,
  "data": {
    "jobs": [ { "job_id": 10, "title": "...", "company_name": "Acme Corp", ... } ],
    "total": 1, "page": 1, "page_size": 20
  }
}
```

---

### POST /jobs/close
Closes a job listing. Triggers auto-rejection of pending applications via Kafka.

```json
// Request
{ "job_id": 10 }

// Response 200
{ "success": true, "data": { "job_id": 10, "status": "closed" } }
```

**Errors:** `400` already closed, `404` not found

---

### POST /jobs/byRecruiter

```json
// Request
{ "recruiter_id": 2, "page": 1 }

// Response 200
{ "success": true, "data": { "jobs": [...], "total": 3, "page": 1, "page_size": 20 } }
```

---

### POST /jobs/save
Save a job to a member's saved list.

```json
// Request
{ "member_id": 1, "job_id": 10 }

// Response 201
{ "success": true, "data": { "member_id": 1, "job_id": 10, "saved": true } }
```

**Errors:** `409` already saved

---

### POST /jobs/unsave

```json
// Request
{ "member_id": 1, "job_id": 10 }

// Response 200
{ "success": true, "data": { "member_id": 1, "job_id": 10, "saved": false } }
```

---

### POST /jobs/savedByMember

```json
// Request
{ "member_id": 1, "page": 1 }

// Response 200
{ "success": true, "data": { "jobs": [...], "total": 2, "page": 1, "page_size": 20 } }
```

---

### POST /jobs/trackView
Fire-and-forget view tracking. Increments `views_count` and emits Kafka event.

```json
// Request
{ "job_id": 10, "viewer_id": 1 }

// Response 200
{ "success": true, "data": { "job_id": 10, "tracked": true } }
```

---

## Application Service — `localhost:3006`

### Application Status Flow
```
submitted → reviewing → interview → offer
     ↓           ↓          ↓        ↓
  rejected    rejected   rejected  rejected
     ↓           ↓          ↓        ↓
  withdrawn   withdrawn  withdrawn withdrawn
```

---

### POST /applications/submit

```json
// Request
{
  "job_id": 10,
  "member_id": 1,
  "resume_url": "https://s3.amazonaws.com/bucket/resume.pdf",
  "cover_letter": "I am excited to apply...",
  "answers": { "years_experience": "5", "available": "immediately" }
}

// Response 201
{ "success": true, "data": { "application_id": 20, "job_id": 10, "member_id": 1, "status": "submitted" } }
```

**Errors:** `400` job is closed, `404` job not found, `409` already applied

---

### POST /applications/get

```json
// Request
{ "application_id": 20 }

// Response 200
{
  "success": true,
  "data": {
    "application_id": 20, "job_id": 10, "member_id": 1,
    "status": "submitted", "application_datetime": "2026-01-20T10:00:00",
    "job_title": "Senior Backend Engineer", "company_name": "Acme Corp",
    "notes": []
  }
}
```

---

### POST /applications/byJob

```json
// Request
{ "job_id": 10, "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "applications": [ { "application_id": 20, "member_id": 1, "status": "submitted", ... } ],
    "total": 1, "page": 1, "page_size": 20
  }
}
```

---

### POST /applications/byMember

```json
// Request
{ "member_id": 1, "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "applications": [ { "application_id": 20, "job_title": "Senior Backend Engineer", "status": "submitted", ... } ],
    "total": 1, "page": 1, "page_size": 20
  }
}
```

---

### POST /applications/updateStatus
**Recruiter only.** JWT user must be the recruiter who owns the job.

```json
// Request
{ "application_id": 20, "new_status": "reviewing" }

// Response 200
{ "success": true, "data": { "application_id": 20, "old_status": "submitted", "new_status": "reviewing" } }
```

**Errors:** `400` invalid transition, `403` not the job's recruiter, `404` not found

---

### POST /applications/withdraw
**Member only.** JWT user must be the applicant.

```json
// Request
{ "application_id": 20 }

// Response 200
{ "success": true, "data": { "application_id": 20, "old_status": "submitted", "new_status": "withdrawn" } }
```

**Errors:** `400` already rejected/withdrawn, `403` not the applicant

---

### POST /applications/addNote
Add a private recruiter note to an application.

```json
// Request
{ "application_id": 20, "recruiter_id": 2, "note_text": "Strong candidate, schedule interview." }

// Response 201
{ "success": true, "data": { "note_id": 3, "application_id": 20 } }
```

---

## Messaging Service — `localhost:3007`

### POST /threads/open
Create or return an existing thread between participants (idempotent).

```json
// Request
{ "participant_ids": [1, 3] }

// Response 201
{
  "success": true,
  "data": {
    "thread_id": "550e8400-e29b-41d4-a716-446655440000",
    "participant_ids": ["1", "3"],
    "created_at": "2026-01-20T10:00:00",
    "last_message_at": "2026-01-20T10:00:00"
  }
}
```

**Errors:** `400` fewer than 2 participants

---

### POST /threads/get

```json
// Request
{ "thread_id": "550e8400-e29b-41d4-a716-446655440000" }

// Response 200
{ "success": true, "data": { "thread_id": "...", "participant_ids": ["1","3"], ... } }
```

---

### POST /threads/byUser
Get all threads for a user, sorted by most recent activity.

```json
// Request
{ "user_id": 1, "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "threads": [ { "thread_id": "...", "last_message_at": "2026-01-20T11:00:00", ... } ],
    "total": 2, "page": 1, "page_size": 20
  }
}
```

---

### POST /messages/send
Sender must be a participant in the thread.

```json
// Request
{
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "sender_id": 1,
  "text": "Hi! I saw your application and wanted to reach out."
}

// Response 201
{
  "success": true,
  "data": {
    "message_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "thread_id": "550e8400-...",
    "sender_id": "1",
    "text": "Hi! I saw your application...",
    "timestamp": "2026-01-20T11:05:00",
    "read_by": ["1"]
  }
}
```

**Errors:** `403` sender not a participant, `404` thread not found

---

### POST /messages/list

```json
// Request
{ "thread_id": "550e8400-...", "page": 1 }

// Response 200
{
  "success": true,
  "data": {
    "messages": [ { "message_id": "...", "sender_id": "1", "text": "Hi!", "read_by": ["1","3"], ... } ],
    "total": 5, "page": 1, "page_size": 20
  }
}
```

---

### POST /messages/markRead
Mark all unread messages in a thread as read by a user.

```json
// Request
{ "thread_id": "550e8400-...", "user_id": 3 }

// Response 200
{ "success": true, "data": { "thread_id": "...", "messages_marked_read": 3 } }
```

---

## Analytics Service — `localhost:3008`

All analytics endpoints are cached for 5 minutes.

### POST /analytics/jobs/top
Top 10 jobs by application count for a given month.

```json
// Request
{ "month": "2026-01-01" }

// Response 200
{
  "success": true,
  "data": [ { "job_id": "10", "applications": 45 }, { "job_id": "12", "applications": 30 } ]
}
```

---

### POST /analytics/jobs/lowTraction
Bottom 5 jobs by application count (all time).

```json
// Request — empty body {}

// Response 200
{ "success": true, "data": [ { "job_id": "15", "applications": 1 } ] }
```

---

### POST /analytics/jobs/clicks
All jobs ranked by view count.

```json
// Request — empty body {}

// Response 200
{ "success": true, "data": [ { "job_id": "10", "clicks": 230 }, ... ] }
```

---

### POST /analytics/jobs/saves
Saved-job counts grouped by day or week.

```json
// Request
{ "period": "day" }    // "day" | "week"

// Response 200
{ "success": true, "data": [ { "period": "2026-01-20", "count": 12 }, ... ] }
```

---

### POST /analytics/funnel
View → Save → Apply conversion funnel (all time).

```json
// Request — empty body {}

// Response 200
{ "success": true, "data": { "viewed": 1200, "saved": 340, "submitted": 95 } }
```

---

### POST /analytics/geo
Application counts by city/state.

```json
// Request — empty body {}

// Response 200
{
  "success": true,
  "data": [ { "city": "San Francisco", "state": "CA", "count": 45 }, ... ]
}
```

---

### POST /analytics/member/dashboard
30-day stats for a member.

```json
// Request
{ "member_id": 1 }

// Response 200
{
  "success": true,
  "data": {
    "profile_views_30d": 18,
    "application_status_breakdown": [
      { "status": "submitted", "count": 3 },
      { "status": "reviewing", "count": 2 },
      { "status": "rejected",  "count": 1 }
    ]
  }
}
```

---

### POST /analytics/recruiter/dashboard
Event counts by type for a recruiter.

```json
// Request
{ "recruiter_id": 2 }

// Response 200
{
  "success": true,
  "data": [
    { "event_type": "job.viewed",             "count": 230 },
    { "event_type": "application.submitted",  "count": 45  },
    { "event_type": "application.statusChanged", "count": 12 }
  ]
}
```

---

### POST /analytics/recruiter/profileDashboard
30‑day recruiter-centric metrics (profile visibility, owned jobs, applications, outbound messages). Search appearances use `recruiter.searchAppeared` events emitted when another user runs **POST /recruiters/search** and this recruiter appears in the result set.

```json
// Request
{ "recruiter_id": 2 }

// Response 200
{
  "success": true,
  "data": {
    "profile_views_30d": 12,
    "profile_views_daily_30d": [{ "date": "2026-05-01", "count": 1 }],
    "search_appearances_30d": 40,
    "job_views_30d": 90,
    "job_saves_30d": 5,
    "applicants_30d": 8,
    "messages_sent_30d": 3,
    "application_status_breakdown": [
      { "status": "submitted", "count": 6 },
      { "status": "interview", "count": 2 }
    ]
  }
}
```

---

## Common HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad request (invalid input, invalid state transition, closed job) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (authenticated but not allowed — wrong recruiter, wrong member) |
| 404 | Not found |
| 409 | Conflict (duplicate email, already applied, already saved) |
| 422 | Validation error (missing required field, wrong type) |
| 500 | Internal server error |

---

## Typical Frontend Workflows

### New member onboarding
1. `POST /auth/register` (role: member)
2. `POST /members/create` with the returned `user_id`

### New recruiter onboarding
1. `POST /auth/register` (role: recruiter)
2. `POST /recruiters/create` with a new company or existing `company_id`

### Job application flow (member)
1. `POST /jobs/search` → browse listings
2. `POST /jobs/trackView` when member opens a job
3. `POST /jobs/save` (optional)
4. `POST /applications/submit`
5. `POST /applications/byMember` → track status

### Recruiter reviewing applications
1. `POST /jobs/byRecruiter` → see own listings
2. `POST /applications/byJob` → see all applicants
3. `POST /applications/updateStatus` → move to reviewing / interview / offer / rejected
4. `POST /applications/addNote` → internal notes

### Messaging flow
1. `POST /threads/open` with `[recruiter_id, member_id]`
2. `POST /messages/send`
3. `POST /threads/byUser` → load inbox
4. `POST /messages/list` → load thread
5. `POST /messages/markRead` → mark as read on open
