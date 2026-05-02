"""Best-effort plain text from uploaded resume bytes (PDF / DOCX / UTF-8)."""

from __future__ import annotations

import io
from typing import Optional


def extract_resume_plain_text(data: bytes, content_type: Optional[str], filename: Optional[str]) -> str:
    ct = (content_type or "").lower()
    fn = (filename or "").lower()

    if "pdf" in ct or fn.endswith(".pdf"):
        return _from_pdf(data)
    if "wordprocessingml" in ct or fn.endswith(".docx"):
        return _from_docx(data)
    if "msword" in ct and fn.endswith(".doc"):
        return "(Legacy .doc format — download the file to open in Word.)"
    try:
        text = data.decode("utf-8", errors="replace").strip()
        return text if text else "(Empty file)"
    except Exception:
        return "(Could not decode file as text.)"


def _from_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return "(PDF text extraction unavailable — install pypdf.)"

    try:
        reader = PdfReader(io.BytesIO(data))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        out = "\n\n".join(parts).strip()
        return out if out else "(No extractable text in this PDF — try Download.)"
    except Exception as exc:  # noqa: BLE001 — return message to client
        return f"(Could not read PDF: {exc})"


def _from_docx(data: bytes) -> str:
    try:
        from docx import Document  # noqa: PLC0415 — python-docx
    except ImportError:
        return "(DOCX text extraction unavailable.)"

    try:
        document = Document(io.BytesIO(data))
        lines = [p.text for p in document.paragraphs if p.text and p.text.strip()]
        out = "\n".join(lines).strip()
        return out if out else "(No text found in DOCX — try Download.)"
    except Exception as exc:  # noqa: BLE001
        return f"(Could not read DOCX: {exc})"
