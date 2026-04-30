from shared.database.mysql import get_pool


async def find_user_by_email(email: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, email, password_hash, role FROM users WHERE email = %s",
                (email,),
            )
            return await cur.fetchone()


async def find_user_by_id(user_id: int) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id, email, role, created_at FROM users WHERE id = %s",
                (user_id,),
            )
            return await cur.fetchone()


async def create_user(email: str, password_hash: str, role: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, %s)",
                (email, password_hash, role),
            )
            return cur.lastrowid


async def delete_user(user_id: int) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return cur.rowcount > 0
