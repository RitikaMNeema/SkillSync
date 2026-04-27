#!/usr/bin/env python3
"""
Seed JMeter benchmark test accounts and job postings.

Creates:
  - jmtest_reader@jmtest.dev  — single member used by Scenario A (read-only)
  - jmtest_1@jmtest.dev … jmtest_100@jmtest.dev — 100 members used by Scenario B
  - jmtest_recruiter@jmtest.dev — recruiter that owns job postings
  - 200 open job postings

Run once before executing run_benchmarks.sh:
    python3 seed_benchmark_data.py [--auth-url http://localhost:3001] \
                                   [--profile-url http://localhost:3002] \
                                   [--recruiter-url http://localhost:3003] \
                                   [--job-url http://localhost:3005]
"""

import argparse
import sys
import time
import requests

MEMBER_PASS     = "JMeter123!"
RECRUITER_EMAIL = "jmtest_recruiter@jmtest.dev"
READER_EMAIL    = "jmtest_reader@jmtest.dev"
NUM_MEMBERS     = 100
NUM_JOBS        = 200


def post(url, body, token=None, ok_codes=(200, 201)):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(url, json=body, headers=headers, timeout=15)
    if r.status_code not in ok_codes:
        print(f"  WARN {r.status_code} → {url}  resp={r.text[:200]}")
    try:
        return r.json() if r.content else {}
    except Exception:
        return {"success": False, "error": f"Non-JSON response: {r.text[:200]}"}


def register_and_get_token(auth_url, email, password, role):
    post(
        f"{auth_url}/auth/register",
        {"email": email, "password": password, "role": role},
        ok_codes=(201, 409),
    )
    login = post(
        f"{auth_url}/auth/login",
        {"email": email, "password": password},
        ok_codes=(200, 400, 401),
    )
    if not login.get("success"):
        print(f"  ERROR: cannot login as {email}: {login}")
        return None, None
    data = login["data"]
    return data.get("user_id"), data["token"]


def ensure_member_profile(profile_url, token, user_id, name):
    create_resp = post(
        f"{profile_url}/members/create",
        {
            "member_id": user_id,
            "first_name": name,
            "last_name": "JMeter",
            "email": f"{name.lower()}@jmtest.dev",
            "headline": "JMeter benchmark user",
            "location_city": "San Jose",
            "location_state": "CA",
            "location_country": "US",
            "skills": ["Python", "Java"],
        },
        token=token,
        ok_codes=(201, 400, 401, 403, 404, 409),
    )

    if create_resp.get("success"):
        return True

    detail = str(create_resp.get("error") or create_resp.get("detail") or "")
    if "already exists" in detail.lower():
        return True

    # Some deployments return generic create errors; verify current state directly.
    check_resp = post(
        f"{profile_url}/members/get",
        {"member_id": user_id},
        token=token,
        ok_codes=(200, 401, 403, 404),
    )
    if check_resp.get("success"):
        return True

    print(f"  ERROR: member profile missing for user_id={user_id}: create={create_resp} get={check_resp}")
    return False


def ensure_recruiter_profile(recruiter_url, token, user_id):
    """Returns (recruiter_id, company_id)."""
    resp = post(
        f"{recruiter_url}/recruiters/create",
        {
            "recruiter_id": user_id,
            "name": "JMeter Recruiter",
            "email": RECRUITER_EMAIL,
            "phone": "0000000000",
            "first_name": "JMeter",
            "last_name": "Recruiter",
            "company": {
                "name": "JMeter Co",
                "industry": "Technology",
                "size": "11-50",
            },
        },
        token=token,
        ok_codes=(200, 201, 400, 401, 403, 404, 409),
    )
    if resp.get("success"):
        data = resp["data"]
        return data.get("recruiter_id") or user_id, data.get("company_id") or 0

    # Already exists — fetch to get company_id
    get_resp = post(
        f"{recruiter_url}/recruiters/get",
        {"recruiter_id": user_id},
        token=token,
        ok_codes=(200, 201, 404),
    )
    if get_resp.get("success"):
        data = get_resp["data"]
        return data.get("recruiter_id") or user_id, data.get("company_id") or 0

    return user_id, 0


