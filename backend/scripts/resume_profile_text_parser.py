"""
Heuristic parser for a single block of résumé-style text into SkillSync member profile fields.

Maps narrative + labeled sections into: headline hint, summary/about, experience[], education[],
skills[], languages[] (only when explicitly listed). Designed for common layouts like:
  Summary … Qualifications … Relevant Experience … Experience MM/YYYY … Education … Affiliations … Skills …
"""

from __future__ import annotations

import re
from typing import Any

# Keep aligned with profile_service `member_mysql.SKILL_NAME_MAX_CHARS` (MySQL skills.skill_name).
SKILL_NAME_MAX_CHARS = 255


def _clamp_skill_token(name: str) -> str:
    s = name.strip()
    if len(s) <= SKILL_NAME_MAX_CHARS:
        return s
    return s[:SKILL_NAME_MAX_CHARS].rstrip()


_MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

_MONTH_RE = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"

def looks_parseable_resume_blob(text: str | None) -> bool:
    """True when text looks like the common single-block résumé layout we can split into tabs."""
    if not text or len(text.strip()) < 250:
        return False
    t = text.strip()
    return bool(
        re.search(r"\d{2}/\d{4}\s+to\s+\d{2}/\d{4}", t)
        and re.search(r"\bEducation\b", t, re.I)
        and re.search(r"\bSkills\b", t, re.I)
    )


_DEGREE_EXPAND = {
    "BS": "Bachelor of Science",
    "BA": "Bachelor of Arts",
    "BBA": "Bachelor of Business Administration",
    "MS": "Master of Science",
    "MA": "Master of Arts",
    "MBA": "Master of Business Administration",
    "AS": "Associate of Science",
    "AAS": "Associate of Applied Science",
    "AA": "Associate of Arts",
}


def _mm_yyyy_to_meta(mm_yyyy: str) -> tuple[str, int, str]:
    mm, yyyy = mm_yyyy.split("/", 1)
    mi = int(mm, 10)
    y = int(yyyy, 10)
    return _MONTH_NAMES[mi - 1], y, f"{y}-{mm.zfill(2)}"


def _fix_runon_words(t: str) -> str:
    """Insert spaces where words were pasted together (e.g. chargesFill → charges Fill)."""
    if not t:
        return t
    t = re.sub(r"([a-z0-9])([A-Z][a-z])", r"\1 \2", t)
    t = re.sub(r"([.!?])([A-Z])", r"\1 \2", t)
    return t


def _normalize_headline(h: str) -> str:
    """Turn HR ASSISTANT → HR Assistant while keeping short acronyms uppercase."""
    words: list[str] = []
    for w in h.split():
        if w.isupper() and len(w) <= 4:
            words.append(w)
        elif w.isupper():
            words.append(w.capitalize())
        else:
            words.append(w)
    out = " ".join(words).strip()
    return out[:220] if out else out


