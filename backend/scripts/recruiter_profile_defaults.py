"""Default recruiter profile sections for seeds (About, experience, education, skills, languages)."""

from __future__ import annotations

from typing import Any


def recruiter_profile_enrichment(
    company_name: str,
    *,
    industry: str | None = None,
    hq: str | None = None,
    role_label: str = "Recruiter",
    experience_job_title: str | None = None,
) -> dict[str, Any]:
    """Fields accepted by POST /recruiters/create beyond core identity + company."""
    cn = (company_name or "Organization").strip()
    ind = (industry or "").strip()
    loc_raw = (hq or "").strip()
    city = state = country = None
    if loc_raw:
        pieces = [p.strip() for p in loc_raw.split(",")]
        if len(pieces) >= 1:
            city = pieces[0][:120] or None
        if len(pieces) >= 2:
            state = pieces[1][:120] or None
        if len(pieces) >= 3:
            country = pieces[2][:120] or None

    job_title = ((experience_job_title or role_label).strip() or "Recruiter")[:120]
    blurb = (
        f"Sourcing and hiring for {cn[:200]}. "
        "Connecting strong candidates with teams across the organization. "
        "Partnering with hiring managers on workforce planning, structured interviews, and offer decisions."
    )
    headline = f"{role_label} at {cn[:100]}"

    edu_field = "Human Resources Management"
    if any(k in ind.lower() for k in ("technology", "software", "internet", "information")):
        edu_field = "Business Administration"

    return {
        "headline": headline,
        "summary": blurb,
        "about": blurb,
        "location_city": city,
        "location_state": state,
        "location_country": country,
        "experience": [
            {
                "title": job_title,
                "company": cn[:120],
                "employment_type": "Full-time",
                "start": "2022-01",
                "start_month": "January",
                "start_year": 2022,
                "end": None,
                "is_current": True,
                "description": (
                    f"Full-cycle recruiting at {cn[:80]}: sourcing, screening, coordinating interviews, "
                    "and improving candidate experience across multiple functions."
                ),
            }
        ],
        "education": [
            {
                "school": "State University",
                "degree": "Bachelor of Arts",
                "field": edu_field,
                "year": 2018,
            }
        ],
        "skills": [
            "Technical recruiting",
            "Candidate experience",
            "Interview coaching",
            "Applicant tracking systems",
            "Stakeholder management",
            "Sourcing strategy",
        ],
        "languages": [
            {"name": "English", "proficiency": "Full professional proficiency"},
            {"name": "Spanish", "proficiency": "Limited working proficiency"},
        ],
        "open_to": "hiring",
        "profile_status": "hiring",
        "profile_language": "English",
    }
