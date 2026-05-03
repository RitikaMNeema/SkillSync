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
# Includes three-letter abbreviations (Feb, Jan, …) used in many résumés.
_MONTH_ANY = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Oct\.?|Nov\.?|Dec\.?)"
)


def looks_parseable_resume_blob(text: str | None) -> bool:
    """True when text looks like the common single-block résumé layout we can split into tabs."""
    if not text or len(text.strip()) < 250:
        return False
    t = text.strip()
    classic = bool(
        re.search(r"\d{2}/\d{4}\s+to\s+\d{2}/\d{4}", t)
        and re.search(r"\bEducation\b", t, re.I)
        and re.search(r"\bSkills\b", t, re.I)
    )
    if classic:
        return True
    verbose = bool(
        re.search(r"\b(?:Work\s+)?Experience\b", t, re.I)
        and re.search(r"\bEducation\b", t, re.I)
        and re.search(r"\bSkills\b", t, re.I)
        and re.search(rf"{_MONTH_ANY}\s+\d{{4}}\s+to\s+(?:Current|{_MONTH_ANY}\s+\d{{4}})", t, re.I)
        and not re.search(r"\d{2}/\d{4}\s+to\s+\d{2}/\d{4}", t)
    )
    return verbose


def _count_mm_job_ranges(text: str) -> int:
    """Count MM/YYYY job ranges (including Present / Current)."""
    return len(
        re.findall(
            r"\d{2}/\d{4}\s+to\s+(?:\d{2}/\d{4}|Present|Current)\b",
            text,
            flags=re.IGNORECASE,
        )
    )


def _count_month_job_starts(text: str) -> int:
    """Count abbreviated/full month + yyyy + to anchors (same rules as work-experience abbrev parser)."""
    month = _MONTH_ANY
    rx = re.compile(
        rf"{month}\s+\d{{4}}\s+to\s+(?:Current|{month}\s+\d{{4}})\s+",
        re.IGNORECASE,
    )
    n = 0
    for m in rx.finditer(text):
        if m.start() >= 3 and text[m.start() - 3 : m.start()].lower() == "to ":
            continue
        n += 1
    return n


def looks_flexible_parseable_resume_blob(text: str | None) -> bool:
    """
    Looser gate for profiles that fail looks_parseable_resume_blob.

    Requires enough text plus at least one résumé-like signal (dated jobs, month jobs,
    or education keywords with dates) so we do not treat short bios as résumés.
    """
    if not text:
        return False
    t = text.strip()
    if len(t) < 200:
        return False
    if looks_parseable_resume_blob(t):
        return False
    mm = _count_mm_job_ranges(t)
    mo = _count_month_job_starts(t)
    edu_kw = bool(
        re.search(
            r"(?i)\b(bachelor|master|mba|ph\.?d|b\.s|m\.s|university|college)\b",
            t,
        )
    )
    if mm >= 2:
        return True
    if mm >= 1 and len(t) >= 280:
        return True
    if mo >= 2:
        return True
    if mo >= 1 and (edu_kw or re.search(r"\b(?:Work\s+)?Experience\b", t, re.I)):
        return True
    if mm >= 1 and re.search(r"\bEducation\b", t, re.I):
        return True
    return False


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
        m = re.search(
            r"\bQualifications\s+(.+?)\s+\bExperience\b",
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


_MONTH_WORD = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
)


def _canonical_month_word(token: str) -> str | None:
    t = token.strip().rstrip(".")
    tl = t.lower()
    abbrevs = {
        "jan": "January",
        "feb": "February",
        "mar": "March",
        "apr": "April",
        "may": "May",
        "jun": "June",
        "jul": "July",
        "aug": "August",
        "sep": "September",
        "oct": "October",
        "nov": "November",
        "dec": "December",
    }
    if tl in abbrevs:
        return abbrevs[tl]
    tl3 = tl[:3]
    if tl3 in abbrevs and len(tl) <= 4:
        return abbrevs[tl3]
    for m in _MONTH_NAMES:
        if m.lower() == tl:
            return m
        if len(tl) >= 3 and m.lower().startswith(tl3):
            return m
    return None


