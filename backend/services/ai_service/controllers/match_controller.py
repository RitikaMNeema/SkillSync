import asyncio
import json
import re
from typing import Dict, List, Any, Tuple

from schemas.ai import AIMatchRequest
from services.embedding_service import embedding_service
from services.llm_client import ollama_client

# Common English noise tokens for lexical overlap (not domain skills).
_SKILL_STOP = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "have",
        "has",
        "was",
        "were",
        "into",
        "over",
        "such",
        "also",
        "any",
        "all",
        "are",
        "been",
        "being",
        "both",
        "but",
        "not",
        "you",
        "our",
        "will",
        "can",
        "may",
        "via",
        "using",
        "including",
        "other",
        "each",
        "their",
        "more",
        "than",
        "year",
        "years",
        "work",
        "team",
        "role",
        "job",
        "your",
        "what",
        "how",
        "who",
        "its",
        "about",
        "well",
        "make",
        "made",
        "like",
        "just",
        "one",
        "two",
        "new",
        "old",
        "high",
        "low",
        "best",
        "must",
        "able",
        "need",
        "required",
        "preferred",
        "strong",
        "good",
        "great",
        "excellent",
    }
)


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


def _tokenize_skill_phrase(phrase: str) -> List[str]:
    return [p for p in re.split(r"[^a-z0-9+#.]+", phrase.lower()) if len(p) >= 3]


def _blob_tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[a-z0-9+#.]{3,}", text.lower())
        if t not in _SKILL_STOP
    }


def fuzzy_job_skill_coverage(
    job_skills: List[str],
    candidate_skills: List[str],
    candidate_blob: str,
) -> Tuple[float, List[str], List[str]]:
    """
    Share of required job skills that appear in structured skills and/or résumé-style text.
    Avoids penalizing candidates who express tools only in experience paragraphs.
    """
    raw_required = [s.strip() for s in job_skills if s and str(s).strip()]
    if not raw_required:
        return 100.0, [], []

    cand_set = set(normalize_skills(candidate_skills))
    blob = candidate_blob.lower()
    matched: List[str] = []
    missing: List[str] = []

    for raw in raw_required:
        js = raw.lower()
        ok = False
        if js in cand_set:
            ok = True
        elif js in blob:
            ok = True
        else:
            for cs in cand_set:
                if len(cs) >= 3 and (js in cs or cs in js):
                    ok = True
                    break
        if not ok:
            parts = _tokenize_skill_phrase(js)
            if parts and all(p in blob for p in parts):
                ok = True
        (matched if ok else missing).append(raw)

    pct = (len(matched) / len(raw_required)) * 100.0
    return pct, sorted(matched, key=str.lower), sorted(missing, key=str.lower)


def lexical_similarity_score(candidate_text: str, job_text: str) -> float:
    """
    Vocabulary recall / F1 proxy when embeddings are unavailable (timeout, outage).
    """
    ct = _blob_tokens(candidate_text)
    jt = _blob_tokens(job_text)
    if not jt:
        return 55.0
    inter = len(ct & jt)
    recall = inter / len(jt)
    prec = inter / max(1, len(ct))
    f1 = (2 * recall * prec) / (recall + prec + 1e-9)
    return max(0.0, min(100.0, 100.0 * f1))


