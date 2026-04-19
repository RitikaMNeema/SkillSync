from shared.database.mysql import get_pool

PAGE_SIZE = 20


async def find_request(requester_id, receiver_id) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM connection_requests WHERE requester_id=%s AND receiver_id=%s",
                (requester_id, receiver_id),
            )
            return await cur.fetchone()


async def find_request_by_id(request_id) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM connection_requests WHERE id=%s", (request_id,))
            return await cur.fetchone()


async def create_request(requester_id, receiver_id) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO connection_requests (requester_id,receiver_id,status) VALUES(%s,%s,'pending')",
                (requester_id, receiver_id),
            )
            return cur.lastrowid


async def update_request_status(request_id, status) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE connection_requests SET status=%s WHERE id=%s", (status, request_id)
            )


async def get_pending_requests(receiver_id) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT cr.*, u.email AS requester_email
                   FROM connection_requests cr JOIN users u ON cr.requester_id=u.id
                   WHERE cr.receiver_id=%s AND cr.status='pending'
                   ORDER BY cr.created_at DESC""",
                (receiver_id,),
            )
            return await cur.fetchall()


async def connection_exists(uid1, uid2) -> bool:
    a, b = (uid1, uid2) if uid1 < uid2 else (uid2, uid1)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id FROM connections WHERE user_id_1=%s AND user_id_2=%s", (a, b)
            )
            return await cur.fetchone() is not None


async def accept_connection_transaction(requester_id, receiver_id, request_id) -> None:
    """Accept: create connection + increment both counts atomically."""
    a, b = (requester_id, receiver_id) if requester_id < receiver_id else (receiver_id, requester_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.begin()
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    "UPDATE connection_requests SET status='accepted' WHERE id=%s", (request_id,)
                )
                await cur.execute(
                    "INSERT INTO connections (user_id_1,user_id_2) VALUES(%s,%s)", (a, b)
                )
                await cur.execute(
                    "UPDATE members SET connections_count=connections_count+1 WHERE member_id=%s", (requester_id,)
                )
                await cur.execute(
                    "UPDATE members SET connections_count=connections_count+1 WHERE member_id=%s", (receiver_id,)
                )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise


async def remove_connection_transaction(uid1, uid2) -> None:
    a, b = (uid1, uid2) if uid1 < uid2 else (uid2, uid1)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.begin()
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM connections WHERE user_id_1=%s AND user_id_2=%s", (a, b)
                )
                await cur.execute(
                    "UPDATE members SET connections_count=GREATEST(connections_count-1,0) WHERE member_id=%s", (uid1,)
                )
                await cur.execute(
                    "UPDATE members SET connections_count=GREATEST(connections_count-1,0) WHERE member_id=%s", (uid2,)
                )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise


async def get_user_connections(user_id) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT c.id, c.connected_at,
                          CASE WHEN c.user_id_1=%s THEN c.user_id_2 ELSE c.user_id_1 END AS connected_user_id,
                          u.email AS connected_email
                   FROM connections c
                   JOIN users u ON u.id=CASE WHEN c.user_id_1=%s THEN c.user_id_2 ELSE c.user_id_1 END
                   WHERE c.user_id_1=%s OR c.user_id_2=%s
                   ORDER BY c.connected_at DESC""",
                (user_id, user_id, user_id, user_id),
            )
            return await cur.fetchall()


async def get_mutual_connections(uid1, uid2) -> list:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT a.mutual_id, u.email
                   FROM (
                     SELECT CASE WHEN user_id_1=%s THEN user_id_2 ELSE user_id_1 END AS mutual_id
                     FROM connections WHERE user_id_1=%s OR user_id_2=%s
                   ) a
                   JOIN (
                     SELECT CASE WHEN user_id_1=%s THEN user_id_2 ELSE user_id_1 END AS mutual_id
                     FROM connections WHERE user_id_1=%s OR user_id_2=%s
                   ) b USING (mutual_id)
                   JOIN users u ON u.id=a.mutual_id""",
                (uid1, uid1, uid1, uid2, uid2, uid2),
            )
            return await cur.fetchall()
