import json
import asyncio

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


def _build_resume_input(payload: ResumeParseRequest) -> str:
    """
    Build the primary text for the LLM to parse.
    Prefer raw resume_text (from uploaded resume PDF/text) as the spec requires.
    Fall back to structured profile fields when resume_text is absent.
    """
    if payload.resume_text and payload.resume_text.strip():
        # Raw resume is available — use it as the primary content.
        # Append structured fields as supplementary context so the model can cross-check.
        supplementary_parts = []
        if payload.headline:
            supplementary_parts.append(f"Profile headline: {payload.headline}")
        if payload.skills:
            supplementary_parts.append(f"Listed skills: {', '.join(payload.skills)}")
        if hasattr(payload, "location") and payload.location:
            supplementary_parts.append(f"Location: {payload.location}")
        supplement = "\n".join(supplementary_parts)
        return (
            f"=== RESUME TEXT (primary source) ===\n"
            f"{payload.resume_text.strip()}\n\n"
            + (f"=== SUPPLEMENTARY PROFILE DATA ===\n{supplement}" if supplement else "")
        )

    # No resume text — fall back to structured profile fields.
    structured = {
        "headline": payload.headline,
        "summary": payload.summary,
        "skills": payload.skills,
        "experiences": payload.experiences,
        "education": payload.education,
    }
    return (
        "=== PROFILE DATA (no resume uploaded) ===\n"
        + json.dumps(structured, indent=2)
    )


async def parse_profile(payload: ResumeParseRequest):
    system_prompt = (
        "You are a resume parsing assistant. "
        "Extract structured information from a candidate resume or profile. "
        "When a full resume text is provided, treat it as the primary source. "
        "When only structured profile data is available, extract from that instead. "
        "Return valid JSON only."
    )

    resume_input = _build_resume_input(payload)

    user_prompt = f"""
Parse the following candidate content and extract:
- skills (list of all technical and professional skills found)
- years_of_experience (numeric total, inferred from work history or resume)
- education_summary (degrees, institutions, fields of study)
- headline_summary (one-line role or professional identity)
- fit_summary (brief overall profile summary)

{resume_input}
"""

    try:
        llm_result = await asyncio.wait_for(
            ollama_client.chat_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema=PARSE_SCHEMA,
            ),
            timeout=20.0,
        )
    except Exception as exc:
        print(f"[PARSE] llm parse failed or timed out: {exc}")
        # Fallback: derive fields directly from whichever source we have.
        fallback_summary = (
            (payload.resume_text or "").strip()[:500]
            or (payload.summary or "").strip()[:500]
        )
        llm_result = {
            "skills": list(payload.skills or []),
            "years_of_experience": 0,
            "education_summary": "; ".join(payload.education or []),
            "headline_summary": payload.headline or "",
            "fit_summary": fallback_summary,
            "llm_error": str(exc),
        }

    return {
        "member_id": payload.member_id,
        "headline": payload.headline,
        "summary": payload.summary,
        "resume_text": payload.resume_text,
        "skills": payload.skills,
        "experiences": payload.experiences,
        "education": payload.education,
        "parsed_fields": llm_result,
    }