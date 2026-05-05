from shared.database.mysql import get_pool

PAGE_SIZE = 20


async def _delete_accepted_requests_between_cursor(cur, uid1: int, uid2: int) -> None:
    """Remove accepted request rows for this unordered pair (same link as connections table)."""
    await cur.execute(
        """DELETE FROM connection_requests
           WHERE status='accepted'
             AND requester_id IN (%s, %s)
             AND receiver_id IN (%s, %s)
             AND requester_id <> receiver_id""",
        (uid1, uid2, uid1, uid2),
    )


async def ensure_blocks_table() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """CREATE TABLE IF NOT EXISTS user_blocks (
                     id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                     blocker_id BIGINT UNSIGNED NOT NULL,
                     blocked_id BIGINT UNSIGNED NOT NULL,
                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                     UNIQUE KEY uq_user_block (blocker_id, blocked_id),
                     CONSTRAINT fk_blocker FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
                     CONSTRAINT fk_blocked FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
                   )"""
            )


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


async def delete_request_by_id(request_id) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM connection_requests WHERE id=%s", (request_id,))


async def get_pending_requests(user_id) -> list:
    await ensure_blocks_table()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT
                     cr.*,
                     req.email AS requester_email,
                     rec.email AS receiver_email,
                     CASE
                       WHEN cr.receiver_id = %s THEN 'incoming'
                       ELSE 'outgoing'
                     END AS direction,
                     CASE
                       WHEN cr.receiver_id = %s THEN req.email
                       ELSE rec.email
                     END AS counterpart_email
                   FROM connection_requests cr
                   JOIN users req ON cr.requester_id = req.id
                   JOIN users rec ON cr.receiver_id = rec.id
                   WHERE (cr.receiver_id=%s OR cr.requester_id=%s) AND cr.status='pending'
                     AND NOT EXISTS (
                       SELECT 1
                       FROM user_blocks ub
                       WHERE (ub.blocker_id = %s AND ub.blocked_id = CASE WHEN cr.receiver_id = %s THEN cr.requester_id ELSE cr.receiver_id END)
                          OR (ub.blocker_id = CASE WHEN cr.receiver_id = %s THEN cr.requester_id ELSE cr.receiver_id END AND ub.blocked_id = %s)
                     )
                   ORDER BY cr.created_at DESC""",
                (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id),
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
    """Accept: create connection atomically; profile counters update via events."""
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
                await _delete_accepted_requests_between_cursor(cur, uid1, uid2)
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise


async def get_user_connections(user_id) -> list:
    await ensure_blocks_table()
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
                     AND NOT EXISTS (
                       SELECT 1
                       FROM user_blocks ub
                       WHERE (ub.blocker_id = %s AND ub.blocked_id = CASE WHEN c.user_id_1=%s THEN c.user_id_2 ELSE c.user_id_1 END)
                          OR (ub.blocker_id = CASE WHEN c.user_id_1=%s THEN c.user_id_2 ELSE c.user_id_1 END AND ub.blocked_id = %s)
                     )
                   ORDER BY c.connected_at DESC""",
                (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id),
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


async def block_user_transaction(blocker_id: int, blocked_id: int) -> None:
    await ensure_blocks_table()
    a, b = (blocker_id, blocked_id) if blocker_id < blocked_id else (blocked_id, blocker_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.begin()
        try:
            async with conn.cursor() as cur:
                await cur.execute(
                    "DELETE FROM connections WHERE user_id_1=%s AND user_id_2=%s",
                    (a, b),
                )
                await _delete_accepted_requests_between_cursor(cur, blocker_id, blocked_id)
                await cur.execute(
                    """UPDATE connection_requests
                       SET status='rejected'
                       WHERE requester_id IN (%s, %s) AND receiver_id IN (%s, %s) AND status='pending'""",
                    (blocker_id, blocked_id, blocker_id, blocked_id),
                )
                await cur.execute(
                    "INSERT IGNORE INTO user_blocks (blocker_id, blocked_id) VALUES (%s, %s)",
                    (blocker_id, blocked_id),
                )
            await conn.commit()
        except Exception:
            await conn.rollback()
            raise

