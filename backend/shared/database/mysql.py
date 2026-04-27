import os

import aiomysql
from shared.env import load_env

load_env()

_pool: aiomysql.Pool | None = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        user = os.getenv("MYSQL_USER", "root")
        root_pw = os.getenv("MYSQL_ROOT_PASSWORD")
        app_pw = os.getenv("MYSQL_PASSWORD")
        # Official MySQL Docker image sets the superuser from MYSQL_ROOT_PASSWORD only.
        # Connecting as root must use that value; MYSQL_PASSWORD may differ or be unused.
        if user == "root":
            password = root_pw or app_pw or "seekrit03"
        else:
            password = app_pw or root_pw or "seekrit03"
        _pool = await aiomysql.create_pool(
            # Default suits `uvicorn` on the host + MySQL from this repo's compose (127.0.0.1:3307).
            # In Docker, compose sets MYSQL_HOST=mysql (and port 3306 inside the network).
            host=os.getenv("MYSQL_HOST", "127.0.0.1"),
            port=int(os.getenv("MYSQL_PORT", "3307")),
            db=os.getenv("MYSQL_DATABASE", "linkedin_db"),
            user=user,
            password=password,
            autocommit=True,
            minsize=2,
            maxsize=10,
            cursorclass=aiomysql.DictCursor,
            charset="utf8mb4",
        )
        print("[MySQL] Connection pool created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        _pool.close()
        await _pool.wait_closed()
        _pool = None
