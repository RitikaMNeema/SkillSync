import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  Info,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Users
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  getGeoDistribution,
  getJobClicks,
  getLowTractionJobs,
  getRecruiterDashboard,
  getRecruiterProfileDashboard,
  getSavedJobsTrend,
  getTopJobs
} from "../../api/analytics";
import { getAllApplicationsByJob, getApplicationsByJob } from "../../api/applications";
import { getAllJobsByRecruiter } from "../../api/jobs";
import { authStore } from "../../context/AuthContext";
import { useAuthHydrated } from "../../hooks/useAuthHydrated";
import { ChartCard } from "../../components/analytics/ChartCard";
import { CardSkeleton } from "../../components/ui/Skeleton";
import type { Application } from "../../types/application";
import type { Job } from "../../types/job";
import { cn } from "../../utils/cn";

/** Reference spec primary */
const R_PRIMARY = "#0066FF";
const R_SUCCESS = "#22C55E";
const R_MUTED = "#6b7280";
const R_CARD = "#ffffff";
const R_PAGE_BG = "#F9FAFB";

/** Align label with `YYYY-MM` / API month string — avoids local TZ showing the wrong month for `YYYY-MM-01`. */
function formatMonthYearUtc(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Inclusive start, exclusive end (ms) — aligned with analytics `_month_window` (UTC). */
function monthUtcMsBounds(yearMonth: string): { start: number; end: number } | null {
  const [y, m] = yearMonth.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || m < 1 || m > 12) return null;
  return {
    start: Date.UTC(y, m - 1, 1, 0, 0, 0, 0),
    end: Date.UTC(y, m, 1, 0, 0, 0, 0)
  };
}

function filterApplicationsInUtcMonth(apps: Application[], yearMonth: string): Application[] {
  const bounds = monthUtcMsBounds(yearMonth);
  if (!bounds) return apps;
  return apps.filter((app) => {
    const t = new Date(app.application_datetime).getTime();
    if (!Number.isFinite(t)) return false;
    return t >= bounds.start && t < bounds.end;
  });
}

function EmptyChart({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] px-4 text-center">
      <BarChart3 className="h-5 w-5 text-[#9ca3af]" />
      <p className="text-sm font-medium text-[#4b5563]">{message}</p>
      {hint ? <p className="text-xs text-[#9ca3af]">{hint}</p> : null}
    </div>
  );
}

type PipelineBuckets = {
  submitted: number;
  reviewing: number;
  interview: number;
  offer: number;
  hired: number;
  rejected: number;
};

/** Rolling last 7 days vs prior 7 days, using each application's `application_datetime`. */
function buildApplicationsWeekTrend(apps: Application[]): { text: string; up: boolean } | null {
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const lastWeekStart = now - weekMs;
  const prevWeekStart = now - 2 * weekMs;
  let lastWeek = 0;
  let prevWeek = 0;
  for (const app of apps) {
    const t = new Date(app.application_datetime).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= lastWeekStart && t <= now) lastWeek++;
    else if (t >= prevWeekStart && t < lastWeekStart) prevWeek++;
  }
  if (lastWeek === 0 && prevWeek === 0) return null;
  const delta = lastWeek - prevWeek;
  if (delta > 0) return { text: `↑ ${delta} vs prior week`, up: true };
  if (delta < 0) return { text: `▼ ${Math.abs(delta)} vs prior week`, up: false };
  if (lastWeek > 0) return { text: `${lastWeek} this week`, up: true };
  return null;
}