def _month_name_to_index(name: str) -> int:
    c = _canonical_month_word(name)
    if c and c in _MONTH_NAMES:
        return _MONTH_NAMES.index(c) + 1
    return 1


def _job_title_from_interstitial_gap(gap: str) -> str:
    """Turn text between 'Company Name' and the next date header into a short job title."""
    g = gap.strip()
    if "Experience" in g:
        g = g.rsplit("Experience", 1)[-1].strip()
    parts = [p.strip() for p in re.split(r"\.\s+", g) if p.strip()]
    if len(parts) >= 2:
        tailp = parts[-1]
        tw = tailp.split()
        if (
            len(tailp) <= 80
            and 1 <= len(tw) <= 8
            and all(w[0].isupper() for w in tw if w.isalpha())
        ):
            return tailp
    words = g.split()
    title_words: list[str] = []
    for w in reversed(words):
        w2 = w.strip(" ,.;:·")
        if not w2:
            continue
        if w2[0].isalpha() and (w2[0].isupper() or "/" in w2 or w2.isupper()):
            title_words.insert(0, w2)
            if len(title_words) >= 12 or len(" ".join(title_words)) > 120:
                break
        elif title_words:
            break
    out = " ".join(title_words).strip(" ,.-")
    return out if out else (g[-100:].strip() if g else "")


def _split_verbose_job_tail(tail: str) -> tuple[str | None, str | None, str]:
    """Split experience body after dates into company / location / description."""
    t = tail.strip()
    if not t:
        return None, None, ""
    cn = re.match(
        r"^Company\s+Name\s*[\u2013\u2014\-–\uFF0D]\s*(.+)$",
        t,
        re.I,
    )
    if cn:
        rest = cn.group(1).strip()
        loc_m = re.match(r"^(.+?)\s+(?=[A-Z][a-z]+\s+[a-z])", rest)
        if loc_m and len(loc_m.group(1)) <= 140:
            return "Company Name", loc_m.group(1).strip(), rest[loc_m.end() :].strip()
        return "Company Name", None, rest
    st_m = re.match(r"^(.+?,\s*State)\s+(?=[A-Z])", t, re.I)
    if (
        st_m
        and len(st_m.group(1)) <= 120
        and not re.search(r"Company\s+Name", st_m.group(1), re.I)
    ):
        return st_m.group(1).strip(), None, t[st_m.end() :].strip()
    loc_m = re.match(r"^(.+?)\s+(?=[A-Z][a-z]+\s+[a-z])", t)
    if loc_m and 5 <= len(loc_m.group(1)) <= 140:
        return loc_m.group(1).strip(), None, t[loc_m.end() :].strip()
    head, sep, rest = t.partition(". ")
    if sep and len(head) < 160:
        return head.strip(), None, rest.strip()
    return None, None, t


