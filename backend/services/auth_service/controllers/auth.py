import logging
import os
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from jose import jwt, JWTError
from passlib.context import CryptContext
from models.account_deletion import purge_mongodb_for_user
from models.user import find_user_by_email, find_user_by_id, create_user, delete_user
from models.command_status import get_command_status
from producers.auth_command_producer import enqueue_auth_command
from shared.redis_utils.client import get_redis
from shared.utils.validation import is_valid_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET  = os.getenv("JWT_SECRET", "secret")
JWT_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 10080))  # 7 days

log = logging.getLogger(__name__)


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


async def email_exists(email: str) -> dict:
    if not is_valid_email(email):
        raise HTTPException(400, "Invalid email format")
    return {"exists": await find_user_by_email(email) is not None}


async def enqueue_register(email: str, password: str, role: str) -> dict:
    return await enqueue_auth_command("register", {"email": email, "password": password, "role": role}, actor_id=email)


async def enqueue_login(email: str, password: str) -> dict:
    return await enqueue_auth_command("login", {"email": email, "password": password}, actor_id=email)


async def enqueue_logout(token: str) -> dict:
    return await enqueue_auth_command("logout", {"token": token})


async def get_command(command_id: str) -> dict:
    status = await get_command_status(command_id)
    if not status:
        raise HTTPException(404, "Command not found")
    return status


async def delete_my_account(actor: dict) -> dict:
    """
    Remove persisted data for the authenticated user, delete the row, and blacklist the current token.
    user_id is taken only from the verified JWT (passed in ``actor``).
    """
    uid = int(actor["user_id"])
    token = actor["token"]

    user_row = await find_user_by_id(uid)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    role = user_row.get("role") or ""
    log.info("account_deletion started user_id=%s role=%s", uid, role)

    try:
        await purge_mongodb_for_user(uid, role)
        deleted = await delete_user(uid)
        if not deleted:
            raise HTTPException(status_code=404, detail="User not found")
    except HTTPException:
        raise
    except Exception:
        log.exception("account_deletion failed user_id=%s", uid)
        raise HTTPException(status_code=500, detail="Account deletion failed")

    try:
        await logout(token)
    except Exception:
        log.warning("token blacklist failed after delete user_id=%s", uid)

    log.info("account_deletion completed user_id=%s", uid)
    return {"message": "Account deleted successfully"}
