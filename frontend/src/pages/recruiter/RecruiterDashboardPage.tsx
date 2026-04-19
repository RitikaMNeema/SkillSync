import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, Users } from "lucide-react";
import toast from "react-hot-toast";
import { getGeoDistribution, getJobClicks, getLowTractionJobs, getRecruiterDashboard, getSavedJobsTrend, getTopJobs } from "../../api/analytics";
import { authStore } from "../../context/AuthContext";
import { ChartCard } from "../../components/analytics/ChartCard";
import { StatCard } from "../../components/analytics/StatCard";
import { CardSkeleton } from "../../components/ui/Skeleton";

export function RecruiterDashboardPage() {
  const recruiterId = authStore((state) => state.userId);
  const [loading, setLoading] = useState(true);
  const [topJobs, setTopJobs] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [lowTraction, setLowTraction] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [clicks, setClicks] = useState<Array<{ job_id: string; clicks: number }>>([]);
  const [saves, setSaves] = useState<Array<{ period: string; count: number }>>([]);
  const [geo, setGeo] = useState<Array<{ city: string | null; state: string | null; count: number }>>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!recruiterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const month = new Date().toISOString().slice(0, 10).replace(/-\d{2}$/, "-01");
    void Promise.all([
      getTopJobs(month),
      getLowTractionJobs(),
      getJobClicks(),
      getSavedJobsTrend("day"),
      getGeoDistribution(),
      getRecruiterDashboard(recruiterId)
    ])
      .then(([top, low, clickData, savesData, geoData, dashboard]) => {
        setTopJobs(top);
        setLowTraction(low);
        setClicks(clickData);
        setSaves(savesData);
        setGeo(geoData.slice(0, 8));
        setStats(Object.fromEntries(dashboard.map((item) => [item.event_type, item.count])));
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load dashboard");
      })
      .finally(() => setLoading(false));
  }, [recruiterId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-sm text-text-secondary">{new Date().toLocaleDateString()}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Active Jobs" value={topJobs.length} subtitle="Current month" icon={FileText} />
        <StatCard title="Total Applicants" value={stats["application.submitted"] ?? 0} subtitle="From analytics events" icon={Users} />
        <StatCard title="New This Week" value={saves.length} subtitle="Saved jobs datapoints" icon={CalendarDays} />
        <StatCard title="Pending Review" value={stats["application.statusChanged"] ?? 0} subtitle="Status changes tracked" icon={Users} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Top 10 job postings">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topJobs}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="job_id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="applications" fill="#0a66c2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Top 5 lowest applicant jobs">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lowTraction}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="job_id" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="applications" fill="#cc1016" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Clicks per posting">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clicks.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="job_id" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="clicks" stroke="#0a66c2" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Saved jobs trend">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={saves}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#0a66c2" fill="#e8f0f9" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <ChartCard title="City-wise applications">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={geo}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="city" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0a66c2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </section>
  );
}