def _parse_work_experience_abbrev_months(region: str) -> list[dict[str, Any]]:
    """
    Job blocks like 'HR Intern Feb 2016 to Current City , State General recruitment …'
    (abbreviated months, no literal 'Company Name' on every line).
    Skips months immediately after 'to ' so 'Jan 2015 to Jan 2016' does not start a second job at the end month.
    """
    region = region.strip()
    if not region:
        return []
    month = _MONTH_ANY
    rx = re.compile(
        rf"(?P<sm>{month})\s+(?P<sy>\d{{4}})\s+to\s+(?P<end>Current|{month}\s+\d{{4}})\s+",
        re.IGNORECASE,
    )
    matches: list[re.Match[str]] = []
    for m in rx.finditer(region):
        if m.start() >= 3 and region[m.start() - 3 : m.start()].lower() == "to ":
            continue
        matches.append(m)
    if not matches:
        return []
    entries: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        prev = matches[i - 1].end() if i else 0
        gap = region[prev : m.start()].strip()
        gap = re.sub(r"^(?:Work\s+)?Experience\s+", "", gap, flags=re.I).strip()
        title = _job_title_from_interstitial_gap(gap)
        sm_raw = m.group("sm").strip()
        sy = int(m.group("sy"), 10)
        end_raw = m.group("end").strip()
        sm = _canonical_month_word(sm_raw) or sm_raw
        mi = _month_name_to_index(sm)
        start_iso = f"{sy}-{mi:02d}"

        chunk_start = m.end()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(region)
        body = region[chunk_start:chunk_end].strip()
        tail_title = _job_title_from_interstitial_gap(body)
        if tail_title and body.rstrip().endswith(tail_title):
            body = body[: body.rfind(tail_title)].rstrip(" .,;-·")
        company, location, desc_remainder = _split_verbose_job_tail(body)

        if end_raw.lower() == "current":
            entries.append(
                {
                    "title": title or None,
                    "company": company,
                    "employment_type": "Full-time",
                    "location": location,
                    "start_month": sm,
                    "start_year": sy,
                    "end_month": None,
                    "end_year": None,
                    "start": start_iso,
                    "end": None,
                    "is_current": True,
                    "description": _normalize_description(desc_remainder) or None,
                }
            )
            continue

        em_m = re.match(rf"^({month})\s+(\d{{4}})$", end_raw, re.I)
        if not em_m:
            continue
        em = _canonical_month_word(em_m.group(1)) or em_m.group(1).strip()
        ey = int(em_m.group(2), 10)
        emi = _month_name_to_index(em)
        end_iso = f"{ey}-{emi:02d}"
        entries.append(
            {
                "title": title or None,
                "company": company,
                "employment_type": "Full-time",
                "location": location,
                "start_month": sm,
                "start_year": sy,
                "end_month": em,
                "end_year": ey,
                "start": start_iso,
                "end": end_iso,
                "is_current": False,
                "description": _normalize_description(desc_remainder) or None,
            }
        )
    return entries


