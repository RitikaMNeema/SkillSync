import asyncio
import json
from typing import Dict, List, Any

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


def build_fallback_reasoning(
    final_score: float,
    matched_skills: List[str],
    missing_skills: List[str],
    candidate_location: str,
    job_location: str,
) -> Dict[str, Any]:
    if final_score >= 75:
        recommendation = "Strong fit"
    elif final_score >= 50:
        recommendation = "Moderate fit"
    else:
        recommendation = "Weak fit"

    reasoning_parts = []

    if matched_skills:
        reasoning_parts.append(
            f"The candidate matches these required skills: {', '.join(matched_skills)}."
        )
    if missing_skills:
        reasoning_parts.append(
            f"Missing or less visible skills include: {', '.join(missing_skills)}."
        )

    seniority_fit = "Unknown"
    location_fit = "Unknown"

    if candidate_location and job_location:
        if candidate_location.strip().lower() == job_location.strip().lower():
            location_fit = "Same location"
            reasoning_parts.append("Candidate location matches the job location.")
        else:
            location_fit = "Different location"
            reasoning_parts.append("Candidate location differs from the job location.")

    reasoning_parts.append(f"Overall recommendation: {recommendation}.")

    return {
        "reasoning": " ".join(reasoning_parts),
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "seniority_fit": seniority_fit,
        "location_fit": location_fit,
        "recommendation": recommendation,
    }


async def safe_embed(text: str, timeout_seconds: float = 20.0) -> List[float] | None:
    try:
        return await asyncio.wait_for(
            embedding_service.embed(text),
            timeout=timeout_seconds,
        )
    except Exception as exc:
        print(f"[MATCH] embedding failed or timed out: {exc}")
        return None


async def safe_llm_explanation(
    system_prompt: str,
    user_prompt: str,
    timeout_seconds: float = 25.0,
) -> Dict[str, Any]:
    try:
        return await asyncio.wait_for(
            ollama_client.chat_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema=MATCH_SCHEMA,
            ),
            timeout=timeout_seconds,
        )
    except Exception as exc:
        print(f"[MATCH] llm explanation failed or timed out: {exc}")
        return {}


async def compute_match(payload: AIMatchRequest):
    print("[MATCH] compute_match started")

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
        candidate.headline or "",
        candidate.summary or "",
        " ".join(candidate.skills or []),
        " ".join(candidate.experiences or []),
        " ".join(candidate.education or []),
    ])

    job_text = " ".join([
        job.title or "",
        job.description or "",
        " ".join(job.skills_required or []),
        job.location or "",
        job.seniority_level or "",
        job.employment_type or "",
    ])

    # Run embeddings concurrently with timeout protection
    candidate_embedding, job_embedding = await asyncio.gather(
        safe_embed(candidate_text),
        safe_embed(job_text),
    )

    cosine = 0.0
    if candidate_embedding is not None and job_embedding is not None:
        try:
            cosine = embedding_service.cosine_similarity(candidate_embedding, job_embedding)
        except Exception as exc:
            print(f"[MATCH] cosine similarity failed: {exc}")
            cosine = 0.0
    else:
        print("[MATCH] embedding unavailable, defaulting embedding_score to 0")

    embedding_score = max(0.0, min(100.0, cosine * 100.0))

    location_bonus = 0.0
    if job.location and candidate.location:
        if candidate.location.strip().lower() == job.location.strip().lower():
            location_bonus = 10.0

    final_score = round((0.5 * overlap_score) + (0.4 * embedding_score) + location_bonus, 2)
    final_score = min(final_score, 100.0)

    # Heuristic confidence: average of the two main signals (skill overlap vs semantic similarity), 0–100.
    confidence = round((overlap_score + embedding_score) / 2.0, 1)
    confidence = max(0.0, min(100.0, confidence))

    system_prompt = (
        "You are a hiring assistant. "
        "Given candidate and job data plus computed scoring features, "
        "return a brief structured explanation. "
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

    llm_explanation = await safe_llm_explanation(system_prompt, user_prompt)

    fallback = build_fallback_reasoning(
        final_score=final_score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        candidate_location=candidate.location or "",
        job_location=job.location or "",
    )

    result = {
        "match_score": final_score,
        "confidence": confidence,
        "overlap_score": round(overlap_score, 2),
        "embedding_score": round(embedding_score, 2),
        "matched_skills": llm_explanation.get("matched_skills", fallback["matched_skills"]),
        "missing_skills": llm_explanation.get("missing_skills", fallback["missing_skills"]),
        "reasoning": llm_explanation.get("reasoning", fallback["reasoning"]),
        "seniority_fit": llm_explanation.get("seniority_fit", fallback["seniority_fit"]),
        "location_fit": llm_explanation.get("location_fit", fallback["location_fit"]),
        "recommendation": llm_explanation.get("recommendation", fallback["recommendation"]),
    }

    print(f"[MATCH] compute_match completed: score={result['match_score']}")
    return result