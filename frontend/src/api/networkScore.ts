import api from "./axios";
import type { ApiResponse } from "../types/common";

export type MemberNetworkScorePayload = {
  member_id: number;
  degree: number;
  pagerank_score: number;
  betweenness_score: number;
  network_rank_percentile: number;
  computed_at: string;
};

function parseFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Accepts numbers or stringified decimals (common when JSON comes from MySQL DECIMAL columns). */
function parseScorePayload(d: unknown): MemberNetworkScorePayload | null {
  if (d == null || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const member_id = parseFiniteNumber(o.member_id);
  const degree = parseFiniteNumber(o.degree);
  const pagerank_score = parseFiniteNumber(o.pagerank_score);
  const betweenness_score = parseFiniteNumber(o.betweenness_score);
  const network_rank_percentile = parseFiniteNumber(o.network_rank_percentile);
  if (
    member_id === null ||
    degree === null ||
    pagerank_score === null ||
    betweenness_score === null ||
    network_rank_percentile === null
  ) {
    return null;
  }
  const rawAt = o.computed_at;
  const computed_at =
    typeof rawAt === "string" && rawAt.length > 0 ? rawAt : rawAt != null ? String(rawAt) : null;
  if (computed_at === null || computed_at.length === 0) return null;
  return {
    member_id: Math.trunc(member_id),
    degree: Math.trunc(degree),
    pagerank_score,
    betweenness_score,
    network_rank_percentile,
    computed_at
  };
}

/** GET avoids POST-only 405s from some static/nginx proxy setups; backend supports both. */
export async function fetchMemberNetworkScore(memberId: number): Promise<MemberNetworkScorePayload> {
  const { data } = await api.get<ApiResponse<MemberNetworkScorePayload>>("/network/score", {
    params: { member_id: memberId }
  });
  const parsed = parseScorePayload(data?.data);
  if (!data?.success || parsed === null) {
    const apiErr = typeof (data as { error?: unknown } | null)?.error === "string" ? (data as { error: string }).error : "";
    throw new Error(apiErr.trim() || "Network service returned an unexpected response.");
  }
  return parsed;
}
