"""
Network score read API — reads precomputed rows from `member_network_scores`.
Populate scores by running `backend/scripts/network_analysis.py` after applying
`database/mysql/add_network_scores_table.sql`.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiomysql
from fastapi import Depends, FastAPI, Query
from pydantic import BaseModel, Field
from pymysql.err import ProgrammingError

from shared.database.mysql import close_pool, get_pool
from shared.middleware.auth import get_current_user
from shared.middleware.error_handler import AppException, register_error_handlers
from shared.middleware.logger import LoggerMiddleware
from shared.redis_utils.client import get_redis
from shared.utils.trace_id import TraceMiddleware


class MemberScoreRequest(BaseModel):
    member_id: int = Field(..., gt=0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    await get_redis()
    yield
    await close_pool()


app = FastAPI(title="Network Service", lifespan=lifespan)
app.add_middleware(LoggerMiddleware)
app.add_middleware(TraceMiddleware)
register_error_handlers(app)


@app.get("/health")
async def health():
    return {"success": True, "data": {"service": "network-service", "status": "ok"}}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _computed_at_iso(row: dict, key: str = "computed_at") -> str:
    raw = row.get(key)
    if raw is None:
        return _iso_now()
    if hasattr(raw, "isoformat"):
        return raw.isoformat()
    return str(raw)


def _count_from_c_row(crow: dict | None) -> int:
    """DictCursor key for COUNT(*) varies by driver; normalize to int."""
    if not crow:
        return 0
    for k, v in crow.items():
        if k is None:
            continue
        lk = str(k).lower()
        if lk in ("c", "cnt", "count", "count(*)") or lk.startswith("count"):
            try:
                return int(v)
            except (TypeError, ValueError):
                return 0
    try:
        return int(next(iter(crow.values())))
    except (StopIteration, TypeError, ValueError):
        return 0


def _is_missing_member_network_scores_table(exc: BaseException) -> bool:
    text = str(exc).lower()
    if "member_network_scores" not in text:
        return False
    if isinstance(exc, ProgrammingError) and exc.args and exc.args[0] == 1146:
        return True
    return "doesn't exist" in text or "does not exist" in text


async def _network_score_payload(member_id: int) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            row = None
            try:
                await cur.execute(
                    """
                    SELECT member_id, degree, pagerank_score, betweenness_score,
                           community_id, network_rank_percentile, computed_at
                    FROM member_network_scores
                    WHERE member_id = %s
                    """,
                    (member_id,),
                )
                row = await cur.fetchone()
            except ProgrammingError as e:
                if not _is_missing_member_network_scores_table(e):
                    raise AppException(
                        503,
                        "Database error while reading member_network_scores. Check MySQL logs and schema.",
                    ) from e
            except Exception as e:
                if _is_missing_member_network_scores_table(e):
                    row = None
                else:
                    raise AppException(
                        503,
                        "Could not read network scores from the database. Ensure MySQL is reachable and schema is up to date.",
                    ) from e

            if row:
                data = {
                    "member_id": int(row["member_id"]),
                    "degree": int(row["degree"]),
                    "pagerank_score": float(row["pagerank_score"]),
                    "betweenness_score": float(row["betweenness_score"]),
                    "community_id": int(row["community_id"]),
                    "network_rank_percentile": float(row["network_rank_percentile"]),
                    "computed_at": _computed_at_iso(row),
                }
                return {"success": True, "data": data}

            # No batch row yet (script not run / user added after last job): approximate from connections.
            try:
                await cur.execute(
                    """
                    SELECT COUNT(*) AS c FROM connections
                    WHERE user_id_1 = %s OR user_id_2 = %s
                    """,
                    (member_id, member_id),
                )
                crow = await cur.fetchone()
            except Exception as e:
                raise AppException(
                    503,
                    "Could not read the connections table. Ensure MySQL is running and init.sql (connections) has been applied.",
                ) from e
            deg = _count_from_c_row(crow)

    approx_pr = round(min(100.0, float(deg) * 8.0), 2)
    approx_pct = round(min(99.0, 40.0 + float(deg) * 5.0), 2)
    return {
        "success": True,
        "data": {
            "member_id": member_id,
            "degree": deg,
            "pagerank_score": approx_pr,
            "betweenness_score": 0.0,
            "community_id": 0,
            "network_rank_percentile": approx_pct,
            "computed_at": _iso_now(),
        },
    }


@app.get("/network/score")
async def get_network_score(
    member_id: int = Query(..., gt=0, description="Profile user id (stored in member_network_scores.member_id)"),
    _u=Depends(get_current_user),
):
    return await _network_score_payload(member_id)


@app.post("/network/score")
async def post_network_score(body: MemberScoreRequest, _u=Depends(get_current_user)):
    return await _network_score_payload(body.member_id)
