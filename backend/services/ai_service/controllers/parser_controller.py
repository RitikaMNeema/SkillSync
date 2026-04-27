import json

from schemas.ai import ResumeParseRequest
from services.llm_client import ollama_client


PARSE_SCHEMA = {
    "type": "object",
    "properties": {
        "skills": {"type": "array", "items": {"type": "string"}},
        "years_of_experience": {"type": "number"},
        "education_summary": {"type": "string"},
        "headline_summary": {"type": "string"},
        "fit_summary": {"type": "string"},
    },
    "required": [
        "skills",
        "years_of_experience",
        "education_summary",
        "headline_summary",
        "fit_summary",
    ],
}


async def parse_profile(payload: ResumeParseRequest):
    system_prompt = (
        "You are a resume parsing assistant. "
        "Extract structured information from candidate profile text. "
        "Return valid JSON only."
    )

    user_prompt = f"""
Parse this candidate profile and return:
- inferred skills
- years_of_experience
- education_summary
- headline_summary
- fit_summary

Input:
{json.dumps(payload.model_dump(), indent=2)}
"""

    llm_result = await ollama_client.chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=PARSE_SCHEMA,
    )

    return {
        "member_id": payload.member_id,
        "headline": payload.headline,
        "summary": payload.summary,
        "skills": payload.skills,
        "experiences": payload.experiences,
        "education": payload.education,
        "parsed_fields": llm_result,
    }