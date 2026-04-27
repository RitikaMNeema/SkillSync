"""Load environment files from the backend root (for local uvicorn outside Docker)."""

from pathlib import Path

_loaded = False


def load_backend_env() -> None:
    global _loaded
    if _loaded:
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    backend_root = Path(__file__).resolve().parent.parent
    load_dotenv(backend_root / ".env")
    # Optional: host-specific overrides (127.0.0.1 instead of mysql/redis/mongo)
    load_dotenv(backend_root / ".env.local", override=True)
    _loaded = True


# Backwards compatibility with existing imports
load_env = load_backend_env
