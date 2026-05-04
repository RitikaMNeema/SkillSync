#!/usr/bin/env python3
"""
Batch job: read `connections` from MySQL, build an undirected NetworkX graph,
compute degree, PageRank (0-100), betweenness (0-100), Louvain community id,
and network rank percentile by degree; upsert into `member_network_scores`.

Requires: pip install pymysql networkx

Env (same as backend / docker-compose defaults):
  MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER,
  MYSQL_PASSWORD or MYSQL_ROOT_PASSWORD (when MYSQL_USER=root)
"""

from __future__ import annotations

import os

import networkx as nx
import pymysql
from networkx.algorithms.community import louvain_communities


def _mysql_params() -> dict:
    user = os.getenv("MYSQL_USER", "root")
    if user == "root":
        password = os.getenv("MYSQL_ROOT_PASSWORD") or os.getenv("MYSQL_PASSWORD") or ""
    else:
        password = os.getenv("MYSQL_PASSWORD") or os.getenv("MYSQL_ROOT_PASSWORD") or ""
    return {
        "host": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.getenv("MYSQL_PORT", "3310")),
        "user": user,
        "password": password,
        "database": os.getenv("MYSQL_DATABASE", "linkedin_db"),
        "cursorclass": pymysql.cursors.DictCursor,
        "charset": "utf8mb4",
    }


def _normalize_0_100(values: dict[int, float]) -> dict[int, float]:
    if not values:
        return {}
    mn = min(values.values())
    mx = max(values.values())
    if mx <= mn:
        return {k: 50.0 for k in values}
    return {k: (values[k] - mn) / (mx - mn) * 100.0 for k in values}


def main() -> None:
    conn = pymysql.connect(**_mysql_params())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users")
            valid_user_ids = {int(r["id"]) for r in cur.fetchall()}

            cur.execute("SELECT user_id_1, user_id_2 FROM connections")
            edge_rows = cur.fetchall()

            cur.execute("SELECT member_id FROM members WHERE IFNULL(is_deleted, 0) = 0")
            member_rows = cur.fetchall()

        # Graph nodes: every user id that appears in connections (members + recruiters) plus isolated members.
        node_ids: set[int] = set()
        for r in member_rows:
            mid = int(r["member_id"])
            if mid in valid_user_ids:
                node_ids.add(mid)
        for row in edge_rows:
            u, v = int(row["user_id_1"]), int(row["user_id_2"])
            if u in valid_user_ids:
                node_ids.add(u)
            if v in valid_user_ids:
                node_ids.add(v)

        g = nx.Graph()
        for uid in node_ids:
            g.add_node(uid)

        for row in edge_rows:
            u, v = int(row["user_id_1"]), int(row["user_id_2"])
            if u in node_ids and v in node_ids and u != v:
                g.add_edge(u, v)

        degree_map = dict(g.degree())

        pr_raw = nx.pagerank(g, alpha=0.85) if g.number_of_nodes() else {}
        pr_norm = _normalize_0_100({int(n): float(v) for n, v in pr_raw.items()})

        if g.number_of_nodes() and g.number_of_edges():
            bet_raw = nx.betweenness_centrality(g, normalized=False)
        else:
            bet_raw = {n: 0.0 for n in g.nodes()}
        bet_norm = _normalize_0_100({int(n): float(v) for n, v in bet_raw.items()})

        community_of: dict[int, int] = {}
        if g.number_of_edges() >= 1:
            try:
                communities = list(louvain_communities(g, seed=42, resolution=1.0))
            except Exception:
                communities = [{n} for n in g.nodes()]
            for idx, comm in enumerate(communities):
                for n in comm:
                    community_of[int(n)] = idx
        else:
            for n in g.nodes():
                community_of[int(n)] = 0

        all_degrees_sorted = sorted(degree_map.values())
        n_deg = len(all_degrees_sorted)

        def degree_percentile(mid: int) -> float:
            d = int(degree_map.get(mid, 0))
            if n_deg == 0:
                return 50.0
            cnt = sum(1 for x in all_degrees_sorted if x <= d)
            return round(100.0 * cnt / n_deg, 3)

        rows = []
        for uid in sorted(node_ids):
            rows.append(
                (
                    uid,
                    int(degree_map.get(uid, 0)),
                    round(float(pr_norm.get(uid, 0.0)), 4),
                    round(float(bet_norm.get(uid, 0.0)), 8),
                    int(community_of.get(uid, 0)),
                    degree_percentile(uid),
                )
            )

        sql = """
            REPLACE INTO member_network_scores
            (member_id, degree, pagerank_score, betweenness_score, community_id, network_rank_percentile)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
        print(f"[network_analysis] Upserted {len(rows)} member_network_scores rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
