import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Eye, FileText, Lightbulb, Search } from "lucide-react";
import { getMemberDashboard } from "../../api/analytics";
import { getApplicationsByMember } from "../../api/applications";
import { ProfileViewsAreaChart } from "../../components/analytics/ProfileViewsAreaChart";
import { ProfileViewersList } from "../../components/analytics/ProfileViewersList";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { MemberDashboard } from "../../types/analytics";

const statusColors: Record<string, string> = {
  submitted: "#1e40af",
  reviewing: "#915907",
  interview: "#6b46c1",
  offer: "#057642",
  rejected: "#b91c1c",
  withdrawn: "#6b7280"
};

const statusLabel: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn"
};

export function MemberDashboardPage() {
  const userId = authStore((state) => state.userId);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<MemberDashboard | null>(null);
  const [applicationsCount, setApplicationsCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([getMemberDashboard(userId), getApplicationsByMember(userId)])
      .then(([dash, apps]) => {
        setDashboard(dash);
        setApplicationsCount(apps.total);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load dashboard");
        setDashboard(null);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const statusData = dashboard?.application_status_breakdown ?? [];
  const totalStatusCount = statusData.reduce((sum, row) => sum + row.count, 0) || applicationsCount;
  const statusBreakdownRows = statusData
    .map((row) => {
      const safeTotal = totalStatusCount || 1;
      const percent = (row.count / safeTotal) * 100;
      return {
        status: row.status,
        label: statusLabel[row.status] ?? row.status,
        count: row.count,
        percent
      };
    })
    .sort((a, b) => b.count - a.count);

  const profileViewsTrend = useMemo(() => {
    const source = dashboard?.profile_views_daily_30d ?? [];
    if (!source.length) return 0;
    const midpoint = Math.floor(source.length / 2);
    const previous = source.slice(0, midpoint).reduce((sum, point) => sum + point.count, 0);
    const recent = source.slice(midpoint).reduce((sum, point) => sum + point.count, 0);
    if (previous <= 0) return recent > 0 ? 100 : 0;
    return ((recent - previous) / previous) * 100;
  }, [dashboard?.profile_views_daily_30d]);
  const applicationShare = totalStatusCount > 0 ? (applicationsCount / totalStatusCount) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-text-secondary">We could not load your analytics. Try again later.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 pb-4">
      <div className="px-1 pt-1">
        <h1 className="text-[2.05rem] font-semibold leading-tight text-[#1d2226]">Career Dashboard</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef4fb]">
              <Eye className="h-5 w-5 text-[#0a66c2]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Profile views</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{dashboard.profile_views_30d}</p>
            </div>
          </div>
          <p className="mt-1 text-sm">
            <span className={`font-semibold ${profileViewsTrend >= 0 ? "text-[#057642]" : "text-[#b91c1c]"}`}>
              {profileViewsTrend >= 0 ? "▲" : "▼"} {Math.abs(profileViewsTrend).toFixed(0)}%
            </span>
            <span className="ml-1 text-[#666]">from previous 30 days</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#edf9f2]">
              <Search className="h-5 w-5 text-[#1f8f55]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Search appearances</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{dashboard.search_appearances_30d}</p>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#666]">In last 30 days</p>
        </div>
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f2edfb]">
              <FileText className="h-5 w-5 text-[#6b46c1]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Applications</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{applicationsCount}</p>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#666]">
            {applicationShare.toFixed(0)}% of tracked application-status events
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[#dce0e4] bg-white p-[18px]">
        <h2 className="text-[1.55rem] font-semibold text-[#1d2226]">Overview</h2>
        <p className="mt-1 text-sm text-[#666]">Key insights about your profile performance.</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-[#e2e6ea] bg-white p-3.5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-[1.15rem] font-semibold text-[#1d2226]">Profile views</h3>
                <p className="mt-0.5 text-sm text-[#666]">Discover how often your profile was viewed.</p>
              </div>
              <button type="button" className="rounded-md border border-[#d0d7de] px-2.5 py-1 text-xs font-semibold text-[#555]">
                Daily
              </button>
            </div>

            <div className="mb-2 flex items-end gap-2">
              <p className="text-[2rem] font-semibold leading-none text-[#1d2226]">{dashboard.profile_views_30d}</p>
              <p className="pb-0.5 text-sm text-[#666]">Total views</p>
            </div>

            <p className="mb-3 text-sm">
              <span className={`font-semibold ${profileViewsTrend >= 0 ? "text-[#057642]" : "text-[#b91c1c]"}`}>
                {profileViewsTrend >= 0 ? "▲" : "▼"} {Math.abs(profileViewsTrend).toFixed(0)}%
              </span>
              <span className="ml-1 text-[#666]">from previous 30 days</span>
            </p>

            <ProfileViewsAreaChart daily={dashboard.profile_views_daily_30d ?? []} instanceId="member-dashboard" />

            <ProfileViewersList rows={dashboard.profile_viewers_recent} />

            <button type="button" className="mt-2 text-sm font-semibold text-[#0a66c2] hover:underline">
              View all profile views →
            </button>
          </div>

          <div className="rounded-lg border border-[#e2e6ea] bg-white p-3.5">
            <h3 className="text-[1.15rem] font-semibold text-[#1d2226]">Application status</h3>
            <p className="mt-0.5 text-sm text-[#666]">Where your profile engagement is coming from.</p>
            <div className="mt-4 space-y-3.5">
              {statusBreakdownRows.length ? (
                statusBreakdownRows.slice(0, 6).map((row) => (
                  <div key={row.status}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <p className="font-semibold text-[#1d2226]">{row.label}</p>
                      <p className="text-[#444]">{row.percent.toFixed(1)}%</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#eef1f4]">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.max(3, row.percent)}%`,
                          backgroundColor: statusColors[row.status] ?? "#0a66c2"
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#666]">No application status data available yet.</p>
              )}
            </div>
            <button type="button" className="mt-4 text-sm font-semibold text-[#0a66c2] hover:underline">
              View all statuses →
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#e2e6ea] bg-white p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff8de]">
                <Lightbulb className="h-5 w-5 text-[#b08900]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#1d2226]">Insights</p>
              <p className="mt-1 text-[1.05rem] font-semibold text-[#1d2226]">
                {dashboard.search_appearances_30d > 0
                  ? "Your profile is appearing in search"
                  : "Complete your profile to increase visibility"}
              </p>
              <p className="mt-1 text-sm text-[#666]">
                Search appearances in last 30 days: {dashboard.search_appearances_30d}. Applications tracked: {applicationsCount}.
              </p>
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
