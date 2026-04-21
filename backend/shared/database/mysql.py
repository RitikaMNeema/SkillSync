import os
import aiomysql

_pool: aiomysql.Pool | None = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=os.getenv("MYSQL_HOST", "host.docker.internal"),
            port=int(os.getenv("MYSQL_PORT", 3306)),
            db=os.getenv("MYSQL_DATABASE", "linkedin_db"),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", os.getenv("MYSQL_ROOT_PASSWORD", "seekrit03")),
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
