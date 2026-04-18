from shared.redis_utils.client import get_redis

IDEMPOTENCY_TTL = 86400  # 24 hours


async def is_duplicate(idempotency_key: str) -> bool:
    """Returns True if already processed (duplicate). Atomically marks as processed on first call."""
    redis = await get_redis()
    result = await redis.set(
        f"idempotency:{idempotency_key}",
        "1",
        ex=IDEMPOTENCY_TTL,
        nx=True,  # SET NX — only set if not exists
    )
    # result is True if key was newly set, None if it already existed
    return result is None
