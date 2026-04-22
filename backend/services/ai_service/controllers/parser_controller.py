from typing import Dict, List
from schemas.ai import ResumeParseRequest


COMMON_SKILLS = {
    "python", "java", "sql", "fastapi", "docker", "kafka", "mongodb", "mysql",
    "redis", "aws", "react", "node", "machine learning", "ml", "ai", "backend",
    "frontend", "microservices", "api", "pandas", "numpy", "spark", "dbt"
}


def _normalize(text: str) -> str:
    return text.lower().strip()


async def parse_profile(payload: ResumeParseRequest) -> Dict:
    combined_text = " ".join(
        [
            payload.headline,
            payload.summary,
            " ".join(payload.experiences),
            " ".join(payload.education),
            " ".join(payload.skills),
        ]
    ).lower()

    extracted_skills: List[str] = []
    for skill in COMMON_SKILLS:
        if skill in combined_text and skill not in extracted_skills:
            extracted_skills.append(skill)

    for skill in payload.skills:
        normalized = _normalize(skill)
        if normalized and normalized not in extracted_skills:
            extracted_skills.append(normalized)

    years_of_experience = min(max(len(payload.experiences), 0) * 2, 15)

    highest_education = ""
    edu_text = " ".join(payload.education).lower()
    if "phd" in edu_text:
        highest_education = "PhD"
    elif "master" in edu_text or "ms" in edu_text or "m.s" in edu_text:
        highest_education = "Masters"
    elif "bachelor" in edu_text or "bs" in edu_text or "b.s" in edu_text:
        highest_education = "Bachelors"
    else:
        highest_education = "Unknown"

    return {
        "member_id": payload.member_id,
        "skills": extracted_skills,
        "years_of_experience": years_of_experience,
        "highest_education": highest_education,
        "parsed_summary": {
            "headline": payload.headline,
            "summary": payload.summary,
            "experience_count": len(payload.experiences),
            "education_count": len(payload.education),
        },
    }