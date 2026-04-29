import json

from schemas.ai import OutreachDraftRequest
from services.llm_client import ollama_client


async def generate_outreach(payload: OutreachDraftRequest, match_result: dict):
    system_prompt = (
        "You are a recruiter copilot. "
        "Write concise recruiter outreach messages. "
        "Be professional, personalized, and relevant to the candidate-job match."
    )

    user_prompt = f"""
Write a {payload.tone} outreach message for this candidate.

Candidate:
{json.dumps(payload.candidate.model_dump(), indent=2)}

Job:
{json.dumps(payload.job.model_dump(), indent=2)}

Match result:
{json.dumps(match_result, indent=2)}

Requirements:
- Keep it under 180 words
- Mention why the candidate is relevant
- Mention 2-3 matching strengths
- End with a soft call-to-action
- Return plain text only
"""

    message = await ollama_client.chat_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )

    return {
        "recruiter_id": payload.recruiter_id,
        "candidate_id": payload.candidate.member_id,
        "job_id": payload.job.job_id,
        "tone": payload.tone,
        "message": message,
    }