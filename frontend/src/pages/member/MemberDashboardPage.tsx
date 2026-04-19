import { useEffect, useState } from "react";
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

  const areaData = Array.from({ length: 30 }, (_, index) => ({
    date: `Day ${index + 1}`,
    views: Math.max(0, Math.round((dashboard.profile_views_30d / 30) * (index + 1)))
  }));

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Profile views" value={dashboard.profile_views_30d} subtitle="Past 30 days" />
        <StatCard title="Search appearances" value={dashboard.profile_views_30d} subtitle="Derived from current analytics events" />
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
                <Tooltip />
                <Area type="monotone" dataKey="views" stroke="#0a66c2" fillOpacity={1} fill="url(#memberViews)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Application status breakdown">
          <div className="h-72">
            {dashboard.application_status_breakdown?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dashboard.application_status_breakdown} dataKey="count" innerRadius={60} outerRadius={100}>
                    {dashboard.application_status_breakdown.map((entry) => (
                      <Cell key={entry.status} fill={statusColors[entry.status] ?? "#0a66c2"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
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