async function aggregateApplicationsFromJobs(
  jobs: Job[],
  yearMonth: string,
  includeWeekTrend: boolean
): Promise<{
  pipeline: PipelineBuckets;
  applicationsWeekTrend: { text: string; up: boolean } | null;
  applicationsInMonthTotal: number;
  applicationsPerJobInMonth: Array<{ job_id: string; applications: number }>;
}> {
  if (!jobs.length) {
    return {
      pipeline: { submitted: 0, reviewing: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
      applicationsWeekTrend: null,
      applicationsInMonthTotal: 0,
      applicationsPerJobInMonth: []
    };
  }
  const results = await Promise.all(jobs.map((job) => getAllApplicationsByJob(job.job_id)));
  const buckets: PipelineBuckets = { submitted: 0, reviewing: 0, interview: 0, offer: 0, hired: 0, rejected: 0 };
  const allAppsForTrend: Application[] = [];
  const applicationsPerJobInMonth: Array<{ job_id: string; applications: number }> = [];

  for (let i = 0; i < results.length; i++) {
    const job = jobs[i];
    const jobId = String(job.job_id);
    const { applications } = results[i];
    allAppsForTrend.push(...applications);
    const inMonth = filterApplicationsInUtcMonth(applications, yearMonth);
    applicationsPerJobInMonth.push({ job_id: jobId, applications: inMonth.length });
    for (const app of inMonth) {
      switch (app.status) {
        case "submitted":
          buckets.submitted++;
          break;
        case "reviewing":
          buckets.reviewing++;
          break;
        case "interview":
          buckets.interview++;
          break;
        case "offer":
          buckets.offer++;
          break;
        case "hired":
          buckets.hired++;
          break;
        case "rejected":
          buckets.rejected++;
          break;
        default:
          break;
      }
    }
  }

  const applicationsInMonthTotal = applicationsPerJobInMonth.reduce((s, r) => s + r.applications, 0);

  return {
    pipeline: buckets,
    applicationsWeekTrend: includeWeekTrend ? buildApplicationsWeekTrend(allAppsForTrend) : null,
    applicationsInMonthTotal,
    applicationsPerJobInMonth
  };
}

export function RecruiterDashboardPage() {
  const navigate = useNavigate();
  const recruiterId = authStore((state) => state.userId);
  const authHydrated = useAuthHydrated();
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [topJobs, setTopJobs] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [lowTraction, setLowTraction] = useState<Array<{ job_id: string; applications: number }>>([]);
  const [jobNameById, setJobNameById] = useState<Record<string, string>>({});
  const [recruiterJobs, setRecruiterJobs] = useState<Job[]>([]);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [clicks, setClicks] = useState<Array<{ job_id: string; clicks: number }>>([]);
  const [saves, setSaves] = useState<Array<{ period: string; count: number }>>([]);
  const [geo, setGeo] = useState<Array<{ city: string | null; state: string | null; count: number }>>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [pipeline, setPipeline] = useState<PipelineBuckets>({
    submitted: 0,
    reviewing: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0
  });
  /** Real WoW trend from application timestamps (set with pipeline). */
  const [applicationsWeekTrend, setApplicationsWeekTrend] = useState<{ text: string; up: boolean } | null>(null);
  const [messagesSent30d, setMessagesSent30d] = useState(0);
  /** Reporting window: current calendar month (no UI picker). */
  const selectedMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [savedPeriod, setSavedPeriod] = useState<"day" | "week">("day");
  const [selectedGeoJobId, setSelectedGeoJobId] = useState<string>("all");
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const selectedMonthStart = `${selectedMonth}-01`;
  const monthWindowLabel = formatMonthYearUtc(selectedMonth);
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
  const verticalBarsMargin = { left: 8, right: 28, top: 12, bottom: 8 };
  const verticalBarsYAxisWidth = 160;
  const topChartRows = useMemo(() => toPostingChartRows(topJobs), [topJobs, jobNameById]);

  const jobViewsTotal = useMemo(() => clicks.reduce((sum, row) => sum + (row.clicks ?? 0), 0), [clicks]);

  /** Submitted → Reviewing → Offer → Hired → Rejected; interview counts still feed conversion below. Data: `getAllApplicationsByJob`, selected month. */
  const pipelineSegments = useMemo(() => {
    const rows = [
      { key: "submitted" as const, label: "Submitted", count: pipeline.submitted, bg: "bg-[#0066FF]", text: "text-white" },
      { key: "reviewing" as const, label: "Reviewing", count: pipeline.reviewing, bg: "bg-[#dbeafe]", text: "text-[#111827]" },
      { key: "offer" as const, label: "Offer", count: pipeline.offer, bg: "bg-[#ffedd5]", text: "text-[#111827]" },
      { key: "hired" as const, label: "Hired", count: pipeline.hired, bg: "bg-[#dcfce7]", text: "text-[#14532d]" },
      { key: "rejected" as const, label: "Rejected", count: pipeline.rejected, bg: "bg-[#fee2e2]", text: "text-[#991b1b]" }
    ];
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { rows, total };
  }, [pipeline]);

  /** Share of submitted apps that reached interview, offer, or hired (excludes rejected). */
  const conversionRate =
    pipeline.submitted > 0
      ? (((pipeline.offer + pipeline.interview + pipeline.hired) / pipeline.submitted) * 100).toFixed(1)
      : null;

  const recentJobsRows = useMemo(() => {
    return [...recruiterJobs]
      .sort((a, b) => {
        const tb = b.posted_datetime ? new Date(b.posted_datetime).getTime() : 0;
        const ta = a.posted_datetime ? new Date(a.posted_datetime).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 5);
  }, [recruiterJobs]);

  const activeJobsTrendLabel = useMemo(() => {
    if (!recruiterJobs.length) return null;
    const weekMs = 7 * 86400000;
    const now = Date.now();
    const openedThisWeek = recruiterJobs.filter((j) => {
      if (!j.posted_datetime) return false;
      return now - new Date(j.posted_datetime).getTime() <= weekMs;
    }).length;
    if (openedThisWeek <= 0) return null;
    return { text: `↑ ${openedThisWeek} this week`, up: true };
  }, [recruiterJobs]);

  const firstOpenJob = useMemo(
    () => recruiterJobs.find((j) => (j.status ?? "open") === "open") ?? recruiterJobs[0],
    [recruiterJobs]
  );
  const firstJobId = firstOpenJob?.job_id;

  useEffect(() => {
    if (!authHydrated) return;
    if (!recruiterId) {
      setLoading(false);
      return;
    }
    if (!bootstrapped) {
      setLoading(true);
    }
    const selectedYm = selectedMonthStart.slice(0, 7);
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const includeWeekTrend = selectedYm === currentYm;

    void Promise.allSettled([
      getTopJobs(selectedMonthStart, recruiterId),
      getLowTractionJobs(selectedMonthStart, recruiterId),
      getJobClicks(selectedMonthStart, recruiterId),
      getSavedJobsTrend(savedPeriod, selectedMonthStart, recruiterId),
      getGeoDistribution(selectedMonthStart, recruiterId, selectedGeoJobId === "all" ? undefined : selectedGeoJobId),
      getRecruiterDashboard(recruiterId, selectedMonthStart),
      getRecruiterProfileDashboard(recruiterId).catch(() => null)
    ])
      .then(async ([topRes, lowRes, clicksRes, savesRes, geoRes, dashboardRes, profileDashRes]) => {
        const nextErrors: Record<string, string> = {};
        if (topRes.status !== "fulfilled") nextErrors.top = "Top postings unavailable";
        if (lowRes.status !== "fulfilled") nextErrors.low = "Low traction data unavailable";
        if (clicksRes.status !== "fulfilled") nextErrors.clicks = "Click metrics unavailable";
        if (savesRes.status !== "fulfilled") nextErrors.saves = "Saved trend unavailable";
        if (geoRes.status !== "fulfilled") nextErrors.geo = "Geo breakdown unavailable";
        if (dashboardRes.status !== "fulfilled") nextErrors.summary = "Summary metrics unavailable";
        setCardErrors(nextErrors);

        const top = topRes.status === "fulfilled" ? topRes.value : [];
        const low = lowRes.status === "fulfilled" ? lowRes.value : [];
        const clickData = clicksRes.status === "fulfilled" ? clicksRes.value : [];
        const savesData = savesRes.status === "fulfilled" ? savesRes.value : [];
        const geoData = geoRes.status === "fulfilled" ? geoRes.value : [];
        const dashboardMetrics = dashboardRes.status === "fulfilled" ? dashboardRes.value : [];

        if (profileDashRes.status === "fulfilled" && profileDashRes.value) {
          setMessagesSent30d(profileDashRes.value.messages_sent_30d ?? 0);
        } else {
          setMessagesSent30d(0);
        }

        const recruiterJobsLocal = await getAllJobsByRecruiter(recruiterId);
        setRecruiterJobs(recruiterJobsLocal);
        setActiveJobsCount(recruiterJobsLocal.filter((job) => (job.status ?? "open") === "open").length);
        setJobNameById(
          Object.fromEntries(
            recruiterJobsLocal.filter((job) => job.job_id && job.title).map((job) => [String(job.job_id), job.title])
          )
        );

        let agg: Awaited<ReturnType<typeof aggregateApplicationsFromJobs>>;
        try {
          agg = await aggregateApplicationsFromJobs(recruiterJobsLocal, selectedYm, includeWeekTrend);
        } catch {
          agg = {
            pipeline: { submitted: 0, reviewing: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
            applicationsWeekTrend: null,
            applicationsInMonthTotal: 0,
            applicationsPerJobInMonth: []
          };
        }
        setPipeline(agg.pipeline);
        setApplicationsWeekTrend(agg.applicationsWeekTrend);

        let scopedTop = top.filter((job) => job.job_id).slice(0, 10);
        let scopedLow = low.filter((job) => job.job_id).slice(0, 5);

        const mongoTopUseless = !scopedTop.length || scopedTop.every((j) => (j.applications ?? 0) === 0);
        const mongoLowUseless = !scopedLow.length || scopedLow.every((j) => (j.applications ?? 0) === 0);
        const needApplicantRows = mongoTopUseless || mongoLowUseless || !dashboardMetrics.length;

        if (needApplicantRows) {
          let byApplicants = [...agg.applicationsPerJobInMonth]
            .filter((job) => job.job_id)
            .sort((a, b) => b.applications - a.applications);
          const monthHasRows = byApplicants.some((j) => j.applications > 0);
          if (!monthHasRows) {
            byApplicants = (
              await Promise.all(
                recruiterJobsLocal.map(async (job) => {
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
          }
          if (mongoTopUseless) scopedTop = byApplicants.slice(0, 10);
          if (mongoLowUseless) scopedLow = [...byApplicants].sort((a, b) => a.applications - b.applications).slice(0, 5);
        }

        const recruiterJobIds = new Set(recruiterJobsLocal.map((job) => String(job.job_id)));
        const scopedClicks = clickData.filter((entry) => recruiterJobIds.has(String(entry.job_id)));

        setTopJobs(scopedTop.filter((job) => String(job.job_id || "").trim().length > 0));
        setLowTraction(scopedLow.filter((job) => String(job.job_id || "").trim().length > 0));
        setClicks(
          scopedClicks.length ? scopedClicks : recruiterJobsLocal.map((job) => ({ job_id: String(job.job_id), clicks: job.views_count ?? 0 }))
        );
        setSaves(savesData);
        setGeo(geoData.slice(0, 8));
        const derivedStats = Object.fromEntries(dashboardMetrics.map((item) => [item.event_type, item.count]));
        if (!derivedStats["application.submitted"] && agg.applicationsInMonthTotal) {
          derivedStats["application.submitted"] = agg.applicationsInMonthTotal;
        }
        setStats(derivedStats);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load dashboard"))
      .finally(() => {
        setLoading(false);
        setBootstrapped(true);
      });
  }, [authHydrated, recruiterId, selectedMonthStart, savedPeriod, selectedGeoJobId]);

  if (loading || !authHydrated) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 pb-10 pt-6" style={{ backgroundColor: R_PAGE_BG }}>
        <CardSkeleton />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const applicationsSubmitted = stats["application.submitted"] ?? 0;

  return (
    <section className="mx-auto max-w-[1400px] space-y-8 px-4 pb-12 pt-6" style={{ backgroundColor: R_PAGE_BG }}>
      {/* Page header */}
      <div className="flex flex-col gap-5 border-b border-[#e5e7eb] pb-8 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight text-[#111827]">Recruiter dashboard</h1>
          <p className="mt-2 text-[0.9375rem] leading-snug" style={{ color: R_MUTED }}>
            Overview of your hiring activity and performance.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[320px] lg:items-end">
          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => navigate("/recruiter/jobs")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
              style={{ backgroundColor: R_PRIMARY }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Post a job
            </button>
            <button
              type="button"
              onClick={() =>
                firstJobId
                  ? navigate(`/recruiter/ai-matching?job_id=${firstJobId}`)
                  : navigate("/recruiter/ai-matching")
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border-2 bg-white px-4 text-sm font-semibold shadow-sm transition hover:bg-[#f8fafc]"
              style={{ borderColor: R_PRIMARY, color: R_PRIMARY }}
            >
              <Sparkles className="h-4 w-4" />
              Run AI matching
            </button>
          </div>
        </div>
      </div>

      {/* Top metric cards — reference: colored square icon, label gray-500, value bold, trend green */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate("/recruiter/jobs?focus=active")}
          className="rounded-[10px] border border-[#e5e7eb] p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:shadow-md"
          style={{ backgroundColor: R_CARD }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#eff6ff]">
            <BriefcaseBusiness className="h-5 w-5" style={{ color: R_PRIMARY }} />
          </span>
          <p className="mt-5 text-sm font-medium" style={{ color: R_MUTED }}>
            Active jobs
          </p>
          <p className="mt-2 text-[2rem] font-bold leading-none tabular-nums text-[#111827]">{activeJobsCount}</p>
          {activeJobsTrendLabel ? (
            <p className="mt-3 text-xs font-semibold" style={{ color: R_SUCCESS }}>
              {activeJobsTrendLabel.text}
            </p>
          ) : (
            <p className="mt-3 text-xs text-[#9ca3af]">Open postings</p>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/recruiter/jobs?focus=applicants")}
          className="rounded-[10px] border border-[#e5e7eb] p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:shadow-md"
          style={{ backgroundColor: R_CARD }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#ecfdf5]">
            <Users className="h-5 w-5" style={{ color: R_SUCCESS }} />
          </span>
          <p className="mt-5 text-sm font-medium" style={{ color: R_MUTED }}>
            Applications
          </p>
          <p className="mt-2 text-[2rem] font-bold leading-none tabular-nums text-[#111827]">{applicationsSubmitted}</p>
          {applicationsWeekTrend ? (
            <p className="mt-3 text-xs font-semibold" style={{ color: applicationsWeekTrend.up ? R_SUCCESS : "#dc2626" }}>
              {applicationsWeekTrend.text}
            </p>
          ) : (
            <p className="mt-3 text-xs text-[#9ca3af]">{monthWindowLabel}</p>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/recruiter/jobs?focus=new")}
          className="rounded-[10px] border border-[#e5e7eb] p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:shadow-md"
          style={{ backgroundColor: R_CARD }}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#e0f2fe]">
            <BriefcaseBusiness className="h-5 w-5 text-[#0284c7]" />
          </span>
          <p className="mt-5 text-sm font-medium" style={{ color: R_MUTED }}>
            Job post views
          </p>
          <p className="mt-2 text-[2rem] font-bold leading-none tabular-nums text-[#111827]">{jobViewsTotal}</p>
          <p className="mt-3 text-xs text-[#9ca3af]">Across your postings</p>
        </button>

        <div className="rounded-[10px] border border-[#e5e7eb] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ backgroundColor: R_CARD }}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#eef2ff]">
            <Send className="h-5 w-5 text-[#4f46e5]" />
          </span>
          <p className="mt-5 text-sm font-medium" style={{ color: R_MUTED }}>
            Messages sent
          </p>
          <p className="mt-2 text-[2rem] font-bold leading-none tabular-nums text-[#111827]">{messagesSent30d}</p>
          <p className="mt-3 text-xs text-[#9ca3af]">From your account</p>
        </div>
      </div>

      {/* Pipeline (~7 cols) + Recent activity (~5 cols) — reference proportions */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col rounded-[10px] border border-[#e5e7eb] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] lg:col-span-7" style={{ backgroundColor: R_CARD }}>
          <div className="mb-5 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#111827]">Applicant pipeline</h2>
            <span
              title={`Applicants who applied in ${monthWindowLabel}, by current status (from your applications data)`}
              className="text-[#cbd5e1]"
            >
              <Info className="h-[18px] w-[18px]" />
            </span>
          </div>
          {pipelineSegments.total > 0 ? (
            <>
              <div className="flex w-full overflow-hidden rounded-[8px] shadow-inner">
                {pipelineSegments.rows.map((seg) => (
                  <div
                    key={seg.key}
                    className={cn(
                      "flex min-h-[56px] min-w-0 flex-1 items-center justify-center px-1.5 py-3 text-center text-sm font-semibold sm:px-2",
                      seg.bg,
                      seg.text
                    )}
                  >
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide">{seg.label}</div>
                      <div className="mt-0.5 text-xl font-bold tabular-nums">{seg.count}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm text-[#6b7280]">
                Total conversion rate:{" "}
                <span className="font-semibold" style={{ color: R_SUCCESS }}>
                  {conversionRate != null ? `${conversionRate}%` : "—"}
                </span>
              </p>
            </>
          ) : (
            <EmptyChart message="No applications in pipeline yet." hint="Applicants will appear here as they progress." />
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-[10px] border border-[#e5e7eb] shadow-[0_1px_2px_rgba(0,0,0,0.05)] lg:col-span-5" style={{ backgroundColor: R_CARD }}>
          <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
            <h2 className="text-base font-semibold text-[#111827]">Recent job activity</h2>
            <button
              type="button"
              className="text-sm font-semibold hover:underline"
              style={{ color: R_PRIMARY }}
              onClick={() => navigate("/recruiter/jobs")}
            >
              View all jobs
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#f3f4f6] text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
                  <th className="px-5 py-3 font-semibold">Job title</th>
                  <th className="px-3 py-3 font-semibold">Applicants</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Last updated</th>
                  <th className="w-10 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody className="text-[#374151]">
                {recentJobsRows.length ? (
                  recentJobsRows.map((job) => {
                    const isActive = (job.status ?? "open") === "open";
                    const applicants = job.applicants_count ?? 0;
                    const statusLabel = isActive ? "Active" : "Closed";
                    const statusClass = isActive ? "bg-[#ecfdf5] text-[#15803d]" : "bg-[#fee2e2] text-[#b91c1c]";
                    return (
                    <tr key={job.job_id} className="border-b border-[#f9fafb] last:border-0">
                      <td className="max-w-[160px] truncate px-5 py-3.5 font-medium text-[#111827]" title={job.title}>
                        {job.title}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-[#374151]">{applicants}</td>
                      <td className="px-3 py-3.5">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", statusClass)}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-[#6b7280]">
                        {job.posted_datetime
                          ? new Date(job.posted_datetime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-2 py-3.5 text-[#cbd5e1]">
                        <button type="button" aria-label="Job actions" className="rounded p-1 hover:bg-[#f3f4f6]">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-[#9ca3af]">
                      No jobs yet. Post a role to see activity here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Charts row — three equal columns (reference: horizontal bars | line + Daily | vertical bars) */}
      <div className="grid gap-5 lg:grid-cols-3">
        <ChartCard
          className="h-full rounded-[10px] border-[#e5e7eb] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          titleClassName="text-base font-semibold text-[#111827]"
          title="Top jobs by applications"
          action={<span className="text-xs text-[#9ca3af]">{monthWindowLabel}</span>}
        >
          <div className="h-[280px]">
            {topJobs.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topChartRows} layout="vertical" margin={verticalBarsMargin} barSize={22} barCategoryGap={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="axisLabel"
                    width={verticalBarsYAxisWidth}
                    tick={{ fontSize: 11, fill: "#374151" }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as { fullTitle?: string } | undefined;
                      return `Job: ${row?.fullTitle ?? "Unknown"}`;
                    }}
                    formatter={(value) => [value, "Applications"]}
                  />
                  <Bar dataKey="applications" fill={R_PRIMARY} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="applications" position="right" fill="#6b7280" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message={cardErrors.top || "No application data yet."} hint={`Window: ${monthWindowLabel}`} />
            )}
          </div>
        </ChartCard>

        <ChartCard
          className="h-full rounded-[10px] border-[#e5e7eb] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          titleClassName="text-base font-semibold text-[#111827]"
          title="Applications over time"
          action={
            <select
              className="rounded-[8px] border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#374151]"
              value={savedPeriod}
              onChange={(event) => setSavedPeriod(event.target.value as "day" | "week")}
              aria-label="Applications trend granularity"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
            </select>
          }
        >
          <div className="h-[280px]">
            {saves.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={saves} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    labelFormatter={(value) => String(value)}
                    formatter={(value) => [value, "Applications"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={R_PRIMARY}
                    strokeWidth={2}
                    dot={{ r: 4, fill: R_PRIMARY, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                message={cardErrors.saves || "No trend data for this period."}
                hint={`Saved-job signals · ${savedPeriod} · ${monthWindowLabel}`}
              />
            )}
          </div>
        </ChartCard>

        <ChartCard
          className="h-full rounded-[10px] border-[#e5e7eb] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
          titleClassName="text-base font-semibold text-[#111827]"
          title="Applications by location"
          action={
            <select
              className="max-w-[170px] rounded-[8px] border border-[#e5e7eb] bg-white px-2 py-1.5 text-xs font-medium text-[#374151]"
              value={selectedGeoJobId}
              onChange={(event) => setSelectedGeoJobId(event.target.value)}
              aria-label="Filter by job"
            >
              <option value="all">All jobs</option>
              {Object.entries(jobNameById).map(([jobId, title]) => (
                <option key={jobId} value={jobId}>
                  {title.length > 28 ? `${title.slice(0, 28)}…` : title}
                </option>
              ))}
            </select>
          }
        >
          <div className="h-[280px]">
            {geo.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={geo.map((g) => ({ ...g, label: [g.city, g.state].filter(Boolean).join(", ") || "Unknown" }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} interval={0} angle={-20} textAnchor="end" height={54} />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
                    formatter={(value) => [value, "Applications"]}
                  />
                  <Bar dataKey="count" fill={R_PRIMARY} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" fill="#374151" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                message={cardErrors.geo || "No location data yet."}
                hint={selectedGeoJobId === "all" ? monthWindowLabel : `${monthWindowLabel} · ${getJobLabel(selectedGeoJobId)}`}
              />
            )}
          </div>
        </ChartCard>
      </div>

      {/* Bottom row — AI assistant, AI activity, suggested actions */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[10px] border border-[#ede9fe] bg-gradient-to-br from-[#faf5ff] to-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#ede9fe]">
              <Sparkles className="h-5 w-5 text-[#7c3aed]" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c3aed]">Beta</p>
              <h3 className="mt-1 text-base font-semibold text-[#111827]">AI Hiring Assistant</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                Shortlist candidates against your posting using the built-in matching flow.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#7c3aed] hover:underline"
                onClick={() =>
                  firstJobId
                    ? navigate(`/recruiter/ai-matching?job_id=${firstJobId}`)
                    : navigate("/recruiter/ai-matching")
                }
              >
                Run AI matching
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#e5e7eb] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ backgroundColor: R_CARD }}>
          <h3 className="text-base font-semibold text-[#111827]">Recent AI activity</h3>
          <ul className="mt-4 space-y-3 text-sm leading-snug text-[#374151]">
            <li className="flex gap-2.5">
              <span className="font-semibold" style={{ color: R_SUCCESS }}>
                ✓
              </span>
              <span>
                Matching ready for{" "}
                <span className="font-medium">
                  {firstJobId != null ? getJobLabel(String(firstJobId)) : "your open postings"}
                </span>
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold" style={{ color: R_SUCCESS }}>
                ✓
              </span>
              <span>Use “Run AI matching” or open applicants from a job to start</span>
            </li>
          </ul>
        </div>

        <div className="rounded-[10px] border border-[#e5e7eb] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" style={{ backgroundColor: R_CARD }}>
          <h3 className="text-base font-semibold text-[#111827]">Suggested actions</h3>
          <ul className="mt-4 space-y-3">
            <li>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold hover:underline"
                style={{ color: R_PRIMARY }}
                onClick={() => navigate("/recruiter/jobs?focus=applicants")}
              >
                Reach out to highly matched candidates
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
            <li>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold hover:underline"
                style={{ color: R_PRIMARY }}
                onClick={() => navigate("/recruiter/analytics/profile")}
              >
                View profile analytics
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
