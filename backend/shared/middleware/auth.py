import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from shared.redis_utils.client import get_redis

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    token = credentials.credentials

    try:
        redis = await get_redis()
        if await redis.get(f"blacklist:{token}"):
            raise HTTPException(status_code=401, detail="Token has been invalidated")
    except HTTPException:
        raise
    except Exception:
        pass  # Redis errors must not block auth

    try:
        payload = jwt.decode(
            token,
            os.getenv("JWT_SECRET", "secret"),
            algorithms=["HS256"],
        )
        return {"user_id": payload["user_id"], "role": payload["role"], "token": token}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_role(*roles: str):
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check
