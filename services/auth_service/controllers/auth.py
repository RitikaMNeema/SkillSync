import os
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from jose import jwt, JWTError
from passlib.context import CryptContext
from models.user import find_user_by_email, find_user_by_id, create_user
from shared.redis_utils.client import get_redis
from shared.utils.validation import is_valid_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET  = os.getenv("JWT_SECRET", "secret")
JWT_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 10080))  # 7 days


def _make_token(user_id: int, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_MINUTES)
    return jwt.encode({"user_id": user_id, "role": role, "exp": exp}, JWT_SECRET, algorithm="HS256")


async def register(email: str, password: str, role: str) -> dict:
    if not is_valid_email(email):
        raise HTTPException(400, "Invalid email format")
    if await find_user_by_email(email):
        raise HTTPException(409, "Email already registered")

    password_hash = pwd_context.hash(password)
    user_id = await create_user(email, password_hash, role)
    return {"user_id": user_id, "email": email, "role": role}


async def login(email: str, password: str) -> dict:
    user = await find_user_by_email(email)
    if not user or not pwd_context.verify(password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")

    token = _make_token(user["id"], user["role"])
    return {"token": token, "user_id": user["id"], "role": user["role"]}


async def logout(token: str) -> dict:
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_exp": False})
        exp = decoded.get("exp", 0)
        ttl = max(exp - int(datetime.now(timezone.utc).timestamp()), 1)
    except JWTError:
        ttl = JWT_MINUTES * 60

    redis = await get_redis()
    await redis.set(f"blacklist:{token}", "1", ex=ttl)
    return {"message": "Logged out successfully"}


async def validate(token: str) -> dict:
    redis = await get_redis()
    if await redis.get(f"blacklist:{token}"):
        raise HTTPException(401, "Token has been invalidated")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token")

    user = await find_user_by_id(payload["user_id"])
    if not user:
        raise HTTPException(404, "User not found")

    return {"user_id": payload["user_id"], "role": payload["role"]}
