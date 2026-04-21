import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, LabelList } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, FileText, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { getGeoDistribution, getJobClicks, getLowTractionJobs, getRecruiterDashboard, getSavedJobsTrend, getTopJobs } from "../../api/analytics";
import { getApplicationsByJob } from "../../api/applications";
import { getAllJobsByRecruiter } from "../../api/jobs";
import { authStore } from "../../context/AuthContext";
import { ChartCard } from "../../components/analytics/ChartCard";
import { StatCard } from "../../components/analytics/StatCard";
import { CardSkeleton } from "../../components/ui/Skeleton";

/** Align label with `YYYY-MM` / API month string — avoids local TZ showing the wrong month for `YYYY-MM-01`. */
function formatMonthYearUtc(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function EmptyChart({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#d9dee3] bg-[#fafbfd] text-center">
      <BarChart3 className="h-5 w-5 text-text-tertiary" />
      <p className="text-sm font-medium text-text-secondary">{message}</p>
      {hint ? <p className="text-xs text-text-tertiary">{hint}</p> : null}
    </div>
  );
}

export function RecruiterDashboardPage() {
  const navigate = useNavigate();
  const recruiterId = authStore((state) => state.userId);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [topJobs, setTopJobs] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [lowTraction, setLowTraction] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [jobNameById, setJobNameById] = useState<Record<string, string>>({});
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [clicks, setClicks] = useState<Array<{ job_id: string; clicks: number }>>([]);
  const [saves, setSaves] = useState<Array<{ period: string; count: number }>>([]);
  const [geo, setGeo] = useState<Array<{ city: string | null; state: string | null; count: number }>>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const selectedMonth = new Date().toISOString().slice(0, 7);
  const [savedPeriod, setSavedPeriod] = useState<"day" | "week">("day");
  const [selectedGeoJobId, setSelectedGeoJobId] = useState<string>("all");
  const selectedMonthStart = `${selectedMonth}-01`;
  const monthWindowLabel = formatMonthYearUtc(selectedMonth);
  const savesTotal = saves.reduce((sum, point) => sum + point.count, 0);
  const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
  const getJobLabel = (jobId: string | number) => {
    const id = String(jobId);
    const label = (jobNameById[id] ?? "").trim();
    const safeId = id.length > 10 ? `${id.slice(0, 10)}...` : id;
    if (!label) return `Job #${safeId}`;
    return label.length > 20 ? `${label.slice(0, 20)}...` : label;
  };
  const toPostingChartRows = (items: Array<{ job_id: string; applications: number }>) => {
    const counts = new Map<string, number>();
    return items.map((item) => {
      const jobId = String(item.job_id ?? "");
      const resolvedTitle = (jobNameById[jobId] ?? "").trim();
      const fallbackTitle = `Job #${jobId.length > 10 ? `${jobId.slice(0, 10)}...` : jobId}`;
      const baseTitle = resolvedTitle || fallbackTitle;
      const normalized = normalizeTitle(baseTitle);
      const seen = (counts.get(normalized) ?? 0) + 1;
      counts.set(normalized, seen);
      const duplicateSuffix = seen > 1 ? ` (${seen})` : "";
      const uniqueTitle = `${baseTitle}${duplicateSuffix}`;
      return {
        ...item,
        fullTitle: uniqueTitle,
        axisLabel: uniqueTitle.length > 26 ? `${uniqueTitle.slice(0, 26)}...` : uniqueTitle
      };
    });
  };
  const formatXAxisTick = (value: string | number) => {
    const label = getJobLabel(value);
    return label.length > 14 ? `${label.slice(0, 14)}...` : label;
  };
  const sectionLabelClass = "px-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary";
  const topChartRows = useMemo(() => toPostingChartRows(topJobs), [topJobs, jobNameById]);
  const lowChartRows = useMemo(() => toPostingChartRows(lowTraction), [lowTraction, jobNameById]);

  useEffect(() => {
    if (!recruiterId) {
      setLoading(false);
      return;
    }
    if (!bootstrapped) {
      setLoading(true);
    }
    void Promise.all([
      getTopJobs(selectedMonthStart, recruiterId),
      getLowTractionJobs(selectedMonthStart, recruiterId),
      getJobClicks(selectedMonthStart, recruiterId),
      getSavedJobsTrend(savedPeriod, selectedMonthStart, recruiterId),
      getGeoDistribution(selectedMonthStart, recruiterId, selectedGeoJobId === "all" ? undefined : selectedGeoJobId),
      getRecruiterDashboard(recruiterId)
    ])
      .then(async ([top, low, clickData, savesData, geoData, dashboard]) => {
        const recruiterJobs = await getAllJobsByRecruiter(recruiterId);
        setActiveJobsCount(recruiterJobs.filter((job) => (job.status ?? "open") === "open").length);
        setJobNameById(
          Object.fromEntries(
            recruiterJobs
              .filter((job) => job.job_id && job.title)
              .map((job) => [String(job.job_id), job.title])
          )
        );
        let scopedTop = top.filter((job) => job.job_id).slice(0, 10);
        let scopedLow = low.filter((job) => job.job_id).slice(0, 5);
        let applicantFallbackTotal = 0;

        const mongoTopUseless = !scopedTop.length || scopedTop.every((j) => (j.applications ?? 0) === 0);
        const mongoLowUseless = !scopedLow.length || scopedLow.every((j) => (j.applications ?? 0) === 0);
        const needApplicantRows = mongoTopUseless || mongoLowUseless || !dashboard.length;

        if (needApplicantRows) {
          const byApplicants = (
            await Promise.all(
              recruiterJobs.map(async (job) => {
                try {
                  const applications = await getApplicationsByJob(job.job_id);
                  return { job_id: String(job.job_id), applications: applications.total };
                } catch {
                  return { job_id: String(job.job_id), applications: job.applicants_count ?? 0 };
                }
              })
            )
          )
            .filter((job) => job.job_id)
            .sort((a, b) => b.applications - a.applications);
          applicantFallbackTotal = byApplicants.reduce((sum, job) => sum + job.applications, 0);
          if (mongoTopUseless) scopedTop = byApplicants.slice(0, 10);
          if (mongoLowUseless) scopedLow = [...byApplicants].sort((a, b) => a.applications - b.applications).slice(0, 5);
        }

        const recruiterJobIds = new Set(recruiterJobs.map((job) => String(job.job_id)));
        const scopedClicks = clickData.filter((entry) => recruiterJobIds.has(String(entry.job_id)));

        setTopJobs(scopedTop.filter((job) => String(job.job_id || "").trim().length > 0));
        setLowTraction(scopedLow.filter((job) => String(job.job_id || "").trim().length > 0));
        setClicks(scopedClicks.length ? scopedClicks : recruiterJobs.map((job) => ({ job_id: String(job.job_id), clicks: job.views_count ?? 0 })));
        setSaves(savesData);
        setGeo(geoData.slice(0, 8));
        const derivedStats = Object.fromEntries(dashboard.map((item) => [item.event_type, item.count]));
        if (!derivedStats["application.submitted"] && applicantFallbackTotal) {
          derivedStats["application.submitted"] = applicantFallbackTotal;
        }
        setStats(derivedStats);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load dashboard");
      })
      .finally(() => {
        setLoading(false);
        setBootstrapped(true);
      });
  }, [recruiterId, selectedMonthStart, savedPeriod, selectedGeoJobId, bootstrapped]);

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="linkedin-card border-[#d9dee3] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-text-secondary">Recruiter dashboard for {monthWindowLabel}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Active Jobs" value={activeJobsCount} subtitle="Open postings" icon={FileText} onClick={() => navigate("/recruiter/jobs?focus=active")} />
        <StatCard title="Applications Submitted" value={stats["application.submitted"] ?? 0} subtitle={`In ${monthWindowLabel}`} icon={Users} onClick={() => navigate("/recruiter/jobs?focus=applicants")} />
        <StatCard title="Saved Job Events" value={savesTotal} subtitle={`${savedPeriod === "day" ? "Daily" : "Weekly"} in ${monthWindowLabel}`} icon={CalendarDays} onClick={() => navigate("/recruiter/jobs?focus=new")} />
        <StatCard title="Status Updates" value={stats["application.statusChanged"] ?? 0} subtitle={`In ${monthWindowLabel}`} icon={Users} onClick={() => navigate("/recruiter/jobs?focus=pending")} />
      </div>
      <div className={sectionLabelClass}>Application Performance</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard className="h-full" title="Top job postings (up to 10)" action={<span className="text-xs text-text-secondary">Window: {monthWindowLabel}</span>}>
          <div className="h-72">
            {topJobs.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topChartRows} layout="vertical" margin={{ left: 12, right: 18, top: 6, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="axisLabel" width={220} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { fullTitle?: string } | undefined;
                      return `Job: ${row?.fullTitle ?? "Unknown"}`;
                    }}
                    formatter={(value) => [value, "Applications"]}
                  />
                  <Bar dataKey="applications" fill="#0a66c2">
                    <LabelList dataKey="applications" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No application events available yet." hint="New submissions will populate this chart automatically." />
            )}
          </div>
        </ChartCard>
        <ChartCard className="h-full" title="Lowest applicant jobs (up to 5)" action={<span className="text-xs text-text-secondary">Window: {monthWindowLabel}</span>}>
          <div className="h-72">
            {lowTraction.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lowChartRows} layout="vertical" margin={{ left: 12, right: 18, top: 6, bottom: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="axisLabel" width={220} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { fullTitle?: string } | undefined;
                      return `Job: ${row?.fullTitle ?? "Unknown"}`;
                    }}
                    formatter={(value) => [value, "Applications"]}
                  />
                  <Bar dataKey="applications" fill="#cc1016">
                    <LabelList dataKey="applications" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No low-traction jobs to show yet." hint="This appears once applications are distributed across jobs." />
            )}
          </div>
        </ChartCard>
      </div>
      <div className={sectionLabelClass}>Engagement Signals</div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard className="h-full" title="Clicks per posting" action={<span className="text-xs text-text-secondary">Window: {monthWindowLabel}</span>}>
          <div className="h-72">
            {clicks.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={clicks.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                  <XAxis dataKey="job_id" tickFormatter={formatXAxisTick} angle={-20} textAnchor="end" interval={0} height={64} />
                  <YAxis />
                  <Tooltip labelFormatter={(value) => `Job: ${getJobLabel(value)}`} formatter={(value) => [value, "Clicks"]} />
                  <Line type="monotone" dataKey="clicks" stroke="#0a66c2" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No click activity yet." hint="Track job views to populate engagement trends." />
            )}
          </div>
        </ChartCard>
        <ChartCard
          className="h-full"
          title="Saved jobs trend"
          action={
            <div className="flex items-center gap-2">
              <select
                className="linkedin-input h-8 min-w-[92px] px-2 text-xs"
                value={savedPeriod}
                onChange={(event) => setSavedPeriod(event.target.value as "day" | "week")}
                aria-label="Saved jobs trend granularity"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
              </select>
              <span className="text-xs text-text-secondary">Window: {monthWindowLabel}</span>
            </div>
          }
        >
          <div className="h-72">
            {saves.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={saves}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip labelFormatter={(value) => `Date: ${String(value)}`} formatter={(value) => [value, "Saved jobs"]} />
                  <Area type="monotone" dataKey="count" stroke="#0a66c2" fill="#e8f0f9" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No saved-jobs trend data yet." hint="Saved job activity for recruiter-owned jobs will appear here." />
            )}
          </div>
        </ChartCard>
      </div>
      <div className={sectionLabelClass}>Geo Breakdown</div>
      <ChartCard
        className="h-full"
        title="City-wise applications"
        action={
          <div className="flex items-center gap-2">
            <select
              className="linkedin-input h-8 min-w-[180px] px-2 text-xs"
              value={selectedGeoJobId}
              onChange={(event) => setSelectedGeoJobId(event.target.value)}
              aria-label="City-wise applications selected job"
            >
              <option value="all">All recruiter jobs</option>
              {Object.entries(jobNameById).map(([jobId, title]) => (
                <option key={jobId} value={jobId}>
                  {title}
                </option>
              ))}
            </select>
            <span className="text-xs text-text-secondary">{monthWindowLabel}</span>
          </div>
        }
      >
        <div className="h-80">
          {geo.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={geo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                <XAxis dataKey="city" />
                <YAxis />
                <Tooltip
                  labelFormatter={(value, payload) => {
                    const item = payload?.[0]?.payload as { city?: string | null; state?: string | null } | undefined;
                    return `City: ${item?.city || value}${item?.state ? `, ${item.state}` : ""}`;
                  }}
                  formatter={(value) => [value, "Applications"]}
                />
                <Bar dataKey="count" fill="#0a66c2" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No city-level application data yet." hint="Application events need city/state data for geo breakdown." />
          )}
        </div>
      </ChartCard>
    </section>
  );
}
