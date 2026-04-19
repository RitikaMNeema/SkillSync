import re
from shared.middleware.error_handler import AppException


def require_fields(data: dict, fields: list[str]) -> None:
    missing = [f for f in fields if data.get(f) in (None, "", [])]
    if missing:
        raise AppException(400, f"Missing required fields: {', '.join(missing)}")


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def is_positive_int(val) -> bool:
    try:
        return int(val) > 0
    except (TypeError, ValueError):
        return False
