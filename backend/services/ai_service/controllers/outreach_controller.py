import asyncio
import json
import re
import unicodedata

from schemas.ai import OutreachDraftRequest
from services.llm_client import ollama_client

# Recruiter-approved outreach only for strong matches (product rule).
OUTREACH_MIN_MATCH_SCORE = 80.0


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


def _salutation_name(payload: OutreachDraftRequest) -> str:
    if payload.candidate_display_name and payload.candidate_display_name.strip():
        return payload.candidate_display_name.strip()
    h = (payload.candidate.headline or "").strip()
    if h and len(h) < 80 and "\n" not in h:
        part = h.split("|")[0].strip()
        words = part.split()
        if words:
            return words[0]
    return "there"


def _signoff_name(payload: OutreachDraftRequest) -> str:
    if payload.recruiter_display_name and payload.recruiter_display_name.strip():
        return payload.recruiter_display_name.strip()
    return "Recruiting Team"


_LEADING_META = re.compile(
    r"^\s*(here'?s a professional outreach[^\n]*|here'?s an? professional outreach[^\n]*|"
    r"here'?s an? outreach[^\n]*|here is an? outreach[^\n]*|below is[^\n]*|"
    r"this is an? outreach[^\n]*|the following is[^\n]*|"
    r"here'?s (a|the) message[^\n]*)\s*:?\s*\n+",
    re.IGNORECASE | re.MULTILINE,
)


def _normalize_bracket_chars(text: str) -> str:
    return (
        text.replace("\uff3b", "[")
        .replace("\uff3d", "]")
        .replace("\u3010", "[")
        .replace("\u3011", "]")
    )


def _fix_leading_bracket_greeting(text: str, display_name: str) -> str:
    """Hi/Hello/Dear + […] when bracket clearly denotes candidate name → use real name."""
    g = (display_name or "there").strip()
    lines = text.splitlines()
    if not lines:
        return text

    def repl_first(m: re.Match[str]) -> str:
        greet = m.group(1)
        bracket = m.group(2)
        comma = m.group(3) or ""
        inner = bracket[1:-1]
        inner_n = inner.casefold()
        looks_candidate = (
            ("candidate" in inner_n and "name" in inner_n)
            or inner_n.strip() in ("name", "candidate")
            or re.search(r"\bcandid\w*\s+name\b", inner_n)
            or re.search(r"\bapplicant\s+name\b", inner_n)
        )
        looks_recruiter = "your" in inner_n and "name" in inner_n
        if looks_recruiter or not looks_candidate:
            return m.group(0)
        punct = "," if comma.strip() == "," or not comma.strip() else comma
        return f"{greet} {g}{punct}"

    lines[0] = re.sub(
        r"^(Hi|Hello|Dear)\s+(\[[^\]\r\n]+?\])(\s*,)?",
        repl_first,
        lines[0],
        flags=re.I,
    )
    return "\n".join(lines)


def sanitize_outreach_message(text: str, greeting_name: str, signoff_name: str) -> str:
    """Strip LLM meta-leaders and bracket placeholders so UI never shows template junk."""
    if not text or not str(text).strip():
        return text
    s = str(text).strip()
    try:
        s = unicodedata.normalize("NFKC", s)
    except Exception:
        pass
    s = _normalize_bracket_chars(s)
    for _ in range(5):
        nxt = _LEADING_META.sub("", s)
        if nxt == s:
            break
        s = nxt.strip()
    g = (greeting_name or "there").strip()
    r = (signoff_name or "Recruiting Team").strip()
    ws = r"[\s\u00A0\u202F\u2007]+"
    repls = (
        (re.compile(rf"\[\s*Candidate{ws}Name\s*\]", re.I), g),
        (re.compile(r"\[Candidate Name\]", re.I), g),
        (re.compile(r"\[Candidate(?:'|\u2019)s Name\]", re.I), g),
        (re.compile(r"\{Candidate Name\}", re.I), g),
        (re.compile(r"\[CandidateName\]", re.I), g),
        (re.compile(r"\[CANDIDATE_NAME\]", re.I), g),
        (re.compile(r"\[candidate_name\]", re.I), g),
        (re.compile(r"\[Your Name\]", re.I), r),
        (re.compile(r"\[\s*Your\s+Name\s*\]", re.I), r),
        (re.compile(r"\[Recruiter Name\]", re.I), r),
        (re.compile(r"\[Hiring Manager Name\]", re.I), r),
    )
    for pat, val in repls:
        s = pat.sub(val, s)
    s = _fix_leading_bracket_greeting(s, g)
    return s.strip()


