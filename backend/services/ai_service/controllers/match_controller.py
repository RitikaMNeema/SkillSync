from typing import Dict, List, Set
from schemas.ai import AIMatchRequest


def _set_lower(items: List[str]) -> Set[str]:
    return {item.strip().lower() for item in items if item.strip()}


async def compute_match(payload: AIMatchRequest) -> Dict:
    candidate_skills = _set_lower(payload.candidate.skills)
    required_skills = _set_lower(payload.job.skills_required)

    overlap = sorted(list(candidate_skills.intersection(required_skills)))
    missing = sorted(list(required_skills - candidate_skills))

    skills_score = 0.0
    if required_skills:
        skills_score = len(overlap) / len(required_skills)

    location_score = 1.0
    if payload.job.location and payload.candidate.location:
        location_score = 1.0 if payload.job.location.lower() in payload.candidate.location.lower() else 0.5

    seniority_score = 0.7
    headline = payload.candidate.headline.lower()
    seniority = payload.job.seniority_level.lower()
    if seniority:
        if seniority in headline:
            seniority_score = 1.0
        elif "junior" in seniority or "entry" in seniority:
            seniority_score = 0.8
        elif "senior" in seniority:
            seniority_score = 0.7

    weighted_score = round((skills_score * 0.65 + location_score * 0.15 + seniority_score * 0.20) * 100, 2)

    if weighted_score >= 80:
        decision = "strong_match"
    elif weighted_score >= 60:
        decision = "good_match"
    elif weighted_score >= 40:
        decision = "moderate_match"
    else:
        decision = "weak_match"

    rationale = [
        f"Matched skills: {', '.join(overlap) if overlap else 'none'}",
        f"Missing skills: {', '.join(missing) if missing else 'none'}",
        f"Location score: {location_score}",
        f"Seniority score: {seniority_score}",
    ]

    return {
        "candidate_id": payload.candidate.member_id,
        "job_id": payload.job.job_id,
        "match_score": weighted_score,
        "decision": decision,
        "matched_skills": overlap,
        "missing_skills": missing,
        "rationale": rationale,
    }