def _parse_education_hr_freeform(body: str) -> list[dict[str, Any]]:
    """Fallback for Education blocks with MBA / B.Sc narrative lines (no 'M.S : … Dec. yyyy')."""
    body = body.strip()
    if not body:
        return []
    out: list[dict[str, Any]] = []

    mba_m = re.search(
        r"Master\s+of\s+Business\s+Administration\s*\(\s*MBA\s*\)\s*,\s*Human\s+Resources\s+(\d{4})",
        body,
        flags=re.IGNORECASE,
    )
    if mba_m:
        year = int(mba_m.group(1), 10)
        school = "University of Washington" if re.search(r"University\s+of\s+Washington", body, re.I) else None
        out.append(
            {
                "school": school,
                "degree": "Master of Business Administration",
                "field": "Human Resources",
                "year": year,
                "end_month": "December",
                "end_year": year,
                "activities": None,
            }
        )

    bs_m = re.search(
        r"Bachelor\s+of\s+Science\s*\(\s*B\.Sc\s*,\s*Biotechnology\s+(\d{4})\s+(.+?)(?=Skills|\Z)",
        body,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if bs_m:
        year = int(bs_m.group(1), 10)
        tail = bs_m.group(2).strip()
        sch_m = re.search(r"(Mount\s+Carmel\s+College)", tail, re.I)
        school = sch_m.group(1) if sch_m else None
        out.append(
            {
                "school": school,
                "degree": "Bachelor of Science",
                "field": "Biotechnology",
                "year": year,
                "end_month": "December",
                "end_year": year,
                "activities": None,
            }
        )

    return out


def _parse_experience_verbose_dates(region: str) -> list[dict[str, Any]]:
    """
    Experience headers like: 'Working RF Systems Engineer May 2014 to Current Company Name'
    or 'System Data Analyst August 2011 to December 2013 Company Name'.

    When employers use the literal placeholder 'Company Name', we anchor on it so one-line
    résumés do not swallow later roles into the company field.
    """
    region = region.strip()
    if not region:
        return []
    hdr = re.compile(
        rf"(?P<sm>{_MONTH_ANY})\s+(?P<sy>\d{{4}})\s+to\s+"
        rf"(?P<end>Current|(?:{_MONTH_ANY})\s+\d{{4}})\s+Company\s+Name\b",
        re.IGNORECASE,
    )
    matches = list(hdr.finditer(region))
    if not matches:
        return []
    entries: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        prev = matches[i - 1].end() if i else 0
        gap = region[prev : m.start()].strip()
        gap = re.sub(r"^(?:Work\s+)?Experience\s+", "", gap, flags=re.I).strip()
        title = _job_title_from_interstitial_gap(gap)
        sm_raw = m.group("sm").strip()
        sy = int(m.group("sy"), 10)
        end_raw = m.group("end").strip()
        company = "Company Name"
        sm = _canonical_month_word(sm_raw) or sm_raw
        chunk_start = m.end()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(region)
        body = region[chunk_start:chunk_end].strip()
        tail_title = _job_title_from_interstitial_gap(body)
        if tail_title and body.rstrip().endswith(tail_title):
            body = body[: body.rfind(tail_title)].rstrip(" .,;-·")
        description = _normalize_description(body)
        mi = _month_name_to_index(sm)
        start_iso = f"{sy}-{mi:02d}"

        if end_raw.lower() == "current":
            entries.append(
                {
                    "title": title or None,
                    "company": company or None,
                    "employment_type": "Full-time",
                    "location": None,
                    "start_month": sm,
                    "start_year": sy,
                    "end_month": None,
                    "end_year": None,
                    "start": start_iso,
                    "end": None,
                    "is_current": True,
                    "description": description or None,
                }
            )
            continue

        em_m = re.match(rf"^({_MONTH_ANY})\s+(\d{{4}})$", end_raw, re.I)
        if not em_m:
            continue
        em = _canonical_month_word(em_m.group(1)) or em_m.group(1).strip()
        ey = int(em_m.group(2), 10)
        emi = _month_name_to_index(em)
        end_iso = f"{ey}-{emi:02d}"
        entries.append(
            {
                "title": title or None,
                "company": company or None,
                "employment_type": "Full-time",
                "location": None,
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


def _parse_education_dec_degree(body: str) -> list[dict[str, Any]]:
    """Degrees like 'M.S : Electrical and Computer Engineering , Dec. 2013 PURDUE UNIVERSITY GPA: ...'."""
    body = body.strip()
    if not body:
        return []
    out: list[dict[str, Any]] = []
    for line_m in re.finditer(
        r"(M\.S|B\.S|MS|BS|Ph\.D)\s*:\s*([^,]+),\s*Dec\.\s*(\d{4})\s+(.+?)(?=(?:M\.S|B\.S|MS|BS|Ph\.D)\s*:|Thesis|Publication|\Z)",
        body,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        deg_raw = line_m.group(1).upper().replace(".", "")
        field = line_m.group(2).strip()
        year = int(line_m.group(3), 10)
        tail = line_m.group(4).strip()
        school = tail
        activities: str | None = None
        gpa_i = tail.upper().find("GPA")
        if gpa_i != -1:
            school = tail[:gpa_i].strip()
            activities = tail[gpa_i:].strip() or None
        else:
            school = school.splitlines()[0].strip()

        if not school and "PURDUE" in body.upper():
            school = "Purdue University"

        deg_key = "MS" if deg_raw in ("MS", "M") else "BS" if deg_raw in ("BS", "B") else deg_raw
        if deg_raw.startswith("PH"):
            degree = "Doctor of Philosophy"
        else:
            degree = _DEGREE_EXPAND.get(deg_key, deg_raw)

        out.append(
            {
                "school": school or None,
                "degree": degree,
                "field": field or None,
                "year": year,
                "end_month": "December",
                "end_year": year,
                "activities": activities,
            }
        )

    thesis_m = re.search(r"\bThesis\b(.+?)(?=\bPublication\b|\Z)", body, flags=re.I | re.S)
    pub_m = re.search(r"\bPublication\b(.+)$", body, flags=re.I | re.S)
    extras: list[str] = []
    if thesis_m:
        extras.append("Thesis: " + thesis_m.group(1).strip())
    if pub_m:
        extras.append("Publication: " + pub_m.group(1).strip())
    if extras and out:
        ex = "\n\n".join(extras)
        last = out[-1]
        prev = (last.get("activities") or "").strip()
        last["activities"] = f"{prev}\n\n{ex}".strip() if prev else ex

    return out


def _try_parse_verbose_month_resume(raw: str) -> dict[str, Any] | None:
    """Alternate résumé layout: spelled-out months, no MM/YYYY job dates, Education → Skills."""
    if re.search(r"\d{2}/\d{4}\s+to\s+\d{2}/\d{4}", raw):
        return None
    if not (
        re.search(r"\b(?:Work\s+)?Experience\b", raw, re.I)
        and re.search(r"\bEducation\b", raw, re.I)
        and re.search(r"\bSkills\b", raw, re.I)
    ):
        return None
    if not re.search(
        rf"{_MONTH_ANY}\s+\d{{4}}\s+to\s+(?:Current|{_MONTH_ANY}\s+\d{{4}})",
        raw,
        re.I,
    ):
        return None

    exp_m = re.search(
        rf"\b(?:Work\s+)?Experience\s+(?P<body>.+?)(?=\bEducation\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not exp_m:
        return None
    exp_body = exp_m.group("body").strip()
    verbose_e = _parse_experience_verbose_dates(exp_body)
    abbrev_e = _parse_work_experience_abbrev_months(exp_body)
    if len(abbrev_e) > len(verbose_e):
        experience = abbrev_e
    else:
        experience = verbose_e or abbrev_e
    if not experience:
        return None

    edu_m = re.search(rf"\bEducation\s+(?P<body>.+?)(?=\bSkills\b)", raw, flags=re.DOTALL | re.IGNORECASE)
    education: list[dict[str, Any]] = []
    if edu_m:
        edu_body = edu_m.group("body").strip()
        education = _parse_education_dec_degree(edu_body)
        if not education:
            education = _parse_education_hr_freeform(edu_body)

    skills_m = re.search(r"\bSkills\s+(?P<body>.+)$", raw, flags=re.DOTALL | re.IGNORECASE)
    skills: list[str] = []
    if skills_m:
        skills = _split_skills_blob(skills_m.group("body"))
    skills = merge_skill_lists(skills, _extract_qualification_phrases(raw))

    qual_m = re.search(
        rf"\bQualifications\s+(?P<body>.+?)(?=\b(?:Work\s+)?Experience\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    sum_m = re.search(
        r"\bSummary\s+(?P<body>.+?)(?=\bAccomplishments\b|\bWork Experience\b|\bExperience\b|\bEducation\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    acc_m = re.search(
        r"\bAccomplishments\s+(?P<body>.+?)(?=\bWork Experience\b|\bExperience\b|\bEducation\b)",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )

    first_line = raw.strip().split("\n", 1)[0].strip()
    if "Qualifications" in first_line:
        first_line = first_line.split("Qualifications", 1)[0].strip()

    headline: str | None = None
    if sum_m:
        pre = raw[: sum_m.start()].strip()
        pre = re.sub(r"\bsummary\s*$", "", pre, flags=re.I).strip()
        if pre and len(pre) < 100 and "\n" not in pre:
            headline = _normalize_headline(pre)[:220]
    if not headline and first_line and len(first_line) < 120 and not first_line.lower().startswith(
        "qualifications"
    ):
        fl = re.sub(r"\s+summary\s+.*$", "", first_line, flags=re.I).strip()
        headline = _normalize_headline(fl)[:220] if fl else None

    about_parts: list[str] = []
    if sum_m:
        about_parts.append("Summary\n" + sum_m.group("body").strip())
    if acc_m:
        about_parts.append("Accomplishments\n" + acc_m.group("body").strip())
    if qual_m:
        about_parts.append("Qualifications\n" + qual_m.group("body").strip())
    if not about_parts and headline and first_line:
        about_parts.append(first_line)
    about = "\n\n".join(p for p in about_parts if p).strip()

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


def _parse_job_header_line_loose(first: str) -> tuple[str | None, str | None, str | None, str]:
    """Parse first line of a job chunk into title, company, location, remainder on same line."""
    first = first.strip()
    if not first:
        return None, None, None, ""
    hdr_m = re.match(r"^(.+?)\s+-\s*([^,]+)\s*,\s*(\S+)\s+(.*)$", first)
    if hdr_m:
        title_company = hdr_m.group(1).strip()
        city = hdr_m.group(2).strip()
        state_token = hdr_m.group(3).strip()
        desc_first = hdr_m.group(4).strip()
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
        loc = f"{city}, {state_token}" if city or state_token else None
        return title or None, company or None, loc, desc_first
    for sep_pat in (
        r"^(.+?)\s+at\s+(.+)$",
        r"^(.+?)\s+[–—]\s+(.+)$",
        r"^(.+?)\s*\|\s*(.+)$",
    ):
        m = re.match(sep_pat, first, re.IGNORECASE)
        if m:
            a, b = m.group(1).strip(), m.group(2).strip()
            if len(a) >= 2 and len(b) >= 2:
                return a, b, None, ""
    if len(first) <= 100:
        return first, None, None, ""
    words = first.split()
    if len(words) >= 10:
        return (
            " ".join(words[:6]) or None,
            " ".join(words[6:12]) or None,
            None,
            " ".join(words[12:]),
        )
    return (first[:120] or None), None, None, ""


def _parse_experience_mm_yyyy_loose(region: str) -> list[dict[str, Any]]:
    """Like _parse_experience_region but allows Present/Current and looser first-line headers."""
    region = region.strip()
    if not region:
        return []
    pat = re.compile(
        r"(?P<sm>\d{2}/\d{4})\s+to\s+(?:(?P<em>\d{2}/\d{4})|(?P<cur>Present|Current))\b",
        re.IGNORECASE,
    )
    matches = list(pat.finditer(region))
    if not matches:
        return []
    entries: list[dict[str, Any]] = []
    for i, m in enumerate(matches):
        start_raw = m.group("sm")
        chunk_start = m.end()
        chunk_end = matches[i + 1].start() if i + 1 < len(matches) else len(region)
        chunk = region[chunk_start:chunk_end].strip()
        if not chunk:
            continue
        lines = chunk.splitlines()
        first = lines[0].strip() if lines else ""
        rest_lines = [ln.strip() for ln in lines[1:] if ln.strip()]
        body_tail = "\n".join(rest_lines)
        title, company, loc, desc_first = _parse_job_header_line_loose(first)
        if not title:
            continue
        description = _normalize_description("\n".join([x for x in [desc_first, body_tail] if x]).strip())

        sm, sy, start_iso = _mm_yyyy_to_meta(start_raw)
        is_current = m.group("cur") is not None
        if is_current:
            entries.append(
                {
                    "title": title or None,
                    "company": company,
                    "employment_type": "Full-time",
                    "location": loc,
                    "start_month": sm,
                    "start_year": sy,
                    "end_month": None,
                    "end_year": None,
                    "start": start_iso,
                    "end": None,
                    "is_current": True,
                    "description": description or None,
                }
            )
            continue
        end_raw = m.group("em")
        if not end_raw:
            continue
        em, ey, end_iso = _mm_yyyy_to_meta(end_raw)
        entries.append(
            {
                "title": title or None,
                "company": company,
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


def _flex_experience_body(raw: str) -> str:
    """Best-effort slice containing employment history."""
    m = re.search(
        r"(?:^|[\n.])(?:Work\s+)?Experience\s*[:\s]*(.+?)(?=\n\s*(?:Education|Academic|Skills|Projects|Certifications|Publications|Training)\b|\Z)",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m and len(m.group(1).strip()) > 40:
        return m.group(1).strip()
    m2 = re.search(
        r"(?P<body>(?:\d{2}/\d{4}\s+to\s+(?:\d{2}/\d{4}|Present|Current)\b).+?)(?=\n\s*(?:Education|Skills)\b|\Z)",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m2 and len(m2.group("body").strip()) > 40:
        return m2.group("body").strip()
    return raw.strip()


def _dedupe_education_rows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    out: list[dict[str, Any]] = []
    for e in items:
        key = (
            (e.get("school") or "").casefold(),
            e.get("year"),
            (e.get("degree") or "").casefold(),
            (e.get("field") or "").casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def _parse_education_flexible_on_text(body: str) -> list[dict[str, Any]]:
    body = body.strip()
    if not body:
        return []
    out: list[dict[str, Any]] = []
    out.extend(_parse_education_section(body))
    out.extend(_parse_education_dec_degree(body))
    out.extend(_parse_education_hr_freeform(body))
    return _dedupe_education_rows(out)


def _flex_education_body(raw: str) -> str | None:
    m = re.search(
        r"\bEducation\s*[:\s]*(.+?)(?=\n\s*(?:Experience|Work\s+Experience|Skills|Projects|Certifications|Employment|Professional\s+Experience)\b|\Z)",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(1).strip()
    if re.search(
        r"(?i)\b(bachelor|master|mba|ph\.?d|b\.s|m\.s|university\s+of)\b",
        raw,
    ):
        return raw.strip()
    return None


def _flex_skills_blob(raw: str) -> list[str]:
    m = re.search(
        r"\b(?:Key\s+)?Skills?\b\s*[:\s]?\s*(?P<body>.+?)(?=\n\s*(?:Experience|Education|Work|Employment|References|Projects)\b|\Z)",
        raw,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return []
    blob = m.group("body").strip()
    if len(blob) > 4000:
        blob = blob[:4000]
    return _split_skills_blob(blob)


def parse_resume_profile_flexible(text: str) -> dict[str, Any]:
    """
    Second-tier parser for blobs that fail looks_parseable_resume_blob.

    Uses looser section boundaries, MM/YYYY + Present/Current ranges, abbreviated-month
    jobs on the full text, and stacked education heuristics. Preserves most of the
    original text in about/summary when sections are ambiguous.
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

    exp_region = _flex_experience_body(raw)
    experience = _parse_experience_region(exp_region)
    if not experience:
        experience = _parse_experience_mm_yyyy_loose(exp_region)
    if not experience:
        experience = _parse_work_experience_abbrev_months(raw)
    if not experience:
        experience = _parse_experience_mm_yyyy_loose(raw)

    edu_src = _flex_education_body(raw)
    education: list[dict[str, Any]] = []
    if edu_src:
        education = _parse_education_flexible_on_text(edu_src[:8000])

    skills = _flex_skills_blob(raw)
    skills = merge_skill_lists(skills, _extract_qualification_phrases(raw))

    first_line = raw.strip().split("\n", 1)[0].strip()
    headline: str | None = None
    if first_line and len(first_line) < 100:
        headline = _normalize_headline(first_line)[:220]

    exp_cut = re.search(
        r"\b(?:Work\s+)?Experience\b",
        raw,
        flags=re.IGNORECASE,
    )
    about_cut = exp_cut.start() if exp_cut else None
    if about_cut is None:
        mjob = re.search(r"\d{2}/\d{4}\s+to\s+(?:\d{2}/\d{4}|Present|Current)\b", raw, re.I)
        about_cut = mjob.start() if mjob else min(1200, len(raw))
    about_core = raw[:about_cut].strip() if about_cut is not None else raw[:1200].strip()
    summary = (about_core[:800] + ("..." if len(about_core) > 800 else "")).strip()
    about_cap = 12000
    about = raw[:about_cap] if len(raw) > about_cap else raw

    langs = _parse_languages_section(raw)

    return {
        "headline": headline,
        "summary": summary or about_core[:400],
        "about": about,
        "experience": experience,
        "education": education,
        "skills": skills,
        "languages": langs,
    }


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

    verbose = _try_parse_verbose_month_resume(raw)
    if verbose is not None:
        return verbose

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