def _extract_qualification_phrases(raw: str) -> list[str]:
    """Split 'Qualifications … Relevant Experience' block into skill-like phrases."""
    m = re.search(
        r"\bQualifications\s+(.+?)\s+\bRelevant Experience\b",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not m:
        return []
    blob = m.group(1).strip()
    parts = re.split(r"(?<=[a-z])\s+(?=[A-Z])", blob)
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        s = _clamp_skill_token(p.strip())
        if len(s) < 3:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def merge_skill_lists(*lists: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        if not lst:
            continue
        for s in lst:
            t = _clamp_skill_token((s or "").strip())
            if len(t) < 2:
                continue
            k = t.casefold()
            if k in seen:
                continue
            seen.add(k)
            out.append(t)
    return out


def _normalize_description(body: str) -> str:
    t = body.strip()
    if not t:
        return ""
    t = _fix_runon_words(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s*•\s*", "\n• ", t)
    t = re.sub(r"(?<!\n)•\s*", "\n• ", t)
    return t.strip()


def _split_skills_blob(blob: str) -> list[str]:
    blob = blob.strip()
    blob = re.split(r"\.\s+(?:these|this)\s+text\b", blob, maxsplit=1, flags=re.I)[0]
    blob = blob.rstrip(".")
    parts = re.split(r",|\u2022|;", blob)
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        s = _clamp_skill_token(p.strip())
        if len(s) < 2:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def _extract_headline_from_about(about: str) -> str | None:
    m = re.match(r"^([^\n]+?)\s+Professional Profile\b", about, flags=re.I)
    if not m:
        return None
    h = _normalize_headline(m.group(1).strip())
    return h[:220] if h else None


def _parse_experience_region(region: str) -> list[dict[str, Any]]:
    pattern = re.compile(r"(\d{2}/\d{4})\s+to\s+(\d{2}/\d{4})\s+", re.MULTILINE)
    matches = list(pattern.finditer(region))
    if not matches:
        return []

    entries: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        start_raw, end_raw = m.group(1), m.group(2)
        chunk_start = m.end()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(region)
        chunk = region[chunk_start:chunk_end].strip()
        if not chunk:
            continue

        lines = chunk.splitlines()
        first = lines[0].strip() if lines else ""
        rest_lines = [ln.strip() for ln in lines[1:] if ln.strip()]
        body_tail = "\n".join(rest_lines)

        hdr_m = re.match(
            r"^(.+?)\s+-\s*([^,]+)\s*,\s*(\S+)\s+(.*)$",
            first,
        )
        if not hdr_m:
            continue

        title_company = hdr_m.group(1).strip()
        city = hdr_m.group(2).strip()
        state_token = hdr_m.group(3).strip()
        desc_first = hdr_m.group(4).strip()
        description = _normalize_description("\n".join([desc_first, body_tail]).strip())

        company = ""
        title = title_company
        if "Company Name" in title_company:
            idx = title_company.index("Company Name")
            title = title_company[:idx].strip()
            company = title_company[idx:].strip()
        else:
            parts = title_company.split()
            if len(parts) >= 4:
                title = " ".join(parts[:3])
                company = " ".join(parts[3:])
            elif len(parts) >= 2:
                title = " ".join(parts[:2])
                company = " ".join(parts[2:])

        sm, sy, start_iso = _mm_yyyy_to_meta(start_raw)
        em, ey, end_iso = _mm_yyyy_to_meta(end_raw)

        loc = f"{city}, {state_token}" if city or state_token else None

        entries.append(
            {
                "title": title or None,
                "company": company or None,
                "employment_type": "Full-time",
                "location": loc,
                "start_month": sm,
                "start_year": sy,
                "end_month": em,
                "end_year": ey,
                "start": start_iso,
                "end": end_iso,
                "is_current": False,
                "description": description or None,
            }
        )
    return entries


def _split_field_and_school(tail: str) -> tuple[str, str] | None:
    """
    tail is like 'Field Name University of Foo -' or 'Field Madison Technical College -'.
    Prefer explicit school tokens so we do not swallow the field into a greedy '+College' match.
    """
    fixed: list[re.Match[str]] = []
    for pat in (
        r"(University of [^-]+)",
        r"(Madison Technical College)",
    ):
        for m in re.finditer(pat + r"\s+-\s*", tail):
            fixed.append(m)
    if fixed:
        best = max(fixed, key=lambda m: m.start())
        school = best.group(1).strip()
        field_guess = tail[: best.start()].strip()
        return field_guess, school

    generic = re.search(r"(.+?)\s+([A-Za-z][\w\s/&'-]*College)\s+-\s*", tail)
    if generic:
        return generic.group(1).strip(), generic.group(2).strip()
    return None


def _parse_education_section(section: str) -> list[dict[str, Any]]:
    section = section.strip()
    if not section:
        return []

    chunks = re.split(
        rf"(?=(?:(?:{_MONTH_RE})\s+\d{{4}})\s+(?:[A-Za-z]+)\s*:)",
        section,
    )
    out: list[dict[str, Any]] = []
    for raw in chunks:
        chunk = raw.strip()
        if not chunk:
            continue

        head = re.match(
            rf"^({_MONTH_RE})\s+(\d{{4}})\s+([A-Za-z]+)\s*:\s*(.+)$",
            chunk,
        )
        if not head:
            continue

        month_w = head.group(1)
        year = int(head.group(2), 10)
        deg_abbr = head.group(3)
        tail = head.group(4).strip()

        split = _split_field_and_school(tail)
        if not split:
            continue
        field_guess, school = split

        activities_extra = ""
        suf_ai = "Activities and Interests"
        if field_guess.rstrip().endswith(suf_ai):
            field_guess = field_guess[: -len(suf_ai)].rstrip()
            activities_extra = suf_ai
        elif re.search(rf"\b{re.escape(suf_ai)}\b", field_guess):
            parts = re.split(rf"\s+{re.escape(suf_ai)}\s+", field_guess, maxsplit=1)
            field_guess = parts[0].strip()
            tail_ai = parts[1].strip() if len(parts) > 1 else ""
            activities_extra = (
                f"{suf_ai}: {tail_ai}".strip() if tail_ai else suf_ai
            )

        suf = re.search(re.escape(school) + r"\s+-\s*(.+)$", tail)
        if not suf:
            continue
        after = suf.group(1).strip()

        loc_m = re.match(r"^([^,]+)\s*,\s*(\S+)\s*(.*)$", after)
        if not loc_m:
            continue

        remainder = loc_m.group(3).strip()
        if field_guess and remainder.startswith(field_guess):
            remainder = remainder[len(field_guess) :].strip()

        degree = _DEGREE_EXPAND.get(deg_abbr.upper(), deg_abbr)

        activities = " ".join(x for x in [activities_extra, remainder] if x).strip() or None

        out.append(
            {
                "school": school,
                "degree": degree,
                "field": field_guess or None,
                "year": year,
                "end_month": month_w,
                "end_year": year,
                "activities": activities,
            }
        )
    return out


def parse_resume_profile_blob(text: str) -> dict[str, Any]:
    """
    Parse free-form résumé text into profile-shaped dict keys compatible with member update APIs.

    Returns keys: headline (optional), summary, about, experience, education, skills, languages.
    """
    raw = text.replace("\r\n", "\n").strip()
    if not raw:
        return {
            "headline": None,
            "summary": "",
            "about": "",
            "experience": [],
            "education": [],
            "skills": [],
            "languages": [],
        }

    exp_region_m = re.search(
        rf"(?:^|\bExperience\s+)(?P<body>(?:\d{{2}}/\d{{4}}\s+to\s+\d{{2}}/\d{{4}}).+?)(?=\bEducation\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    edu_m = re.search(
        rf"\bEducation\s+(?P<body>.+?)(?=\bAffiliations\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    affil_m = re.search(
        rf"\bAffiliations\s+(?P<body>.+?)(?=\bSkills\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    skills_m = re.search(r"\bSkills\s+(?P<body>.+)$", raw, flags=re.DOTALL | re.IGNORECASE)

    exp_region = exp_region_m.group("body") if exp_region_m else ""
    experience = _parse_experience_region(exp_region)
    education = _parse_education_section(edu_m.group("body")) if edu_m else []

    skills: list[str] = []
    if skills_m:
        skills = _split_skills_blob(skills_m.group("body"))
    skills = merge_skill_lists(skills, _extract_qualification_phrases(raw))

    exp_start = re.search(r"\bExperience\s+\d{2}/\d{4}", raw, flags=re.IGNORECASE)
    about_cut = exp_start.start() if exp_start else None
    if about_cut is None:
        fallback = re.search(r"\d{2}/\d{4}\s+to\s+\d{2}/\d{4}", raw)
        about_cut = fallback.start() if fallback else len(raw)

    about_core = raw[:about_cut].strip()
    affil_text = affil_m.group("body").strip() if affil_m else ""
    about_parts = [about_core]
    if affil_text:
        about_parts.append("Affiliations\n" + affil_text)
    about = "\n\n".join(p for p in about_parts if p).strip()

    headline = _extract_headline_from_about(about_core) or _extract_headline_from_about(raw)
    if headline:
        headline = _normalize_headline(headline)

    langs = _parse_languages_section(raw)

    return {
        "headline": headline,
        "summary": about,
        "about": about,
        "experience": experience,
        "education": education,
        "skills": skills,
        "languages": langs,
    }


_LANG_LINE = re.compile(
    rf"(?im)^(?:Languages?|Language)\s*[:\-]\s*(.+)$",
)


def _parse_languages_section(text: str) -> list[dict[str, str]]:
    """Very small helper: only fills languages when an explicit 'Languages:' line exists."""
    m = _LANG_LINE.search(text)
    if not m:
        return []
    line = m.group(1).strip()
    parts = re.split(r"[,;]|(?:\s+and\s+)", line, flags=re.I)
    out: list[dict[str, str]] = []
    for p in parts:
        name = p.strip()
        if len(name) < 2:
            continue
        out.append({"name": name, "proficiency": "Professional working proficiency"})
    return out


if __name__ == "__main__":
    import json

    sample = """HR ASSISTANT Professional Profile Skilled Program Coordinator bringing extensive background in technology and business process. Organized, resourceful and detail-oriented with exceptional planning and decision-making abilities. Qualifications Human resources understanding Scheduling proficiency Market research proficiency Report generation Critical thinking Eye for detail Self-directed nature Analytical problem solving Contracts Social media and networks Microsoft Office Suite PowerPoint Exceptional telephone etiquette Patient and diligent Relevant Experience Coordinated all department functions for team of 120+ employees. Planned and executed all aspects of a major office headquarter move. Increased office organization by developing more efficient filing system and customer database protocols.Successfully planned and executed corporate meetings, lunches and special events for groups of 100+ employees. Experience 01/2014 to 09/2015 HR Assistant Company Name - City , State Pay for registration and conference fees with purchasing card Reconcile purchasing card every 2 weeks to assure there are no taxes or additional chargesFill out Verification of Employment paperwork as it comes in Assess needs of the office and order any supplies that may be needed Assist Office Manager with monthly budget Onboarding/organizing training of new employees Trained on all AV equipment in 9 conference rooms Back up Office Manager when she's out of office Train new employees/students on front desk and mail room procedures Off boarding for terminated or retired employees Organizing/verifying all technology purchases through DoIT Take meeting minutes for Managers weekly meetings Assist with setting up/participating in phone and in person interviews- 5 to 30 at a time Coordinate and organize ETF/Finance meetings in house Create external recruitments and post on websites Create documentation on processes for office Assist with recruitment panels and interviews as needed Assist with travel arrangements for employees (eg; hotel arrangements, fleet cars, etc.) Assist with setting up meetings for college Directors/Chancellors along with coordinating AV equipment and meals Help employees with travel reimbursements Facility coordinator for any heating, electrical or water issues Floor captain/Assisted with creating an Occupant Emergency Plan (OEP) Track Affirmative Action documentation and create reports for Directors Assist with New Employee Orientations. 01/2012 to 01/2014 ORCD Office Coordinator Company Name - City , State •Prepare, document billing codes and send Travel Reimbursements for 10-12 staff •Track and compile 60-70 registrations for Quality Team trainings, as well as attain meeting space for these events on a monthly basis •Coordinate 8-10 meetings for Director and staff with internal/external personnel •Assist with coordinating 2 annual conferences of 400-500 attendees and attend as IT Lead •Assist with cellular phones and tablet set up/troubleshooting •Review credit card statements from 10-12 staff for proper coding and tax exemptions •Create Select Surveys to acquire different information from our ADRC and internal staff •Compound information to create multiple spreadsheets in Excel and tables for various documentations to be sent to external resources •Created 2 databases in Access for tracking upwards of 500 entries a month; created reports for management on a weekly basis for Project Steering committees •Effective knowledge with problem solving as well as emphatic written and oral communication techniques •Format correspondence letters and PDF documents for internal staff •Assist with contacting interviewees and scheduling interviews for different positions •Develop Access database and Excel spreadsheets for proper recording of documentation from ADRC staff and internal procedures •Extensive working knowledge of computer programs (ie; Microsoft Word, Excel, Access, etc.) 04/2010 to 01/2012 Inside Sales/ Administrative Support Company Name - City , State Construct and send Invoices to guarantee payment from 80-100 customers through Quickbooks and Tigerpaw Resolve any questions or concerns customers may have about invoices or sales to confirm they are content Schedule engineers weekly for onsite assignments and Help Desk to guarantee customer satisfaction Order product for small projects- coordinate meetings with clients and engineers to ensure correct product is being ordered Compose Service Reports on a monthly basis to ensure customer satisfaction Build product quotes for customers to achieve daily sales (eg; software, Anti-Virus, routers, printers, etc.) Create weekly spreadsheets for annual renewals and product sales; relay information to President of the company for weekly meetings Design marketing brochures and any daily changes to company website to keep customers up to date with new technology and products Create manual for 'How To" on procedures for sales in TigerPaw software Work with vendors to get update to date pricing and versions of software/product Education December 2006 BS : Business Management University of Eau Claire - City , State Business Management Student government representative May 2014 AS : Human Resource Management Madison Technical College - City , State Human Resource Management May 2014 AAS : Accounting Assistant Activities and Interests Madison Technical College - City , State Accounting Assistant Affiliations Member of Society for Human Resource Management (SHRM) 2013 - Present Secretary for Young Professionals Group committee with HEUG 2014 - Present Skills Administrative Support, Anti-Virus, billing, budget, oral communication, conferences, clients, customer satisfaction, databases, documentation, Finance, Help Desk, Inside Sales, marketing, meetings, Access database, Excel spreadsheets, PowerPoint, Microsoft Word, Office Manager, Organizing, pricing, printers, problem solving, processes, coding, purchasing, Quality, recording, recruitment, sales, scheduling, spreadsheets, Surveys, travel arrangements, troubleshooting, websites, written communication."""

    parsed = parse_resume_profile_blob(sample)
    print(json.dumps(parsed, indent=2))
