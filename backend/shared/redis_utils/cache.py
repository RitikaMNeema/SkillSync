import json
from datetime import date, datetime
from decimal import Decimal

from shared.redis_utils.client import get_redis


class _Encoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        return super().default(o)

DEFAULT_TTL = 300


def _json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


async def cache_get(key: str):
    redis = await get_redis()
    raw = await redis.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def cache_set(key: str, value, ttl: int = DEFAULT_TTL) -> None:
    redis = await get_redis()
    try:
        payload = json.dumps(value, default=_json_default)
    except (TypeError, ValueError):
        # Cache failures must never block the request. Skip caching if the value
        # contains something we can't serialise cleanly.
        return
    try:
        await redis.set(key, payload, ex=ttl)
    except Exception:
        # Redis itself being unreachable shouldn't fail the user's request.
        return


async def cache_del(key: str) -> None:
    try:
        redis = await get_redis()
        await redis.delete(key)
    except Exception:
        return


async def cache_del_pattern(pattern: str) -> None:
    try:
        redis = await get_redis()
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
    except Exception:
        return
