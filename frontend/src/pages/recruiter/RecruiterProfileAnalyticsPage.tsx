import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Bookmark, BriefcaseBusiness, Eye, FileText, Lightbulb } from "lucide-react";
import { getRecruiterProfileDashboard } from "../../api/analytics";
import { ProfileViewsAreaChart } from "../../components/analytics/ProfileViewsAreaChart";
import { ProfileViewersList } from "../../components/analytics/ProfileViewersList";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useAuthHydrated } from "../../hooks/useAuthHydrated";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import type { RecruiterProfileDashboard } from "../../types/analytics";

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

export function RecruiterProfileAnalyticsPage() {
  const userId = authStore((state) => state.userId);
  const authHydrated = useAuthHydrated();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<RecruiterProfileDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!authHydrated) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    void getRecruiterProfileDashboard(userId)
      .then(setDashboard)
      .catch((error: unknown) => {
        const msg = getApiErrorMessage(error);
        toast.error(msg);
        setLoadError(msg);
        setDashboard(null);
      })
      .finally(() => setLoading(false));
  }, [authHydrated, userId]);

  const statusData = dashboard?.application_status_breakdown ?? [];
  const applicantsCount = dashboard?.applicants_30d ?? 0;
  const totalStatusCount = statusData.reduce((sum, row) => sum + row.count, 0) || applicantsCount || 1;
  const statusBreakdownRows = statusData
    .map((row) => {
      const percent = (row.count / totalStatusCount) * 100;
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

  if (loading || !authHydrated) {
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
        <h1 className="text-2xl font-bold">Profile insights</h1>
        <p className="text-sm text-text-secondary">We could not load your profile analytics. Try again later.</p>
        {loadError ? <p className="mt-2 text-sm text-[#b91c1c]">{loadError}</p> : null}
      </section>
    );
  }

  return (
    <section className="space-y-3 pb-4">
      <div className="px-1 pt-1">
        <h1 className="text-[2.05rem] font-semibold leading-tight text-[#1d2226]">Profile insights</h1>
        <p className="mt-1 text-sm text-[#666]">How members engage with your profile and your jobs (last 30 days).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <span className="ml-1 text-[#666]">vs. first half of period</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0f7ff]">
              <BriefcaseBusiness className="h-5 w-5 text-[#0a66c2]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Job post views</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{dashboard.job_views_30d}</p>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#666]">Across your postings</p>
        </div>
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#edf9f2]">
              <Bookmark className="h-5 w-5 text-[#1f8f55]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Job saves</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{dashboard.job_saves_30d}</p>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#666]">Bookmarks on your listings</p>
        </div>
        <div className="rounded-xl border border-[#e2e6ea] bg-white px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f2edfb]">
              <FileText className="h-5 w-5 text-[#6b46c1]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">Applicants</p>
              <p className="text-[1.95rem] font-semibold leading-none text-[#1d2226]">{dashboard.applicants_30d}</p>
            </div>
          </div>
          <p className="mt-1 text-sm text-[#666]">New submissions (30 days)</p>
        </div>
      </div>

      <div className="rounded-xl border border-[#dce0e4] bg-white p-[18px]">
        <h2 className="text-[1.55rem] font-semibold text-[#1d2226]">Overview</h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-[#e2e6ea] bg-white p-3.5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-[1.15rem] font-semibold text-[#1d2226]">Profile views</h3>
                <p className="mt-0.5 text-sm text-[#666]">When someone opens your recruiter profile.</p>
              </div>
            </div>

            <div className="mb-2 flex items-end gap-2">
              <p className="text-[2rem] font-semibold leading-none text-[#1d2226]">{dashboard.profile_views_30d}</p>
              <p className="pb-0.5 text-sm text-[#666]">Total views</p>
            </div>

            <ProfileViewsAreaChart daily={dashboard.profile_views_daily_30d ?? []} instanceId="recruiter-profile" />

            <ProfileViewersList rows={dashboard.profile_viewers_recent} />
          </div>

          <div className="rounded-lg border border-[#e2e6ea] bg-white p-3.5">
            <h3 className="text-[1.15rem] font-semibold text-[#1d2226]">Applicant pipeline</h3>
            <p className="mt-0.5 text-sm text-[#666]">Status mix for applications to your jobs.</p>
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
                <p className="text-sm text-[#666]">No application events in the last 30 days.</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-[#e2e6ea] bg-white p-3.5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff8de]">
              <Lightbulb className="h-5 w-5 text-[#b08900]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1d2226]">At a glance</p>
              <p className="mt-1 text-sm text-[#666]">
                {dashboard.applicants_30d} applicants · {dashboard.job_saves_30d} saves · {dashboard.job_views_30d}{" "}
                job views
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-[#666]">
          For funnel metrics across all jobs, open{" "}
          <Link to="/dashboard" className="font-semibold text-[#0a66c2] hover:underline">
            Analytics
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
