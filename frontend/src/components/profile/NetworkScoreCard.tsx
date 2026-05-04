import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchMemberNetworkScore, type MemberNetworkScorePayload } from "../../api/networkScore";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

type NetworkScoreCardProps = {
  memberId: number;
  connectionsCount: number;
  /** Sidebar uses the same typography as Analytics / other right-rail cards. */
  variant?: "default" | "sidebar";
};

export function NetworkScoreCard({ memberId, connectionsCount, variant = "default" }: NetworkScoreCardProps) {
  const isSidebar = variant === "sidebar";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<MemberNetworkScorePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScores(null);
    void (async () => {
      try {
        const data = await fetchMemberNetworkScore(memberId);
        if (!cancelled) {
          setScores(data);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = getApiErrorMessage(e).trim();
          setError(msg || "Could not load network score.");
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  return (
    <Card className="rounded-2xl border border-[#dde3ea] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className={`flex items-center justify-between gap-4 ${isSidebar ? "mb-4" : "mb-5"}`}>
        <div className="flex items-center gap-2">
          <Users className={isSidebar ? "h-5 w-5 text-[#434343]" : "h-6 w-6 text-[#434343]"} aria-hidden />
          {isSidebar ? (
            <h3 className="text-lg font-semibold text-[#1f1f1f]">Network score</h3>
          ) : (
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.02em] text-[#1f1f1f]">Network score</h2>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : error ? (
        <p className="text-sm leading-relaxed text-[#6b7280]">{error}</p>
      ) : scores ? (
        <div className="space-y-4 border-t border-[#edf1f4] pt-4 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-[#6b7280]">Network score</span>
            <span className="text-[1.65rem] font-semibold tabular-nums text-[#1f1f1f]">
              {Math.round(scores.pagerank_score)}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[#edf1f4] pt-3">
            <span className="text-sm font-medium text-[#6b7280]">Connections</span>
            <span className="text-lg font-semibold tabular-nums text-[#1f1f1f]">{connectionsCount}</span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[#edf1f4] pt-3">
            <span className="text-sm font-medium text-[#6b7280]">Percentile rank</span>
            <span className="text-lg font-semibold tabular-nums text-[#1f1f1f]">
              {Math.round(scores.network_rank_percentile)}%
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[#6b7280]">
          No score data yet. Refresh the page or try again in a moment.
        </p>
      )}
    </Card>
  );
}
