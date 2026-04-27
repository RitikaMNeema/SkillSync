import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getMemberDashboard } from "../../api/analytics";
import { getApplicationsByMember } from "../../api/applications";
import { ChartCard } from "../../components/analytics/ChartCard";
import { StatCard } from "../../components/analytics/StatCard";
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

  const areaData = useMemo(() => {
    const source = dashboard?.profile_views_daily_30d ?? [];
    if (!source.length) {
      return Array.from({ length: 30 }, (_, index) => ({
        date: `Day ${index + 1}`,
        views: 0
      }));
    }
    return source.map((point, index) => ({
      date: index % 3 === 0 ? `Day ${index + 1}` : "",
      views: point.count
    }));
  }, [dashboard?.profile_views_daily_30d]);
  const statusData = dashboard?.application_status_breakdown ?? [];
  const totalStatusCount = statusData.reduce((sum, row) => sum + row.count, 0);

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
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Profile views" value={dashboard.profile_views_30d} subtitle="Past 30 days" />
        <StatCard title="Search appearances" value={dashboard.search_appearances_30d} subtitle="Past 30 days" />
        <StatCard title="Applications" value={applicationsCount} subtitle="Tracked from application service" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Who viewed your profile">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="memberViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0a66c2" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0a66c2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#00000061" }} />
                <Tooltip formatter={(value) => [`${value} views`, "Profile views"]} />
                <Area type="monotone" dataKey="views" stroke="#0a66c2" fillOpacity={1} fill="url(#memberViews)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Application status breakdown">
          <div className="h-72">
            {statusData.length ? (
              <div className="grid h-full grid-cols-[minmax(0,1fr)_170px] gap-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="count" innerRadius={60} outerRadius={100}>
                      {statusData.map((entry) => (
                        <Cell key={entry.status} fill={statusColors[entry.status] ?? "#0a66c2"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, item) => [`${value} applications`, statusLabel[item.payload.status] ?? item.payload.status]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col justify-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Total {totalStatusCount}</p>
                  {statusData.map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-2 text-text-secondary">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[entry.status] ?? "#0a66c2" }} />
                        {statusLabel[entry.status] ?? entry.status}
                      </span>
                      <span className="font-semibold text-text-primary">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-text-secondary">
                No application status events yet (updates appear after recruiters change application status).
              </p>
            )}
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