def build_fallback_message(payload: OutreachDraftRequest, match_result: dict) -> str:
    match_score = float(match_result.get("match_score", 0.0))
    matched_skills = match_result.get("matched_skills", [])
    fit_band = get_fit_band(match_score)

    candidate_name = _salutation_name(payload)
    job_title = payload.job.title or "this role"

    sign = _signoff_name(payload)

    if fit_band == "high_fit":
        strengths = ", ".join(matched_skills[:3]) if matched_skills else "relevant backend technologies"
        return (
            f"Hi {candidate_name},\n\n"
            f"I came across your profile and thought you could be a strong fit for our {job_title} role. "
            f"Your background in {strengths} looks highly relevant to what we’re building. "
            f"If you're open to it, I’d love to share a few more details and see if this opportunity interests you.\n\n"
            f"Best regards,\n{sign}"
        )

    if fit_band == "medium_fit":
        strengths = ", ".join(matched_skills[:2]) if matched_skills else "relevant technical areas"
        return (
            f"Hi {candidate_name},\n\n"
            f"I wanted to reach out about our {job_title} role. "
            f"Your background shows promising overlap in areas like {strengths}, and I think it could be worth a conversation. "
            f"If you're open, I’d be happy to share more about the opportunity.\n\n"
            f"Best regards,\n{sign}"
        )

    return (
        f"Hi {candidate_name},\n\n"
        f"I’m reaching out regarding our {job_title} opening. "
        f"Your profile shows some potentially relevant experience, and I thought it may be worth sharing the role with you. "
        f"If you're interested, I’d be glad to send over more details.\n\n"
        f"Best regards,\n{sign}"
    )


async def generate_outreach(payload: OutreachDraftRequest, match_result: dict):
    print("[OUTREACH] generate_outreach started")

    match_score = float(match_result.get("match_score", 0.0))
    if match_score < OUTREACH_MIN_MATCH_SCORE:
        raise ValueError(
            f"Outreach requires a match score of at least {OUTREACH_MIN_MATCH_SCORE:.0f}% "
            f"(current {match_score:.1f}%)."
        )

    matched_skills = match_result.get("matched_skills", [])
    missing_skills = match_result.get("missing_skills", [])
    fit_band = get_fit_band(match_score)
    fit_guidance = build_fit_guidance(match_score, matched_skills, missing_skills)
    fallback_message = build_fallback_message(payload, match_result)

    cand_nm = _salutation_name(payload)
    rec_nm = _signoff_name(payload)

    system_prompt = (
        "You are a recruiter copilot. "
        "Write concise recruiter outreach emails. "
        "Be professional, personalized, and relevant to the candidate-job match. "
        "Follow the fit guidance carefully and avoid overstating candidate fit. "
        "Never use bracket placeholders such as [Candidate Name] or [Your Name]. "
        "Never invent a salutation name — use exactly the names given in the NAMES section. "
        "Start directly with the greeting line (Hi …,) — never prefix with meta text like "
        "\"Here's an outreach message\" or \"Below is\". "
        "Never use Dear [Candidate Name] or any bracketed name — use Hi and the exact given name."
    )

    user_prompt = f"""
Write a {payload.tone} outreach message for this candidate.

NAMES (use exactly — no placeholders):
- Address the candidate in the greeting as: Hi {cand_nm}, (use this spelling)
- Sign the message as:
Best regards,
{rec_nm}

Candidate profile:
{json.dumps(payload.candidate.model_dump(), indent=2)}

Job:
{json.dumps(payload.job.model_dump(), indent=2)}

Match result:
{json.dumps(match_result, indent=2)}

{fit_guidance}

Requirements:
- Keep it under 180 words
- Start with "Hi {cand_nm}," on its own opening line
- End with the sign-off above exactly (Best regards, then {rec_nm} on the next line)
- Mention why the candidate is relevant to THIS job
- Mention 2-3 matching strengths when the fit is high
- For medium fit, be balanced and realistic
- For low fit, stay exploratory and do not overclaim
- Return plain text only — no subject line, no markdown
"""

    try:
        message = await asyncio.wait_for(
            ollama_client.chat_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            ),
            timeout=20.0,
        )
        message = sanitize_outreach_message(message, cand_nm, rec_nm)
        print("[OUTREACH] generate_outreach completed with llm")
    except Exception as exc:
        print(f"[OUTREACH] llm draft failed or timed out: {exc}")
        message = fallback_message
        print("[OUTREACH] generate_outreach completed with fallback")

    if not (message or "").strip():
        message = fallback_message

    return {
        "recruiter_id": payload.recruiter_id,
        "candidate_id": payload.candidate.member_id,
        "job_id": payload.job.job_id,
        "tone": payload.tone,
        "fit_band": fit_band,
        "match_score": match_score,
        "message": message,
    }