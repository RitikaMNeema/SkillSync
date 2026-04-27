import json
from typing import Dict, List

from schemas.ai import AIMatchRequest
from services.embedding_service import embedding_service
from services.llm_client import ollama_client


MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "reasoning": {"type": "string"},
        "matched_skills": {"type": "array", "items": {"type": "string"}},
        "missing_skills": {"type": "array", "items": {"type": "string"}},
        "seniority_fit": {"type": "string"},
        "location_fit": {"type": "string"},
        "recommendation": {"type": "string"},
    },
    "required": [
        "reasoning",
        "matched_skills",
        "missing_skills",
        "seniority_fit",
        "location_fit",
        "recommendation",
    ],
}


def normalize_skills(skills: List[str]) -> List[str]:
    return [s.strip().lower() for s in skills if s and s.strip()]


async def compute_match(payload: AIMatchRequest):
    candidate = payload.candidate
    job = payload.job

    candidate_skills = normalize_skills(candidate.skills)
    job_skills = normalize_skills(job.skills_required)

    matched_skills = sorted(list(set(candidate_skills) & set(job_skills)))
    missing_skills = sorted(list(set(job_skills) - set(candidate_skills)))

    overlap_score = 0.0
    if job_skills:
        overlap_score = (len(matched_skills) / len(job_skills)) * 100.0

    candidate_text = " ".join([
        candidate.headline,
        candidate.summary,
        " ".join(candidate.skills),
        " ".join(candidate.experiences),
        " ".join(candidate.education),
    ])

    job_text = " ".join([
        job.title,
        job.description,
        " ".join(job.skills_required),
        job.location,
        job.seniority_level,
        job.employment_type,
    ])

    candidate_embedding = await embedding_service.embed(candidate_text)
    job_embedding = await embedding_service.embed(job_text)
    cosine = embedding_service.cosine_similarity(candidate_embedding, job_embedding)

    embedding_score = max(0.0, min(100.0, cosine * 100.0))

    location_bonus = 10.0 if candidate.location.strip().lower() == job.location.strip().lower() and job.location else 0.0

    final_score = round((0.5 * overlap_score) + (0.4 * embedding_score) + location_bonus, 2)
    final_score = min(final_score, 100.0)

    system_prompt = (
        "You are a hiring assistant. "
        "Given candidate and job data plus computed scoring features, return a brief structured explanation. "
        "Return valid JSON only."
    )

    user_prompt = f"""
Candidate:
{json.dumps(candidate.model_dump(), indent=2)}

Job:
{json.dumps(job.model_dump(), indent=2)}

Computed features:
- overlap_score: {overlap_score}
- embedding_score: {embedding_score}
- matched_skills: {matched_skills}
- missing_skills: {missing_skills}
- location_bonus: {location_bonus}
- final_score: {final_score}
"""

    llm_explanation = await ollama_client.chat_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema=MATCH_SCHEMA,
    )

    return {
        "match_score": final_score,
        "overlap_score": round(overlap_score, 2),
        "embedding_score": round(embedding_score, 2),
        "matched_skills": llm_explanation.get("matched_skills", matched_skills),
        "missing_skills": llm_explanation.get("missing_skills", missing_skills),
        "reasoning": llm_explanation.get("reasoning", ""),
        "seniority_fit": llm_explanation.get("seniority_fit", ""),
        "location_fit": llm_explanation.get("location_fit", ""),
        "recommendation": llm_explanation.get("recommendation", ""),
    }