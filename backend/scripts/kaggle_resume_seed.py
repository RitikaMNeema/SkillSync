#!/usr/bin/env python3
"""
Load Kaggle resume CSV rows into SkillSync as member accounts.

**Canonical bulk résumé + profile pipeline** — use this script + Resume.csv (and optional PDF
tree) instead of maintaining separate per-domain JSON generators for the same purpose.
`data/transform_ai_match_demo.py` remains useful for synthetic AI-matching demos, but
realistic member bodies and file mapping should come from Kaggle here.

Uses fields present in the CSV / bundled Kaggle files:
  - Resume file upload: prefers the PDF at data/data/<Category>/<ID>.pdf from the full dataset
    (same IDs as the CSV). If missing, default ``pdf-prefer`` **builds a real PDF** from the CSV
    cell (HTML stripped to text) using ``fpdf2`` — no HTML file upload.
  - Summary / headline from resume_str / resume text plus Category when present.
  - Skills from Category plus any skills/technologies columns (comma-/pipe-separated cells).
  - Phone, location, website: common column name aliases mapped to profile fields.
  - experience / education: JSON array cells if present (e.g. \"experience\", \"education\").
  - Every other column is appended under Mongo \"about\" as \"column: value\" lines.
  - Résumé-shaped plain text (dated Experience + Education + Skills) is split into structured experience/education/skills when CSV JSON arrays are empty.

Typical dataset:
  https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset

Usage (from backend/):
  pip install httpx
  python scripts/kaggle_resume_seed.py --csv data/kaggle/downloads/Resume.csv
  python scripts/kaggle_resume_seed.py --csv path/to.csv --limit 100   # cap rows
  python scripts/kaggle_resume_seed.py --csv path/to.csv --offset 500  # resume a batch
  python scripts/kaggle_resume_seed.py --resume-upload csv-only        # HTML/text cell only (no PDF tree)
  python scripts/kaggle_resume_seed.py --resume-upload pdf-prefer-html # legacy: HTML upload when no file PDF
  python scripts/kaggle_resume_seed.py --names-only                    # refresh names only (existing accounts)
  python scripts/kaggle_resume_seed.py --csv …/Resume.csv --include-flexible --limit 200

Requires ``fpdf2`` for default ``pdf-prefer`` when no file PDF exists (``pip install -r requirements-dev.txt``).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

import resume_profile_text_parser as resume_parser  # noqa: E402
import seed as seed_mod  # noqa: E402

BASE = seed_mod.BASE
SEED_USER_PASSWORD = seed_mod.SEED_USER_PASSWORD
post = seed_mod.post
poll_command = seed_mod.poll_command
wait_for_services = seed_mod.wait_for_services
ok = seed_mod.ok
section = seed_mod.section
BENIGN_DUP_MARKERS = seed_mod.BENIGN_DUP_MARKERS


def html_to_text(raw: str) -> str:
    """Readable plain text for profile summary — derived only from the Kaggle resume cell."""
    if not raw:
        return ""
    s = html.unescape(raw)
    s = re.sub(r"<script[^>]*>.*?</script>", " ", s, flags=re.I | re.S)
    s = re.sub(r"<style[^>]*>.*?</style>", " ", s, flags=re.I | re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def title_case_category(category: str) -> str:
    c = (category or "").strip().replace("_", " ").lower()
    if not c:
        return ""
    return " ".join(w.capitalize() for w in c.split())


def parse_name_from_resume(plain: str) -> tuple[str, str] | None:
    lines = [ln.strip() for ln in plain.replace("\r", "").split("\n") if ln.strip()]
    for line in lines[:12]:
        if len(line) > 80 or any(ch.isdigit() for ch in line):
            continue
        parts = line.split()
        if 2 <= len(parts) <= 5:
            if all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]*", p) for p in parts):
                return parts[0], " ".join(parts[1:])
    return None


# Pools for display names when resume text does not yield a parseable real name.
_SYNTH_FIRST = (
    "James", "Maria", "Chen", "Priya", "Diego", "Yuki", "Amara", "Luca", "Fatima", "Noah",
    "Sofia", "Kwame", "Nina", "Omar", "Elena", "Raj", "Maya", "Jonas", "Aisha", "Mateo",
    "Lin", "Zara", "Henrik", "Keiko", "Samira", "Felix", "Ananya", "Bruno", "Leila", "Viktor",
    "Saanvi", "Anton", "Mei", "Idris", "Camila", "Soren", "Rina", "Malik", "Tessa", "Andre",
    "Yara", "Emil", "Nadia", "Theo", "Ines", "Ravi", "Helena", "Jiro", "Alina", "Pablo",
    "Sienna", "Quinn", "Rohan", "Bianca", "Axel", "Mira", "Luis", "Freya", "Kenji", "Dalia",
    "Silas", "Imani", "Matteo", "Esme", "Nikolai", "Aditi", "Enzo", "Wren", "Ibrahim", "Clara",
)

_SYNTH_LAST = (
    "Okonkwo", "Nakamura", "Vasquez", "Lindqvist", "Patel", "Kowalski", "Okafor", "Sato",
    "Benali", "Carvalho", "Nguyen", "Khalil", "Olsen", "Reyes", "Chakraborty", "Andersson",
    "Diallo", "Mikhailov", "Silva", "Yamamoto", "Nascimento", "Haddad", "Johansson", "Park",
    "Osei", "Rodriguez", "Petrov", "Costa", "Azizi", "Nowak", "Almeida", "Suzuki", "Rahman",
    "Eriksson", "Okoro", "Garcia", "Novak", "Torres", "Choi", "Yilmaz", "Ferreira", "Ito",
    "Malhotra", "Berg", "Suleiman", "Alves", "Tanaka", "Ibrahimovic", "Popescu", "Santos",
    "Khatib", "Larsen", "Moreno", "Schmidt", "Sato-Rios", "Menendez", "Varga", "Kimura",
    "Pereira", "Nilsson", "Qureshi", "Fontaine", "Delgado", "Yuan", "Barakat", "Schneider",
    "Ramos", "Oliveira", "Kumar", "Weiss", "Omarsson", "Castillo", "Branco", "Duarte",
    "Thakur", "Moller", "Abbasi", "Valencia", "Watanabe", "Popov", "Singh", "Lorenzo",
    "Hansen", "Farouk", "Jimenez", "Lombardi", "El-Masri", "Sikora", "Reid", "Osorio",
)


def unique_synthetic_name(rid: str, used_pairs: set[tuple[str, str]]) -> tuple[str, str]:
    """Stable per-row id, varied names, unique within this seed run."""
    for salt in range(512):
        digest = hashlib.sha256(f"kaggle-name|{rid}|{salt}".encode()).digest()
        fi = int.from_bytes(digest[:4], "big") % len(_SYNTH_FIRST)
        li = int.from_bytes(digest[4:8], "big") % len(_SYNTH_LAST)
        pair = (_SYNTH_FIRST[fi], _SYNTH_LAST[li])
        if pair not in used_pairs:
            used_pairs.add(pair)
            return pair
    tail = rid[-8:] if rid else "member"
    ln = f"{_SYNTH_LAST[int.from_bytes(digest[4:8], 'big') % len(_SYNTH_LAST)]}-{tail}"
    fn = _SYNTH_FIRST[int.from_bytes(digest[:4], "big") % len(_SYNTH_FIRST)]
    pair = (fn, ln[:100])
    used_pairs.add(pair)
    return pair


def normalize_csv_keys(row: dict[str, str]) -> dict[str, str]:
    return {((k or "").strip().lower()): (v or "").strip() for k, v in row.items()}


def pick_resume_raw(norm: dict[str, str]) -> tuple[str, str | None]:
    """Prefer HTML for raw cell upload fallback (matches prior behavior)."""
    for key in ("resume_html", "resume", "resume_str", "resume_text", "cv", "raw_resume"):
        if norm.get(key):
            return norm[key], key
    return "", None


def pick_resume_text_for_profile(norm: dict[str, str]) -> str:
    """Plain-ish text for summary/name: prefer resume_str, then strip HTML from resume_html."""
    for key in ("resume_str", "resume_text"):
        v = (norm.get(key) or "").strip()
        if v:
            return re.sub(r"\s+", " ", v).strip()
    for key in ("resume_html", "resume", "cv", "raw_resume"):
        if norm.get(key):
            return html_to_text(norm[key])
    return ""


def default_pdf_root(csv_path: Path) -> Path:
    """Kaggle full unzip: <downloads>/Resume.csv and <downloads>/data/data/<Category>/<ID>.pdf"""
    return (csv_path.parent / "data" / "data").resolve()


def resolve_kaggle_pdf(pdf_root: Path, category: str, row_id: str) -> Path | None:
    """Return path to PDF if it exists (category folder names match CSV Category, e.g. HR, ACCOUNTANT)."""
    cat = (category or "").strip()
    if not cat or not row_id:
        return None
    candidate = pdf_root / cat / f"{row_id}.pdf"
    return candidate if candidate.is_file() else None


def choose_resume_upload(
    *,
    mode: str,
    pdf_root: Path | None,
    category: str,
    row_id: str,
    raw_resume: str,
) -> tuple[bytes, str, str, str] | None:
    """
    Returns (body_bytes, filename, content_type, source_label) or None if this row cannot be uploaded.

    source_label:
      - ``pdf`` — bytes read from Kaggle ``data/data/<Category>/<id>.pdf``
      - ``pdf-generated`` — PDF built in-process from the CSV résumé cell (HTML stripped to text)
      - ``csv`` — raw HTML or .txt upload (``csv-only`` or ``pdf-prefer-html`` fallback only)
    """
    pdf_path = resolve_kaggle_pdf(pdf_root, category, row_id) if pdf_root else None

    if mode == "csv-only":
        if not raw_resume.strip():
            return None
        suffix, mime = upload_kind(raw_resume)
        return raw_resume.encode("utf-8"), f"resume_{row_id}{suffix}", mime, "csv"

    if mode == "pdf-only":
        if not pdf_path:
            return None
        data = pdf_path.read_bytes()
        return data, f"resume_{row_id}.pdf", "application/pdf", "pdf"

    # Legacy: same as old pdf-prefer when no file PDF — upload HTML/text cell.
    if mode == "pdf-prefer-html":
        if pdf_path:
            data = pdf_path.read_bytes()
            return data, f"resume_{row_id}.pdf", "application/pdf", "pdf"
        if raw_resume.strip():
            suffix, mime = upload_kind(raw_resume)
            return raw_resume.encode("utf-8"), f"resume_{row_id}{suffix}", mime, "csv"
        return None

    # pdf-prefer (default): file PDF, else synthesized PDF (always application/pdf).
    if mode != "pdf-prefer":
        return None
    if pdf_path:
        data = pdf_path.read_bytes()
        return data, f"resume_{row_id}.pdf", "application/pdf", "pdf"
    if raw_resume.strip():
        data = synthesize_resume_pdf_bytes(raw_resume, row_id=row_id)
        return data, f"resume_{row_id}.pdf", "application/pdf", "pdf-generated"
    return None


def pick_category(norm: dict[str, str]) -> str:
    for key in ("category", "class", "label", "job_category"):
        if norm.get(key):
            return norm[key]
    return ""


# Columns consumed by structured mapping — remainder goes to `about`.
STRUCT_KEYS = frozenset(
    {
        "resume_html",
        "resume",
        "resume_str",
        "resume_text",
        "cv",
        "raw_resume",
        "category",
        "class",
        "label",
        "job_category",
        "id",
        "resume_id",
        "candidate_id",
        "index",
        "phone",
        "mobile",
        "telephone",
        "contact_phone",
        "location_city",
        "city",
        "town",
        "location_state",
        "state",
        "province",
        "region",
        "location_country",
        "country",
        "website",
        "url",
        "portfolio",
        "linkedin",
        "linkedin_url",
        "experience",
        "experiences",
        "work_experience",
        "work_history",
        "education",
        "educations",
        "degrees",
        "skills",
        "skill",
        "technologies",
        "tech_stack",
        "keywords",
    }
)


def _first_cell(norm: dict[str, str], keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = (norm.get(k) or "").strip()
        if v:
            return v
    return None


def try_parse_json_list(raw: str) -> list | None:
    s = raw.strip()
    if len(s) < 2 or s[0] not in "[{":
        return None
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        return None
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return None


def pick_experience_rows(norm: dict[str, str]) -> list[dict]:
    for key in ("experience", "experiences", "work_experience", "work_history"):
        raw = (norm.get(key) or "").strip()
        if not raw:
            continue
        parsed = try_parse_json_list(raw)
        if parsed:
            return [e for e in parsed if isinstance(e, dict)]
    return []


def pick_education_rows(norm: dict[str, str]) -> list[dict]:
    for key in ("education", "educations", "degrees"):
        raw = (norm.get(key) or "").strip()
        if not raw:
            continue
        parsed = try_parse_json_list(raw)
        if parsed:
            return [e for e in parsed if isinstance(e, dict)]
    return []


def skills_from_row(norm: dict[str, str], category: str) -> list[str]:
    """Dataset-only skill strings: category plus explicit skills/keyword columns."""
    seen: set[str] = set()
    out: list[str] = []

    def add_tokens(cell: str) -> None:
        for piece in re.split(r"[,;|]", cell):
            t = piece.strip()
            if not t:
                continue
            low = t.lower()
            if low in seen:
                continue
            seen.add(low)
            out.append(t)

    cat = (category or "").strip()
    if cat:
        add_tokens(cat)
    for key in ("skills", "skill", "technologies", "tech_stack", "keywords"):
        cell = (norm.get(key) or "").strip()
        if cell:
            add_tokens(cell)
    return out


def profile_side_fields(norm: dict[str, str]) -> dict[str, Any]:
    phone = _first_cell(norm, ("phone", "mobile", "telephone", "contact_phone"))
    city = _first_cell(norm, ("location_city", "city", "town"))
    state = _first_cell(norm, ("location_state", "state", "province", "region"))
    country = _first_cell(norm, ("location_country", "country"))
    website = _first_cell(norm, ("website", "url", "portfolio", "linkedin", "linkedin_url"))
    experience = pick_experience_rows(norm)
    education = pick_education_rows(norm)
    return {
        "phone": phone[:64] if phone else None,
        "location_city": city[:120] if city else None,
        "location_state": state[:120] if state else None,
        "location_country": country[:120] if country else None,
        "website": website[:512] if website else None,
        "experience": experience,
        "education": education,
    }


def build_about_from_extra_columns(norm: dict[str, str], max_chars: int = 32000) -> str | None:
    lines: list[str] = []
    for key in sorted(norm.keys()):
        lk = (key or "").strip().lower()
        if lk in STRUCT_KEYS:
            continue
        val = (norm.get(key) or "").strip()
        if not val:
            continue
        if len(val) > 4000:
            val = val[:4000] + "…"
        lines.append(f"{key}: {val}")
    if not lines:
        return None
    text = "\n".join(lines)
    return text[:max_chars] if len(text) > max_chars else text


def merge_profile_with_parser(
    *,
    plain_blob: str,
    summary: str | None,
    headline: str,
    about: str | None,
    skills: list[str],
    extras: dict[str, Any],
    include_flexible: bool,
) -> tuple[str | None, str, str | None, list[str], dict[str, Any], list | None, bool]:
    """
    Enrich headline/summary/about/skills and optionally experience/education from résumé text.

    - If CSV JSON already has both experience and education, parser still upgrades
      headline/summary/skills/languages but does not replace structured rows.
    - If either side is missing, parser rows are used to fill gaps.
    - When ``include_flexible`` is True, runs second-tier parser after strict gate fails.
    """
    exp_rows = extras.get("experience") or []
    edu_rows = extras.get("education") or []
    have_csv_exp = bool(exp_rows)
    have_csv_edu = bool(edu_rows)
    need_structure_fill = not have_csv_exp or not have_csv_edu

    blob = (plain_blob or "").strip()
    if not blob:
        return summary, headline, about, skills, extras, None, False

    structured: dict[str, Any] | None = None
    used_flex = False

    if resume_parser.looks_parseable_resume_blob(blob):
        structured = resume_parser.parse_resume_profile_blob(blob)
    elif include_flexible and resume_parser.looks_flexible_parseable_resume_blob(blob):
        structured = resume_parser.parse_resume_profile_flexible(blob)
        used_flex = True
        if need_structure_fill and structured:
            exp_n = len(structured.get("experience") or [])
            edu_n = len(structured.get("education") or [])
            sk_n = len(structured.get("skills") or [])
            if exp_n == 0 and edu_n == 0 and sk_n < 3:
                return summary, headline, about, skills, extras, None, False

    if not structured:
        return summary, headline, about, skills, extras, None, False

    summary = structured.get("summary") or summary
    hl_struct = structured.get("headline")
    if hl_struct:
        headline = hl_struct[:220]
    skills = resume_parser.merge_skill_lists(skills, structured.get("skills"))

    csv_about = about
    base_about = (structured.get("about") or "").strip()
    if csv_about and str(csv_about).strip():
        about = (
            f"{base_about}\n\n{str(csv_about).strip()}".strip()
            if base_about
            else str(csv_about).strip()
        )
    else:
        about = base_about if base_about else about

    languages = structured.get("languages")

    if need_structure_fill:
        if not have_csv_exp and structured.get("experience"):
            extras["experience"] = structured.get("experience") or []
        if not have_csv_edu and structured.get("education"):
            extras["education"] = structured.get("education") or []

    return summary, headline, about, skills, extras, languages, True


def pick_row_id(norm: dict[str, str], line_no: int) -> str:
    for key in ("id", "resume_id", "candidate_id", "index"):
        if norm.get(key):
            return re.sub(r"[^\w-]+", "_", norm[key])[:64]
    return f"row_{line_no}"


def upload_kind(raw: str) -> tuple[str, str]:
    """Filename suffix + MIME — raw cell preserved; HTML detected loosely."""
    sample = raw.lstrip()[:800].lower()
    if "<html" in sample or "<body" in sample or "<div" in sample or raw.strip().startswith("<"):
        return ".html", "text/html; charset=utf-8"
    return ".txt", "text/plain; charset=utf-8"


def synthesize_resume_pdf_bytes(raw_resume: str, *, row_id: str) -> bytes:
    """
    Build a minimal multi-page PDF from the Kaggle HTML/text cell (plain text after html_to_text).

    Used when ``data/data/<Category>/<id>.pdf`` is missing so uploads stay ``application/pdf``.
    """
    try:
        from fpdf import FPDF
    except ImportError as e:
        exe = sys.executable
        raise RuntimeError(
            "PDF synthesis needs the fpdf2 package (import name: fpdf).\n"
            f"  This script is running: {exe}\n"
            "  Install into the SAME interpreter (pip alone may target a different Python):\n"
            f"    {exe} -m pip install fpdf2\n"
            "  Or from backend/: python3 -m pip install -r requirements-dev.txt"
        ) from e

    text = html_to_text(raw_resume)
    text = (text or "").strip()
    if len(text) < 40:
        text = re.sub(r"\s+", " ", (raw_resume or "").replace("\r", "")).strip()
    if not text:
        text = f"(Empty résumé cell; id={row_id})"
    if len(text) > 100_000:
        text = text[:100_000] + "\n\n[truncated for PDF generation]"

    import fpdf as fpdf_pkg

    pkg = Path(fpdf_pkg.__file__).resolve().parent
    font_path = None
    for name in ("DejaVuSans.ttf", "DejaVuSansCondensed.ttf"):
        candidate = pkg / "font" / name
        if candidate.is_file():
            font_path = candidate
            break

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    if font_path:
        pdf.add_font("DejaVu", "", str(font_path))
        pdf.set_font("DejaVu", "", 10)
    else:
        pdf.set_font("Helvetica", "", 10)
        text = text.encode("latin-1", errors="replace").decode("latin-1")

    pdf.multi_cell(0, 5, text)

    # fpdf2 ≥2.2: call output() with no path to get PDF bytes (avoid deprecated dest=).
    out = pdf.output()
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    if isinstance(out, str):
        return out.encode("latin-1")
    raise RuntimeError("fpdf2 PDF output returned unexpected type")


def register_or_login(client: httpx.Client, email: str) -> tuple[int, str]:
    r = client.post(
        f"{BASE['auth']}/auth/register",
        json={"email": email, "password": SEED_USER_PASSWORD, "role": "member"},
        timeout=60,
    )
    if r.status_code not in (200, 201, 409):
        raise RuntimeError(f"register failed {r.status_code}: {r.text}")
    login = post(client, "auth", "/auth/login", {"email": email, "password": SEED_USER_PASSWORD})
    return int(login["user_id"]), str(login["token"])


def login_existing_member(client: httpx.Client, email: str) -> tuple[int, str] | None:
    """Log in only (no register). Returns None if the account does not exist or credentials fail."""
    r = client.post(
        f"{BASE['auth']}/auth/login",
        json={"email": email, "password": SEED_USER_PASSWORD},
        timeout=60,
    )
    if r.status_code != 200:
        return None
    try:
        j = r.json()
    except json.JSONDecodeError:
        return None
    data = j.get("data") if isinstance(j, dict) else None
    if not isinstance(data, dict) or "user_id" not in data or "token" not in data:
        return None
    return int(data["user_id"]), str(data["token"])


def update_member_names_only(client: httpx.Client, member_id: int, token: str, first_name: str, last_name: str) -> None:
    post(
        client,
        "profile",
        "/members/update",
        {"member_id": member_id, "first_name": first_name[:100], "last_name": last_name[:100]},
        token=token,
    )


def upload_resume_bytes(client: httpx.Client, member_id: int, token: str, filename: str, body: bytes, content_type: str) -> None:
    url = f"{BASE['profile']}/members/uploadResumeFile"
    files = {"resume": (filename, body, content_type)}
    data = {"member_id": str(member_id)}
    r = client.post(url, files=files, data=data, headers={"Authorization": f"Bearer {token}"}, timeout=180)
    if r.status_code != 200:
        raise RuntimeError(f"uploadResumeFile → {r.status_code}: {r.text}")


def ensure_profile(
    client: httpx.Client,
    user_id: int,
    token: str,
    *,
    first_name: str,
    last_name: str,
    headline: str,
    summary: str | None,
    skills: list[str],
    phone: str | None = None,
    location_city: str | None = None,
    location_state: str | None = None,
    location_country: str | None = None,
    website: str | None = None,
    about: str | None = None,
    experience: list | None = None,
    education: list | None = None,
    languages: list | None = None,
    open_to: str | None = None,
    profile_status: str | None = None,
) -> None:
    exp = experience or []
    edu = education or []
    loc_country = location_country if location_country else "US"
    body = {
        "member_id": user_id,
        "first_name": first_name[:100],
        "last_name": last_name[:100],
        "headline": headline[:220],
        "summary": summary[:12000] if summary else None,
        "skills": skills,
        "phone": phone,
        "location_city": location_city,
        "location_state": location_state,
        "location_country": loc_country,
        "website": website,
        "experience": exp,
        "education": edu,
    }
    if about:
        body["about"] = about
    if languages:
        body["languages"] = languages
    if open_to is not None:
        body["open_to"] = open_to
    if profile_status is not None:
        body["profile_status"] = profile_status
    result = post(
        client,
        "profile",
        "/members/create",
        body,
        token=token,
        ignore=[409, 400],
        benign_async_fail=BENIGN_DUP_MARKERS,
    )
    if result is None:
        upd = {
            "member_id": user_id,
            "first_name": first_name[:100],
            "last_name": last_name[:100],
            "headline": headline[:220],
            "summary": summary[:12000] if summary else None,
            "skills": skills,
            "phone": phone,
            "location_city": location_city,
            "location_state": location_state,
            "location_country": loc_country,
            "website": website,
            "experience": exp,
            "education": edu,
        }
        if about:
            upd["about"] = about
        if languages:
            upd["languages"] = languages
        if open_to is not None:
            upd["open_to"] = open_to
        if profile_status is not None:
            upd["profile_status"] = profile_status
        pdata = post(client, "profile", "/members/update", upd, token=token)
        if isinstance(pdata, dict) and pdata.get("command_id"):
            polled = poll_command(client, "profile", pdata["command_id"], token=token)
            if polled.get("status") == "failed":
                raise RuntimeError(polled.get("error") or "profile update failed")


def default_resume_csv_path() -> Path:
    """Prefer flat Resume.csv; fall back to Resume/Resume.csv as shipped in the Kaggle zip."""
    base = Path(__file__).resolve().parent.parent / "data" / "kaggle" / "downloads"
    for rel in ("Resume.csv", "Resume/Resume.csv"):
        candidate = base / rel
        if candidate.is_file():
            return candidate
    return base / "Resume.csv"


def load_rows(csv_path: Path, offset: int, limit: int | None) -> list[tuple[int, dict[str, str]]]:
    rows: list[tuple[int, dict[str, str]]] = []
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for line_no, row in enumerate(reader, start=1):
            if line_no <= offset:
                continue
            rows.append((line_no, row))
            if limit is not None and len(rows) >= limit:
                break
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed members from Kaggle resume CSV (raw resume bytes)")
    parser.add_argument(
        "--csv",
        type=Path,
        default=default_resume_csv_path(),
        help="Path to Resume.csv (default: data/kaggle/downloads/Resume.csv or …/Resume/Resume.csv)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Max rows to import (default: entire file)",
    )
    parser.add_argument("--offset", type=int, default=0, help="Skip first N data rows")
    parser.add_argument(
        "--min-plain-chars",
        type=int,
        default=0,
        metavar="N",
        help="Skip row if stripped resume text is shorter than N (default: 0 = only skip empty resume cell)",
    )
    parser.add_argument(
        "--resume-upload",
        choices=("pdf-prefer", "pdf-prefer-html", "pdf-only", "csv-only"),
        default="pdf-prefer",
        help="pdf-prefer: Kaggle file PDF when present, else generate PDF from CSV cell via fpdf2 (default). "
        "pdf-prefer-html: if no file PDF, upload raw HTML/text cell as before. "
        "pdf-only: skip rows with no file PDF. csv-only: HTML/text only.",
    )
    parser.add_argument(
        "--pdf-root",
        type=Path,
        default=None,
        metavar="DIR",
        help="Directory containing <Category>/<ID>.pdf (default: <csv-parent>/data/data)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse only; no HTTP calls")
    parser.add_argument(
        "--names-only",
        action="store_true",
        help="Only update first_name/last_name for existing kaggle_resume_*@example.com accounts (no uploads/register)",
    )
    parser.add_argument(
        "--include-flexible",
        action="store_true",
        help="When strict résumé gate fails, try parse_resume_profile_flexible (more coverage on messy Kaggle text)",
    )
    parser.add_argument(
        "--no-job-seeker-defaults",
        action="store_true",
        help="Do not set open_to=job and profile_status=open_to_work (defaults favor job-matching UIs)",
    )
    args = parser.parse_args()

    csv_path: Path = args.csv.resolve()
    if not csv_path.is_file():
        dl = Path(__file__).resolve().parent.parent / "data" / "kaggle" / "downloads"
        print(
            f"CSV not found: {csv_path}\n\n"
            "Create the folder and fetch the file (Kaggle stores it as Resume/Resume.csv in the archive):\n"
            f"  mkdir -p {dl}\n"
            "  kaggle datasets download -d snehaanbhawal/resume-dataset -f Resume/Resume.csv -p data/kaggle/downloads\n"
            f"  unzip -o {dl / 'Resume.csv.zip'} -d {dl}\n\n"
            "Or download the full zip from https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset "
            "and point --csv at …/Resume.csv inside the extracted tree.\n"
            "Then run again from backend/: python scripts/kaggle_resume_seed.py --csv <path-to-Resume.csv>"
        )
        sys.exit(1)

    rows = load_rows(csv_path, args.offset, args.limit)
    if not rows:
        print("No rows to import (check offset/limit).")
        sys.exit(0)

    pdf_root: Path | None = None
    if not args.names_only and args.resume_upload != "csv-only":
        root = (args.pdf_root.resolve() if args.pdf_root else default_pdf_root(csv_path))
        if root.is_dir():
            pdf_root = root
        elif args.resume_upload == "pdf-only":
            print(f"PDF tree not found at {root}. Unzip the full Kaggle dataset so data/data/<Category>/ exists.")
            sys.exit(1)
        else:
            print(
                f"  (no PDF tree at {root} — "
                + (
                    "CSV résumé cells will be converted to PDF via fpdf2 (pip install fpdf2)"
                    if args.resume_upload == "pdf-prefer"
                    else "using CSV resume bytes as HTML/text when no file PDF"
                )
                + ")"
            )

    meta = {"csv": str(csv_path), "rows": len(rows), "names_only": args.names_only}
    if not args.names_only:
        meta["resume_upload"] = args.resume_upload
        meta["pdf_root"] = str(pdf_root) if pdf_root else None
    print(json.dumps(meta, indent=2))

    if args.dry_run:
        if args.names_only:
            used: set[tuple[str, str]] = set()
            for line_no, row in rows[:5]:
                norm = normalize_csv_keys(row)
                rid = pick_row_id(norm, line_no)
                plain = pick_resume_text_for_profile(norm)
                parsed = parse_name_from_resume(plain)
                if parsed:
                    fn, ln = parsed
                else:
                    fn, ln = unique_synthetic_name(str(rid), used)
                print(f"--- line {line_no} id={rid} → {fn} {ln}")
            print("Dry run OK (--names-only).")
            return
        for line_no, row in rows[:3]:
            norm = normalize_csv_keys(row)
            raw, _rk = pick_resume_raw(norm)
            plain = pick_resume_text_for_profile(norm)
            picked = choose_resume_upload(
                mode=args.resume_upload,
                pdf_root=pdf_root,
                category=pick_category(norm),
                row_id=pick_row_id(norm, line_no),
                raw_resume=raw,
            )
            print(f"--- sample line {line_no} ---")
            print(f" category={pick_category(norm)!r} id={pick_row_id(norm, line_no)!r}")
            print(f" profile_plain_len={len(plain)} csv_cell_bytes≈{len(raw.encode('utf-8'))}")
            if picked:
                _b, fn, mime, src = picked
                print(f" upload: {fn} {mime} ({src}, {len(_b)} bytes)")
            else:
                print(" upload: (none — row would be skipped)")
        print("Dry run OK.")
        return

    with httpx.Client(timeout=180) as client:
        wait_for_services(client)

        if args.names_only:
            section("Kaggle resume → names only (existing members)")
            synthetic_names_used: set[tuple[str, str]] = set()
            for line_no, row in rows:
                norm = normalize_csv_keys(row)
                rid = pick_row_id(norm, line_no)
                plain = pick_resume_text_for_profile(norm)
                parsed = parse_name_from_resume(plain)
                if parsed:
                    first_name, last_name = parsed
                else:
                    first_name, last_name = unique_synthetic_name(str(rid), synthetic_names_used)
                email = f"kaggle_resume_{rid}@example.com"
                creds = login_existing_member(client, email)
                if creds is None:
                    print(f"  skip line {line_no}: no login for {email}")
                    continue
                user_id, token = creds
                try:
                    update_member_names_only(client, user_id, token, first_name, last_name)
                    ok(
                        f"line {line_no}",
                        {"email": email, "member_id": user_id, "first_name": first_name, "last_name": last_name},
                    )
                except SystemExit:
                    raise
                except Exception as exc:
                    print(f"  ✗ line {line_no} name update failed: {exc}")
                    continue
            section("Done")
            print("  Updated first_name/last_name only. Password unchanged (scripts/seed.py default).")
            return

        section("Kaggle resume → members (PDF upload: file or generated from CSV)")

        synthetic_names_used: set[tuple[str, str]] = set()
        for line_no, row in rows:
            norm = normalize_csv_keys(row)
            raw_resume, _resume_key = pick_resume_raw(norm)
            category = pick_category(norm)
            rid = pick_row_id(norm, line_no)

            plain = pick_resume_text_for_profile(norm)
            upload_payload = choose_resume_upload(
                mode=args.resume_upload,
                pdf_root=pdf_root,
                category=category,
                row_id=rid,
                raw_resume=raw_resume,
            )
            if upload_payload is None:
                if args.resume_upload == "pdf-only":
                    print(f"  skip line {line_no}: missing PDF (expected …/data/data/{category}/{rid}.pdf)")
                elif args.resume_upload == "csv-only":
                    print(f"  skip line {line_no}: empty resume cell")
                elif args.resume_upload == "pdf-prefer-html":
                    print(f"  skip line {line_no}: no PDF and empty CSV resume cell")
                else:
                    print(f"  skip line {line_no}: empty CSV resume cell (cannot synthesize PDF)")
                continue

            body, filename, mime, upload_src = upload_payload

            if args.min_plain_chars > 0 and len(plain) < args.min_plain_chars:
                print(f"  skip line {line_no}: profile text shorter than --min-plain-chars ({len(plain)})")
                continue

            parsed = parse_name_from_resume(plain)
            if parsed:
                first_name, last_name = parsed
            else:
                first_name, last_name = unique_synthetic_name(str(rid), synthetic_names_used)

            cat_display = title_case_category(category)
            headline = (cat_display[:220] if cat_display else plain[:220]).strip() or plain[:220]
            headline = (headline[:220] if headline else f"Kaggle resume {rid}")[:220]
            skills = skills_from_row(norm, category)
            summary = plain[:12000] if plain else None

            extras = profile_side_fields(norm)
            about = build_about_from_extra_columns(norm)

            plain_blob = (plain or "").strip()
            summary, headline, about, skills, extras, languages_out, _pused = merge_profile_with_parser(
                plain_blob=plain_blob,
                summary=summary,
                headline=headline,
                about=about,
                skills=skills,
                extras=extras,
                include_flexible=args.include_flexible,
            )

            open_to = None
            profile_status = None
            if not args.no_job_seeker_defaults:
                open_to = "job"
                profile_status = "open_to_work"

            email = f"kaggle_resume_{rid}@example.com"

            try:
                user_id, token = register_or_login(client, email)
            except Exception as exc:
                print(f"  ✗ line {line_no} auth failed: {exc}")
                continue

            try:
                ensure_profile(
                    client,
                    user_id,
                    token,
                    first_name=first_name,
                    last_name=last_name,
                    headline=headline,
                    summary=summary,
                    skills=skills,
                    phone=extras["phone"],
                    location_city=extras["location_city"],
                    location_state=extras["location_state"],
                    location_country=extras["location_country"],
                    website=extras["website"],
                    about=about,
                    experience=extras["experience"],
                    education=extras["education"],
                    languages=languages_out if isinstance(languages_out, list) else None,
                    open_to=open_to,
                    profile_status=profile_status,
                )
                upload_resume_bytes(client, user_id, token, filename, body, mime)
                cat_slug = re.sub(r"[^\w-]+", "_", (category or "misc").strip())[:48] or "misc"
                ext = Path(filename).suffix if filename.lower().endswith((".pdf", ".html", ".htm", ".txt")) else ".pdf"
                resume_url = f"https://example.com/kaggle-resumes/{cat_slug}/{rid}{ext}"
                post(
                    client,
                    "profile",
                    "/members/uploadResume",
                    {"member_id": user_id, "resume_url": resume_url},
                    token=token,
                )
                ok(
                    f"line {line_no}",
                    {
                        "email": email,
                        "member_id": user_id,
                        "file": filename,
                        "upload": upload_src,
                        "resume_url": resume_url,
                    },
                )
            except Exception as exc:
                print(f"  ✗ line {line_no} profile/upload failed: {exc}")
                continue

        section("Done")
        print(
            "  Uploads: PDF from data/data/<Category>/<ID>.pdf when present; "
            "else pdf-prefer builds PDF from CSV cell (fpdf2). Use --resume-upload pdf-prefer-html for old HTML uploads."
        )
        print("  Extra CSV columns → profile fields + Mongo `about` where applicable.")
        print("  Each member gets resume_url https://example.com/kaggle-resumes/<Category>/<id> (stable map).")
        print("  Parser enriches profiles from plain résumé text; use --include-flexible for harder rows.")
        print("  Password: same as scripts/seed.py (SkillSync1!).")


if __name__ == "__main__":
    main()
