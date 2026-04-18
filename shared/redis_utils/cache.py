import json
from shared.redis_utils.client import get_redis

DEFAULT_TTL = 300


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
    await redis.set(key, json.dumps(value), ex=ttl)


async def cache_del(key: str) -> None:
    redis = await get_redis()
    await redis.delete(key)


async def cache_del_pattern(pattern: str) -> None:
    redis = await get_redis()
    keys = await redis.keys(pattern)
    if keys:
        await redis.delete(*keys)
