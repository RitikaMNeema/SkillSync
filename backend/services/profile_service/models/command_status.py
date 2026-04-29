import json

from shared.redis_utils.client import get_redis

COMMAND_TTL_SECONDS = 24 * 60 * 60


def _cmd_key(command_id: str) -> str:
    return f"profile:command:{command_id}"


async def set_command_status(command_id: str, payload: dict) -> None:
    redis = await get_redis()
    await redis.set(_cmd_key(command_id), json.dumps(payload), ex=COMMAND_TTL_SECONDS)


async def get_command_status(command_id: str) -> dict | None:
    redis = await get_redis()
    raw = await redis.get(_cmd_key(command_id))
    if not raw:
        return None
    return json.loads(raw)

