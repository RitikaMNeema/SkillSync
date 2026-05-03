"""Deterministic per-company benefit bundles for seeded/imported jobs."""

from __future__ import annotations

import hashlib
from typing import Final

_PRESETS: Final[tuple[tuple[str, ...], ...]] = (
    (
        "Medical, dental, and vision insurance",
        "401(k) with employer match",
        "Flexible PTO",
        "Remote / hybrid stipend",
        "Annual learning budget",
    ),
    (
        "Health coverage (multiple plans)",
        "Equity / stock options",
        "Unlimited PTO",
        "Paid parental leave",
        "Home office setup allowance",
    ),
    (
        "Comprehensive medical",
        "FSA and commuter benefits",
        "401(k)",
        "Paid holidays + sick leave",
        "Employee assistance program",
    ),
    (
        "Dental and vision",
        "Performance bonuses",
        "Flexible schedules",
        "Professional certification reimbursement",
        "Team offsites",
    ),
    (
        "Medical + mental health coverage",
        "Company-sponsored disability insurance",
        "Generous PTO",
        "Sabbatical eligibility",
        "Gym / wellness stipend",
    ),
    (
        "Low-cost health plans",
        "Profit sharing",
        "Summer Fridays",
        "Relocation assistance",
        "Donation matching",
    ),
    (
        "High-deductible plan + HSA contribution",
        "Stock purchase plan",
        "Paid volunteer days",
        "Pet insurance discount",
        "Snacks and meals on-site",
    ),
    (
        "Regional medical network",
        "Pension or retirement contribution",
        "Birthday PTO",
        "Childcare subsidy",
        "Transit benefits",
    ),
)


def benefits_for_company(company_name: str) -> list[str]:
    """Same employer string always maps to the same bundle (stable across re-imports)."""
    key = (company_name or "").strip().lower() or "default"
    h = int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:4], "big")
    return list(_PRESETS[h % len(_PRESETS)])