def seed_jobs(job_url, recruiter_token, recruiter_id, company_id, count):
    titles = [
        "Software Engineer", "Data Engineer", "ML Engineer", "Backend Engineer",
        "Frontend Engineer", "DevOps Engineer", "Site Reliability Engineer",
        "Platform Engineer", "Full Stack Engineer", "Systems Engineer",
    ]
    locations = ["San Jose, CA", "San Francisco, CA", "Seattle, WA", "Austin, TX", "New York, NY"]
    job_ids = []
    for i in range(1, count + 1):
        title = titles[i % len(titles)] + f" L{(i % 5) + 1}"
        resp = post(
            f"{job_url}/jobs/create",
            {
                "company_id": company_id,
                "recruiter_id": recruiter_id,
                "title": title,
                "work_mode": ["remote", "hybrid", "onsite"][i % 3],
                "description": f"JMeter benchmark job #{i}. Skills: Python, SQL, Kafka.",
                "seniority_level": ["Junior", "Mid", "Senior"][i % 3],
                "employment_type": "full_time",
                "location": locations[i % len(locations)],
                "skills_required": ["Python", "SQL"],
                "salary_min": 80000 + (i % 10) * 5000,
                "salary_max": 140000 + (i % 10) * 5000,
            },
            token=recruiter_token,
        )
        if resp.get("success"):
            jid = resp["data"].get("job_id")
            if jid:
                job_ids.append(jid)
        if i % 20 == 0:
            print(f"  seeded {i}/{count} jobs …")
        time.sleep(0.02)
    return job_ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth-url",      default="http://localhost:3001")
    parser.add_argument("--profile-url",   default="http://localhost:3002")
    parser.add_argument("--recruiter-url", default="http://localhost:3003")
    parser.add_argument("--job-url",       default="http://localhost:3005")
    args = parser.parse_args()

    print("=== SkillSync JMeter Seed Script ===\n")

    print(f"[1/4] Recruiter account: {RECRUITER_EMAIL}")
    rec_id, rec_token = register_and_get_token(args.auth_url, RECRUITER_EMAIL, MEMBER_PASS, "recruiter")
    if not rec_token:
        sys.exit("Cannot create/login recruiter — is the auth service up?")
    recruiter_id, company_id = ensure_recruiter_profile(args.recruiter_url, rec_token, rec_id)
    if not company_id:
        sys.exit(f"Could not determine company_id for recruiter {recruiter_id}.")
    print(f"      recruiter_id={recruiter_id}  company_id={company_id}  ✓")

    print(f"\n[2/4] Reader member: {READER_EMAIL}")
    reader_id, reader_token = register_and_get_token(args.auth_url, READER_EMAIL, MEMBER_PASS, "member")
    if reader_token:
        if not ensure_member_profile(args.profile_url, reader_token, reader_id, "JMReader"):
            sys.exit(f"Reader member profile missing for user_id={reader_id}. Seed failed.")
        print(f"      member_id={reader_id}  ✓")
    else:
        sys.exit("Cannot create/login reader member account.")

    print(f"\n[3/4] Seeding {NUM_MEMBERS} member accounts …")
    failed_members = []
    for n in range(1, NUM_MEMBERS + 1):
        email = f"jmtest_{n}@jmtest.dev"
        uid, tok = register_and_get_token(args.auth_url, email, MEMBER_PASS, "member")
        if not tok or uid is None:
            failed_members.append((email, "login_failed"))
            continue
        if not ensure_member_profile(args.profile_url, tok, uid, f"JMember{n:03d}"):
            failed_members.append((email, "profile_missing"))
        if n % 10 == 0:
            print(f"  {n}/{NUM_MEMBERS} accounts ready …")
        time.sleep(0.02)
    if failed_members:
        print("\n  ERROR: benchmark member seed failures:")
        for email, reason in failed_members[:20]:
            print(f"    - {email}: {reason}")
        if len(failed_members) > 20:
            print(f"    ... and {len(failed_members) - 20} more")
        sys.exit("Member seed incomplete. Fix seed failures before running benchmarks.")

    print(f"  {NUM_MEMBERS} member accounts  ✓")

    print(f"\n[4/4] Seeding {NUM_JOBS} job postings …")
    job_ids = seed_jobs(args.job_url, rec_token, recruiter_id, company_id, NUM_JOBS)
    print(f"  Created {len(job_ids)} job postings  ✓")
    if job_ids:
        print(f"  First job_id={job_ids[0]}  Last job_id={job_ids[-1]}")
        print(f"\n  NOTE: Update CounterConfig start/end in scenario_b.jmx if these don't start at 1")
        print(f"  (Set start={job_ids[0]}, end={job_ids[-1]})")

    print("\n=== Seed complete. Run run_benchmarks.sh to start load tests. ===")


if __name__ == "__main__":
    main()