def _blend_match_score(overlap_score: float, embedding_score: float, location_bonus: float) -> float:
    """
    Emphasize semantic fit over exact string skill matches so strong profiles are not stuck ~30%.
    When embeddings and fuzzy skill coverage are both strong, allow scores in the high 90s
    (closer to how a human or GPT would rate obvious fits).
    """
    base = 0.18 * overlap_score + 0.77 * embedding_score + location_bonus
    base = min(100.0, base)
    # When both semantic and fuzzy skill coverage are strong, lift toward human/GPT-like ratings.
    if embedding_score >= 78.0 and overlap_score >= 38.0:
        boosted = 0.82 * embedding_score + 0.16 * overlap_score + min(location_bonus, 6.0)
        base = max(base, min(98.0, boosted))
    if embedding_score >= 85.0 and overlap_score >= 55.0:
        boosted2 = 0.88 * embedding_score + 0.10 * overlap_score + min(location_bonus, 4.0)
        base = max(base, min(99.0, boosted2))
    # Excellent semantic + solid fuzzy overlap: recover "obvious fit" scores (~97–98).
    if embedding_score >= 80.0 and overlap_score >= 45.0:
        stretch = embedding_score + min(18.0, (100.0 - embedding_score) * 0.72)
        base = max(base, min(98.0, stretch + min(4.0, location_bonus)))
    return round(min(100.0, base), 2)


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

    job_skills = normalize_skills(job.skills_required)

    # Prefer resume_text (full uploaded resume) as the primary semantic signal.
    # Fall back to structured profile fields when it is absent.
    resume_text = (getattr(candidate, "resume_text", None) or "").strip()
    candidate_text = " ".join(filter(None, [
        candidate.headline or "",
        candidate.summary or "" if not resume_text else "",
        " ".join(candidate.skills or []),
        " ".join(candidate.experiences or []),
        " ".join(candidate.education or []),
        resume_text,   # full resume text — gives embeddings rich semantic content
    ])).strip()

    # When the profile skills list is empty but a resume is present, augment the
    # skills list with any job-required skills that appear verbatim in the resume text
    # so that fuzzy_job_skill_coverage can detect them.
    effective_skills = list(candidate.skills or [])
    if resume_text and not effective_skills:
        rt_lower = resume_text.lower()
        for js in (job.skills_required or []):
            if js.strip().lower() in rt_lower and js not in effective_skills:
                effective_skills.append(js)

    candidate_skills = normalize_skills(effective_skills)

    job_text = " ".join([
        job.title or "",
        job.description or "",
        " ".join(job.skills_required or []),
        job.location or "",
        job.seniority_level or "",
        job.employment_type or "",
    ])

    overlap_score, matched_skills, missing_skills = fuzzy_job_skill_coverage(
        job.skills_required or [],
        effective_skills,
        candidate_text,
    )

    # Run embeddings concurrently with timeout protection
    candidate_embedding, job_embedding = await asyncio.gather(
        safe_embed(candidate_text),
        safe_embed(job_text),
    )

    embedding_used_lexical_fallback = False
    if candidate_embedding is None or job_embedding is None:
        print("[MATCH] embedding unavailable, using lexical similarity fallback")
        embedding_score = lexical_similarity_score(candidate_text, job_text)
        embedding_used_lexical_fallback = True
    else:
        try:
            cosine = embedding_service.cosine_similarity(candidate_embedding, job_embedding)
            embedding_score = max(0.0, min(100.0, cosine * 100.0))
        except Exception as exc:
            print(f"[MATCH] cosine similarity failed: {exc}, using lexical similarity fallback")
            embedding_score = lexical_similarity_score(candidate_text, job_text)
            embedding_used_lexical_fallback = True

    location_bonus = 0.0
    if job.location and candidate.location:
        if candidate.location.strip().lower() == job.location.strip().lower():
            location_bonus = 10.0

    final_score = _blend_match_score(overlap_score, embedding_score, location_bonus)

    # Heuristic confidence: emphasize semantic signal when embeddings ran; lexical fallback is noisier.
    if embedding_used_lexical_fallback:
        confidence = round(0.35 * overlap_score + 0.65 * embedding_score, 1)
    else:
        confidence = round(0.25 * overlap_score + 0.75 * embedding_score, 1)
    confidence = max(0.0, min(100.0, confidence))

    # Heuristic confidence: average of the two main signals (skill overlap vs semantic similarity), 0–100.
    confidence = round((overlap_score + embedding_score) / 2.0, 1)
    confidence = max(0.0, min(100.0, confidence))

    system_prompt = (
        "You are a hiring assistant. "
        "Given candidate and job data plus computed scoring features, "
        "return a brief structured explanation. "
        "Return valid JSON only."
    )

    candidate_dump = candidate.model_dump()
    # Truncate resume_text in the prompt to keep token count manageable.
    if candidate_dump.get("resume_text"):
        candidate_dump["resume_text"] = candidate_dump["resume_text"][:3000]

    user_prompt = f"""
Candidate:
{json.dumps(candidate_dump, indent=2)}

Job:
{json.dumps(job.model_dump(), indent=2)}

Computed features:
- overlap_score (fuzzy required-skill coverage vs résumé text): {overlap_score}
- embedding_score (vector similarity, or lexical fallback if embeddings failed): {embedding_score}
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