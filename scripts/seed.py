#!/usr/bin/env python3
"""
SkillSync mock data seed script.

Creates a complete dataset to exercise every workflow:
  - 3 members + 2 recruiters registered and profiled
  - 1 company with 2 recruiters
  - 4 jobs (3 open, 1 closed)
  - connection requests, accepts, and one pending
  - 5 job applications across different status stages
  - 2 messaging threads with messages
  - Job save/unsave

Usage:
    pip install httpx
    python scripts/seed.py

Services must be running: docker compose up -d
"""

import sys
import json
import time
import httpx

BASE = {
    "auth":        "http://localhost:3001",
    "profile":     "http://localhost:3002",
    "recruiter":   "http://localhost:3003",
    "connection":  "http://localhost:3004",
    "job":         "http://localhost:3005",
    "application": "http://localhost:3006",
    "messaging":   "http://localhost:3007",
}

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


def ok(label, data=None):
    print(f"  {GREEN}✓{RESET} {label}", f"→ {json.dumps(data)}" if data else "")


def section(title):
    print(f"\n{BOLD}{YELLOW}{'─'*55}{RESET}")
    print(f"{BOLD}{YELLOW}  {title}{RESET}")
    print(f"{BOLD}{YELLOW}{'─'*55}{RESET}")


def post(client, base_key, path, body, *, token=None, expect=None, ignore=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    url = BASE[base_key] + path
    r = client.post(url, json=body, headers=headers)
    if ignore and r.status_code in ignore:
        return None
    if r.status_code not in (expect or [200, 201]):
        print(f"  {RED}✗ {path} → {r.status_code}: {r.text}{RESET}")
        sys.exit(1)
    return r.json()["data"]


def wait_for_services(client):
    print(f"\n{BOLD}Waiting for services...{RESET}")
    for name, base in BASE.items():
        for attempt in range(60):
            try:
                r = client.get(f"{base}/health", timeout=2)
                if r.status_code == 200:
                    ok(name)
                    break
            except Exception:
                pass
            if attempt % 10 == 9:
                print(f"    still waiting for {name}... ({attempt+1}s)")
            time.sleep(1)
        else:
            print(f"  {RED}✗ {name} not reachable after 60s — is docker compose running?{RESET}")
            print(f"    Check logs: docker compose logs {name.replace('_','-')}-service")
            sys.exit(1)


def main():
    with httpx.Client(timeout=10) as client:

        wait_for_services(client)

        # ── STEP 1: Register users ─────────────────────────────────────
        section("1 / Register Users")

        users = {}
        tokens = {}

        user_defs = [
            ("alice",   "alice@example.com",   "password123", "member"),
            ("bob",     "bob@example.com",      "password123", "member"),
            ("charlie", "charlie@example.com",  "password123", "member"),
            ("recruiter_dana", "dana@acme.com", "password123", "recruiter"),
            ("recruiter_eli",  "eli@acme.com",  "password123", "recruiter"),
        ]

        for alias, email, pw, role in user_defs:
            r = client.post(f"{BASE['auth']}/auth/register", json={"email": email, "password": pw, "role": role})
            if r.status_code in (200, 201):
                note = "registered"
            elif r.status_code == 409:
                note = "already exists — logging in"
            else:
                print(f"  {RED}✗ /auth/register → {r.status_code}: {r.text}{RESET}")
                sys.exit(1)
            # Always derive user_id from login so it works on re-runs too
            login = post(client, "auth", "/auth/login", {"email": email, "password": pw})
            users[alias]  = login["user_id"]
            tokens[alias] = login["token"]
            ok(f"{alias} ({note})", {"user_id": users[alias], "role": role})

        # ── STEP 2: Create member profiles ────────────────────────────
        section("2 / Member Profiles")

        member_profiles = {
            "alice": {
                "member_id": users["alice"],
                "first_name": "Alice", "last_name": "Smith",
                "headline": "Senior Software Engineer",
                "location_city": "San Francisco", "location_state": "CA", "location_country": "US",
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kafka"],
                "experience": [
                    {"title": "SWE II", "company": "Google", "start": "2021-06", "end": None},
                    {"title": "SWE I",  "company": "Stripe", "start": "2019-01", "end": "2021-05"},
                ],
                "education": [
                    {"school": "UC Berkeley", "degree": "BS Computer Science", "year": 2019}
                ],
                "summary": "Passionate about distributed systems and building products at scale.",
                "resume_url": "https://example.com/resumes/alice.pdf",
            },
            "bob": {
                "member_id": users["bob"],
                "first_name": "Bob", "last_name": "Jones",
                "headline": "Frontend Engineer",
                "location_city": "New York", "location_state": "NY", "location_country": "US",
                "skills": ["React", "TypeScript", "GraphQL", "CSS"],
                "experience": [
                    {"title": "Frontend Dev", "company": "Airbnb", "start": "2022-03", "end": None},
                ],
                "education": [
                    {"school": "NYU", "degree": "BS Information Systems", "year": 2022}
                ],
                "summary": "Building delightful UIs for millions of users.",
            },
            "charlie": {
                "member_id": users["charlie"],
                "first_name": "Charlie", "last_name": "Lee",
                "headline": "Data Scientist",
                "location_city": "Seattle", "location_state": "WA", "location_country": "US",
                "skills": ["Python", "SQL", "PyTorch", "Spark", "Tableau"],
                "experience": [
                    {"title": "Data Scientist", "company": "Amazon", "start": "2020-09", "end": None},
                ],
                "education": [
                    {"school": "University of Washington", "degree": "MS Data Science", "year": 2020}
                ],
                "summary": "Turning raw data into product decisions.",
            },
        }

        for alias, profile in member_profiles.items():
            result = post(client, "profile", "/members/create", profile, token=tokens[alias], ignore=[409, 400])
            ok(f"Profile for {alias} ({'created' if result else 'already exists'})")

        # ── STEP 3: Create recruiters & company ───────────────────────
        section("3 / Recruiters & Company")

        dana_data = post(client, "recruiter", "/recruiters/create", {
            "recruiter_id": users["recruiter_dana"],
            "name": "Dana Park",
            "email": "dana@acme.com",
            "role": "Senior Technical Recruiter",
            "company": {"name": "Acme Corp", "industry": "Technology", "size": "1000-5000"},
        }, token=tokens["recruiter_dana"], ignore=[409, 400])
        if dana_data:
            company_id = dana_data["company_id"]
            ok("Created Dana Park + Acme Corp", {"company_id": company_id})
        else:
            # Already exists — fetch to get company_id
            dana_data = post(client, "recruiter", "/recruiters/get",
                             {"recruiter_id": users["recruiter_dana"]}, token=tokens["recruiter_dana"])
            company_id = dana_data["company_id"]
            ok("Dana Park already exists", {"company_id": company_id})

        post(client, "recruiter", "/recruiters/create", {
            "recruiter_id": users["recruiter_eli"],
            "name": "Eli Watson",
            "email": "eli@acme.com",
            "role": "Recruiter",
            "company_id": company_id,
        }, token=tokens["recruiter_eli"], ignore=[409, 400])
        ok("Eli Watson (created or already exists)")

        # ── STEP 4: Post jobs ─────────────────────────────────────────
        section("4 / Job Listings")

        job_defs = [
            {
                "title": "Senior Backend Engineer",
                "description": "Build and scale our microservices platform using Python and Kafka.",
                "work_mode": "remote",
                "employment_type": "full-time",
                "seniority_level": "senior",
                "location": "San Francisco, CA",
                "skills_required": ["Python", "FastAPI", "Kafka", "Docker"],
                "salary_min": 150000, "salary_max": 200000,
                "company_id": company_id, "recruiter_id": users["recruiter_dana"],
            },
            {
                "title": "Frontend Engineer",
                "description": "Build the next generation of our React-based web application.",
                "work_mode": "hybrid",
                "employment_type": "full-time",
                "seniority_level": "mid",
                "location": "New York, NY",
                "skills_required": ["React", "TypeScript", "GraphQL"],
                "salary_min": 120000, "salary_max": 160000,
                "company_id": company_id, "recruiter_id": users["recruiter_dana"],
            },
            {
                "title": "Data Scientist",
                "description": "Drive ML model development and data insights across our product.",
                "work_mode": "onsite",
                "employment_type": "full-time",
                "seniority_level": "mid",
                "location": "Seattle, WA",
                "skills_required": ["Python", "PyTorch", "SQL", "Spark"],
                "salary_min": 130000, "salary_max": 170000,
                "company_id": company_id, "recruiter_id": users["recruiter_eli"],
            },
            {
                "title": "Junior DevOps Engineer",
                "description": "Support infrastructure and CI/CD pipelines.",
                "work_mode": "remote",
                "employment_type": "contract",
                "seniority_level": "junior",
                "location": "Remote",
                "skills_required": ["Docker", "Kubernetes", "Terraform"],
                "salary_min": 80000, "salary_max": 100000,
                "company_id": company_id, "recruiter_id": users["recruiter_eli"],
            },
        ]

        job_ids = []
        for jd in job_defs:
            job = post(client, "job", "/jobs/create", jd, token=tokens["recruiter_dana"])
            job_ids.append(job["job_id"])
            ok(f"Created job: {jd['title']}", {"job_id": job["job_id"]})

        # Close the last job (DevOps) to test that blocked submissions work
        post(client, "job", "/jobs/close", {"job_id": job_ids[3]}, token=tokens["recruiter_dana"])
        ok(f"Closed job {job_ids[3]} (DevOps — to test closed-job block)")

        # Simulate view tracking for analytics
        for jid in job_ids[:3]:
            for viewer in ["alice", "bob", "charlie"]:
                post(client, "job", "/jobs/trackView",
                     {"job_id": jid, "viewer_id": users[viewer]},
                     token=tokens[viewer])
        ok("Tracked views for 3 jobs × 3 members")

        # Save some jobs (ignore 409 if already saved)
        post(client, "job", "/jobs/save", {"member_id": users["alice"], "job_id": job_ids[0]}, token=tokens["alice"], ignore=[409])
        post(client, "job", "/jobs/save", {"member_id": users["alice"], "job_id": job_ids[1]}, token=tokens["alice"], ignore=[409])
        post(client, "job", "/jobs/save", {"member_id": users["bob"],   "job_id": job_ids[1]}, token=tokens["bob"],   ignore=[409])
        ok("Alice saved jobs 0+1, Bob saved job 1")

        # ── STEP 5: Connections ───────────────────────────────────────
        section("5 / Connections")

        req1 = post(client, "connection", "/connections/request",
                    {"requester_id": users["alice"], "receiver_id": users["bob"]},
                    token=tokens["alice"], ignore=[409, 400])
        if req1:
            post(client, "connection", "/connections/accept",
                 {"request_id": req1["request_id"]}, token=tokens["bob"], ignore=[400])
        ok("Alice ↔ Bob (connected)")

        post(client, "connection", "/connections/request",
             {"requester_id": users["alice"], "receiver_id": users["charlie"]},
             token=tokens["alice"], ignore=[409, 400])
        ok("Alice → Charlie request (pending)")

        req3 = post(client, "connection", "/connections/request",
                    {"requester_id": users["bob"], "receiver_id": users["charlie"]},
                    token=tokens["bob"], ignore=[409, 400])
        if req3:
            post(client, "connection", "/connections/accept",
                 {"request_id": req3["request_id"]}, token=tokens["charlie"], ignore=[400])
        ok("Bob ↔ Charlie (connected)")

        # ── STEP 6: Applications ──────────────────────────────────────
        section("6 / Applications")

        # Alice applies to Backend job → advance to interview
        app1 = post(client, "application", "/applications/submit", {
            "job_id": job_ids[0], "member_id": users["alice"],
            "resume_url": "https://example.com/resumes/alice.pdf",
            "cover_letter": "I have 5 years of Python experience and love distributed systems.",
            "answers": {"years_python": "5", "remote_experience": "yes"},
        }, token=tokens["alice"])
        ok("Alice applied to Backend Engineer", {"application_id": app1["application_id"]})

        post(client, "application", "/applications/updateStatus",
             {"application_id": app1["application_id"], "new_status": "reviewing"},
             token=tokens["recruiter_dana"])
        post(client, "application", "/applications/updateStatus",
             {"application_id": app1["application_id"], "new_status": "interview"},
             token=tokens["recruiter_dana"])
        post(client, "application", "/applications/addNote", {
            "application_id": app1["application_id"],
            "recruiter_id": users["recruiter_dana"],
            "note_text": "Strong candidate. Schedule technical screen.",
        }, token=tokens["recruiter_dana"])
        ok("Advanced Alice → interview stage with recruiter note")

        # Bob applies to Frontend job → stays at submitted
        app2 = post(client, "application", "/applications/submit", {
            "job_id": job_ids[1], "member_id": users["bob"],
            "resume_url": "https://example.com/resumes/bob.pdf",
            "cover_letter": "Huge React fan, excited about this role.",
        }, token=tokens["bob"])
        ok("Bob applied to Frontend Engineer", {"application_id": app2["application_id"]})

        # Charlie applies to Data Scientist → rejected
        app3 = post(client, "application", "/applications/submit", {
            "job_id": job_ids[2], "member_id": users["charlie"],
            "resume_url": "https://example.com/resumes/charlie.pdf",
            "cover_letter": "5 years in ML/DS, strong Spark background.",
        }, token=tokens["charlie"])
        post(client, "application", "/applications/updateStatus",
             {"application_id": app3["application_id"], "new_status": "reviewing"},
             token=tokens["recruiter_eli"])
        post(client, "application", "/applications/updateStatus",
             {"application_id": app3["application_id"], "new_status": "rejected"},
             token=tokens["recruiter_eli"])
        ok("Charlie applied to Data Scientist → rejected", {"application_id": app3["application_id"]})

        # Alice also applies to Frontend → withdraws it
        app4 = post(client, "application", "/applications/submit", {
            "job_id": job_ids[1], "member_id": users["alice"],
            "resume_url": "https://example.com/resumes/alice.pdf",
            "cover_letter": "Interested in frontend as well.",
        }, token=tokens["alice"])
        post(client, "application", "/applications/withdraw",
             {"application_id": app4["application_id"]}, token=tokens["alice"])
        ok("Alice applied to Frontend → withdrew", {"application_id": app4["application_id"]})

        # Verify closed job blocks Bob applying to DevOps
        r = client.post(
            f"{BASE['application']}/applications/submit",
            json={"job_id": job_ids[3], "member_id": users["bob"], "resume_url": "x"},
            headers={"Authorization": f"Bearer {tokens['bob']}"},
        )
        if r.status_code == 400:
            ok("Closed-job block works — Bob correctly got 400 on DevOps job")
        else:
            print(f"  {RED}✗ Expected 400 for closed job, got {r.status_code}{RESET}")

        # ── STEP 7: Messaging ─────────────────────────────────────────
        section("7 / Messaging")

        thread1 = post(client, "messaging", "/threads/open",
                       {"participant_ids": [users["recruiter_dana"], users["alice"]]},
                       token=tokens["recruiter_dana"])
        ok("Opened thread: Dana ↔ Alice", {"thread_id": thread1["thread_id"]})

        messages_t1 = [
            (tokens["recruiter_dana"], users["recruiter_dana"],
             "Hi Alice! I reviewed your application — very impressed. Are you free for a call this week?"),
            (tokens["alice"], users["alice"],
             "Hi Dana! Yes, I'd love to chat. I'm free Thursday or Friday afternoon."),
            (tokens["recruiter_dana"], users["recruiter_dana"],
             "Perfect — I'll send a calendar invite for Thursday 2pm PT."),
        ]
        for tok, sender, text in messages_t1:
            post(client, "messaging", "/messages/send",
                 {"thread_id": thread1["thread_id"], "sender_id": sender, "text": text},
                 token=tok)

        # Mark all read by Alice
        post(client, "messaging", "/messages/markRead",
             {"thread_id": thread1["thread_id"], "user_id": users["alice"]},
             token=tokens["alice"])
        ok("3 messages exchanged, Alice marked read")

        thread2 = post(client, "messaging", "/threads/open",
                       {"participant_ids": [users["bob"], users["recruiter_dana"]]},
                       token=tokens["bob"])
        post(client, "messaging", "/messages/send", {
            "thread_id": thread2["thread_id"],
            "sender_id": users["bob"],
            "text": "Hi! I saw the Frontend Engineer role and wanted to introduce myself.",
        }, token=tokens["bob"])
        ok("Opened thread: Bob ↔ Dana with 1 message")

        # ── DONE ──────────────────────────────────────────────────────
        section("Seed Complete — Summary")

        print(f"""
  {BOLD}Users created:{RESET}
    alice          user_id={users['alice']}
    bob            user_id={users['bob']}
    charlie        user_id={users['charlie']}
    recruiter_dana user_id={users['recruiter_dana']}
    recruiter_eli  user_id={users['recruiter_eli']}

  {BOLD}Company:{RESET}
    Acme Corp      company_id={company_id}

  {BOLD}Jobs:{RESET}
    {job_ids[0]}  Senior Backend Engineer   (open)
    {job_ids[1]}  Frontend Engineer         (open)
    {job_ids[2]}  Data Scientist            (open)
    {job_ids[3]}  Junior DevOps Engineer    (CLOSED)

  {BOLD}Applications:{RESET}
    app {app1['application_id']}  Alice → Backend Engineer   status=interview
    app {app2['application_id']}  Bob   → Frontend Engineer  status=submitted
    app {app3['application_id']}  Charlie → Data Scientist   status=rejected
    app {app4['application_id']}  Alice → Frontend Engineer  status=withdrawn

  {BOLD}Connections:{RESET}
    Alice ↔ Bob     (connected)
    Bob   ↔ Charlie (connected)
    Alice → Charlie (pending)

  {BOLD}Threads:{RESET}
    Dana ↔ Alice  thread_id={thread1['thread_id']}
    Bob  ↔ Dana   thread_id={thread2['thread_id']}

  {BOLD}Paste these tokens into Swagger Authorize:{RESET}
    Alice:          {tokens['alice'][:40]}...
    Bob:            {tokens['bob'][:40]}...
    Charlie:        {tokens['charlie'][:40]}...
    Dana (recruiter): {tokens['recruiter_dana'][:40]}...
    Eli  (recruiter): {tokens['recruiter_eli'][:40]}...

  {BOLD}Swagger UIs:{RESET}
    Auth:         http://localhost:3001/docs
    Profile:      http://localhost:3002/docs
    Recruiter:    http://localhost:3003/docs
    Connections:  http://localhost:3004/docs
    Jobs:         http://localhost:3005/docs
    Applications: http://localhost:3006/docs
    Messaging:    http://localhost:3007/docs
    Analytics:    http://localhost:3008/docs
""")


if __name__ == "__main__":
    main()
