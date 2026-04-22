from typing import Dict
from schemas.ai import OutreachDraftRequest


async def generate_outreach(payload: OutreachDraftRequest, match_result: Dict) -> Dict:
    matched_skills = ", ".join(match_result.get("matched_skills", [])) or "your experience"
    candidate_name_hint = payload.candidate.headline or f"Member {payload.candidate.member_id}"

    subject = f"Opportunity: {payload.job.title} at our platform"

    body = (
        f"Hi,\n\n"
        f"I came across your profile and noticed strong alignment with our {payload.job.title} role. "
        f"Your background in {matched_skills} looks relevant to what we are hiring for.\n\n"
        f"The role is focused on {payload.job.description or payload.job.title}, "
        f"and I think your profile could be a strong fit.\n\n"
        f"If you're open to it, I’d love to connect and share more details.\n\n"
        f"Best,\n"
        f"Recruiting Team"
    )

    explanation = [
        f"Candidate profile used: {candidate_name_hint}",
        f"Job used: {payload.job.title}",
        f"Matched skills referenced: {matched_skills}",
        "Draft requires recruiter approval before any downstream send action.",
    ]

    return {
        "subject": subject,
        "message": body,
        "tone": payload.tone,
        "explanation": explanation,
    }