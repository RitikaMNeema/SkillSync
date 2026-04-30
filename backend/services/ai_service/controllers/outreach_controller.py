import asyncio
import json

from schemas.ai import OutreachDraftRequest
from services.llm_client import ollama_client


def get_fit_band(match_score: float) -> str:
    if match_score >= 70:
        return "high_fit"
    if match_score >= 50:
        return "medium_fit"
    return "low_fit"


def build_fit_guidance(match_score: float, matched_skills: list[str], missing_skills: list[str]) -> str:
    fit_band = get_fit_band(match_score)

    if fit_band == "high_fit":
        return f"""
Candidate fit band: HIGH FIT
Guidance:
- Clearly say the candidate looks like a strong fit for the role.
- Confidently highlight strong alignment with the role.
- Mention 2-3 matching strengths from: {matched_skills}
- Keep the tone positive and recruiter-forward.
- Invite the candidate to explore the opportunity.
"""

    if fit_band == "medium_fit":
        return f"""
Candidate fit band: MEDIUM FIT
Guidance:
- Do NOT oversell the candidate as a perfect fit.
- Say the candidate appears promising or potentially well-aligned in several areas.
- Mention 1-2 strengths from: {matched_skills}
- You may mention growth potential or transferable skills.
- Keep the tone encouraging but balanced.
- Invite the candidate to discuss the role further.
"""

    return f"""
Candidate fit band: LOW FIT
Guidance:
- Do NOT say the candidate is a strong fit.
- Keep the message exploratory and soft.
- Focus on relevant adjacent experience or transferable strengths.
- Avoid strong claims of alignment.
- Keep the message short, polite, and low-pressure.
- Invite the candidate to learn more only if interested.
- Missing skills include: {missing_skills}
"""


def build_fallback_message(payload: OutreachDraftRequest, match_result: dict) -> str:
    match_score = float(match_result.get("match_score", 0.0))
    matched_skills = match_result.get("matched_skills", [])
    fit_band = get_fit_band(match_score)

    candidate_name = payload.candidate.headline or "there"
    job_title = payload.job.title or "this role"

    if fit_band == "high_fit":
        strengths = ", ".join(matched_skills[:3]) if matched_skills else "relevant backend technologies"
        return (
            f"Hi, I came across your profile and thought you could be a strong fit for our {job_title} role. "
            f"Your background in {strengths} looks highly relevant to what we’re building. "
            f"If you're open to it, I’d love to share a few more details and see if this opportunity interests you."
        )

    if fit_band == "medium_fit":
        strengths = ", ".join(matched_skills[:2]) if matched_skills else "relevant technical areas"
        return (
            f"Hi, I wanted to reach out about our {job_title} role. "
            f"Your background shows promising overlap in areas like {strengths}, and I think it could be worth a conversation. "
            f"If you're open, I’d be happy to share more about the opportunity."
        )

    return (
        f"Hi, I’m reaching out regarding our {job_title} opening. "
        f"Your profile shows some potentially relevant experience, and I thought it may be worth sharing the role with you. "
        f"If you're interested, I’d be glad to send over more details."
    )


async def generate_outreach(payload: OutreachDraftRequest, match_result: dict):
    print("[OUTREACH] generate_outreach started")

    match_score = float(match_result.get("match_score", 0.0))
    matched_skills = match_result.get("matched_skills", [])
    missing_skills = match_result.get("missing_skills", [])
    fit_band = get_fit_band(match_score)
    fit_guidance = build_fit_guidance(match_score, matched_skills, missing_skills)
    fallback_message = build_fallback_message(payload, match_result)

    system_prompt = (
        "You are a recruiter copilot. "
        "Write concise recruiter outreach messages. "
        "Be professional, personalized, and relevant to the candidate-job match. "
        "Follow the fit guidance carefully and avoid overstating candidate fit."
    )

    user_prompt = f"""
Write a {payload.tone} outreach message for this candidate.

Candidate:
{json.dumps(payload.candidate.model_dump(), indent=2)}

Job:
{json.dumps(payload.job.model_dump(), indent=2)}

Match result:
{json.dumps(match_result, indent=2)}

{fit_guidance}

Requirements:
- Keep it under 180 words
- Mention why the candidate is relevant
- Mention 2-3 matching strengths when the fit is high
- For medium fit, be balanced and realistic
- For low fit, stay exploratory and do not overclaim
- End with a soft call-to-action
- Return plain text only
"""

    try:
        message = await asyncio.wait_for(
            ollama_client.chat_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            ),
            timeout=20.0,
        )
        print("[OUTREACH] generate_outreach completed with llm")
    except Exception as exc:
        print(f"[OUTREACH] llm draft failed or timed out: {exc}")
        message = fallback_message
        print("[OUTREACH] generate_outreach completed with fallback")

    return {
        "recruiter_id": payload.recruiter_id,
        "candidate_id": payload.candidate.member_id,
        "job_id": payload.job.job_id,
        "tone": payload.tone,
        "fit_band": fit_band,
        "match_score": match_score,
        "message": message,
    }