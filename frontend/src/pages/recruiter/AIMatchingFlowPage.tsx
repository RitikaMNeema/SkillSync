import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronDown,
  Eye,
  Filter,
  Loader2,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  approveAgentWorkflow,
  getAgentStatus,
  getAICommandStatus,
  runMatchAndWait,
  startAgentWorkflow,
  type AIMatchResult,
  type CommandStatusResponse
} from "../../api/ai";
import { getAllApplicationsByJob, updateApplicationStatus } from "../../api/applications";
import { openThread, sendMessage } from "../../api/messages";
import { getRecruiter } from "../../api/recruiters";
import type { Application } from "../../types/application";
import { applicationStatusSkipsAiShortlist } from "../../utils/applicationStatus";
import { getAllJobsByRecruiter, getJob } from "../../api/jobs";
import { getMember } from "../../api/members";
import { authStore } from "../../context/AuthContext";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Avatar } from "../../components/ui/Avatar";
import type { Job } from "../../types/job";
import type { MemberProfile } from "../../types/member";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import {
  bucketCounts,
  bucketForScore,
  breakdownPercents,
  estimateExperienceYears,
  FlowIntent,
  formatMemberLocation,
  insightBulletsFromMatch,
  jobToPayload,
  mapWithConcurrency,
  matchScoreStyles,
  memberToCandidateProfile,
  MIN_OUTREACH_MATCH_SCORE,
  R_PRIMARY,
  extractOutreachMessageFromTrace,
  sanitizeOutreachDraft
} from "./aiMatchingUtils";

function describeNetworkFailure(
  error: unknown,
  serviceHint: string,
  options?: { includeAiHealthHint?: boolean }
): string {
  if (axios.isAxiosError(error) && !error.response) {
    const healthHint =
      options?.includeAiHealthHint && typeof window !== "undefined"
        ? ` In dev, check ${window.location.origin}/ai-service/ai/health in this browser.`
        : "";
    return `Cannot reach ${serviceHint}.${healthHint} From the repo: cd backend && docker compose up -d. If you use Vite, restart npm run dev after proxy changes.`;
  }
  return getApiErrorMessage(error);
}

const STEP_LABELS = [
  "Resume parsing",
  "Matching candidates",
  "Scoring & ranking",
  "Generating insights",
  "Preparing results"
] as const;

type UiPhase = "start" | "processing" | "results" | "detail";

type MatchRow = {
  member_id: number;
  application_id?: number;
  name: string;
  headline: string;
  avatar_url: string | null;
  location: string;
  experience_years: number;
  match: AIMatchResult;
  profile: MemberProfile | null;
  bucket: "top" | "good" | "possible" | "low";
};

type Disposition = "shortlisted" | "rejected" | null;
type OutreachUiStatus = "draft" | "pending_review" | "approved" | "edited" | "rejected" | null;

const INTENT_OPTIONS: { value: FlowIntent; label: string; description: string }[] = [
  {
    value: "job_match",
    label: "Find matching candidates for a job",
    description: "Rank applicants and members against one role using AI matching."
  },
  {
    value: "talent_pool",
    label: "Analyze talent pool",
    description: "High-level signals across your network (lightweight summary)."
  }
];

function minimalCandidate(member_id: number): import("../../api/ai").CandidateProfile {
  return {
    member_id,
    headline: "",
    summary: "",
    skills: [],
    experiences: [],
    location: "",
    education: []
  };
}

function stepStatusForIndex(activeIndex: number, stepIndex: number, failed: boolean): "pending" | "in_progress" | "completed" | "failed" {
  if (failed && stepIndex === activeIndex) return "failed";
  if (stepIndex < activeIndex) return "completed";
  if (stepIndex === activeIndex) return "in_progress";
  return "pending";
}

async function pollCommandUntilDone(commandId: string): Promise<CommandStatusResponse> {
  // 150 attempts × 1.2 s = ~3 minutes (covers slow AWS Ollama per-candidate).
  for (let i = 0; i < 150; i += 1) {
    const status = await getAICommandStatus(commandId);
    if (status.status === "completed") return status;
    if (status.status === "failed") throw new Error(status.error || "Command failed");
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for AI command");
}

async function pollTraceUntilReviewable(traceId: string) {
  // 120 attempts × 1.8 s = ~3.6 minutes (covers full outreach workflow on slow AWS).
  for (let i = 0; i < 120; i += 1) {
    const status = await getAgentStatus(traceId);
    if (
      status.status === "awaiting_approval" ||
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "rejected"
    ) {
      return status;
    }
    await new Promise((r) => setTimeout(r, 1800));
  }
  return getAgentStatus(traceId);
}

export function AIMatchingFlowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recruiterId = authStore((s) => s.userId);

  const [phase, setPhase] = useState<UiPhase>("start");
  const [intent, setIntent] = useState<FlowIntent>("job_match");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | "">("");
  const [jobDetail, setJobDetail] = useState<Job | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [taskId, setTaskId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [processingFailed, setProcessingFailed] = useState(false);
  const [processingNote, setProcessingNote] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedSeconds, setCompletedSeconds] = useState<number | null>(null);

  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  /** Set when matching completes with zero applicants (job modes only). */
  const [emptyMatchMessage, setEmptyMatchMessage] = useState<string | null>(null);
  const [talentInsights, setTalentInsights] = useState<string[]>([]);

  const [selectedRow, setSelectedRow] = useState<MatchRow | null>(null);
  const [sortKey, setSortKey] = useState<"score" | "name">("score");
  const [bucketFilter, setBucketFilter] = useState<"all" | "top" | "good" | "possible" | "low">("all");

  const [disposition, setDisposition] = useState<Record<number, Disposition>>({});
  const [outreachStatus, setOutreachStatus] = useState<Record<number, OutreachUiStatus>>({});

  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachTraceId, setOutreachTraceId] = useState<string | null>(null);
  const [outreachToName, setOutreachToName] = useState("");
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");
  const [outreachMemberId, setOutreachMemberId] = useState<number | null>(null);
  const [recruiterDisplayName, setRecruiterDisplayName] = useState<string | null>(null);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return jobs.find((j) => j.job_id === selectedJobId) ?? jobDetail;
  }, [jobs, selectedJobId, jobDetail]);

  useEffect(() => {
    if (!recruiterId) {
      setRecruiterDisplayName(null);
      return;
    }
    void getRecruiter(recruiterId)
      .then((r) => setRecruiterDisplayName(r.name?.trim() ?? null))
      .catch(() => setRecruiterDisplayName(null));
  }, [recruiterId]);

  useEffect(() => {
    if (!recruiterId) {
      setJobsLoading(false);
      return;
    }
    setJobsLoading(true);
    setJobsError(null);
    void getAllJobsByRecruiter(recruiterId)
      .then((list) => {
        setJobs(list.filter((j) => (j.status ?? "open") === "open"));
      })
      .catch((e: unknown) => {
        setJobsError(e instanceof Error ? e.message : "Could not load jobs");
      })
      .finally(() => setJobsLoading(false));
  }, [recruiterId]);

  const jobIdParam = searchParams.get("job_id");
  useEffect(() => {
    if (!jobIdParam) return;
    const id = Number(jobIdParam);
    if (!Number.isFinite(id)) return;
    setSelectedJobId(id);
    void getJob(id)
      .then(setJobDetail)
      .catch(() => setJobDetail(null));
  }, [jobIdParam]);

  const sortedFilteredRows = useMemo(() => {
    let rows = [...matchRows];
    if (bucketFilter !== "all") {
      rows = rows.filter((r) => r.bucket === bucketFilter);
    }
    rows.sort((a, b) => {
      if (sortKey === "score") return b.match.match_score - a.match.match_score;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [matchRows, bucketFilter, sortKey]);

  const summary = useMemo(() => bucketCounts(matchRows.map((r) => ({ bucket: r.bucket }))), [matchRows]);

  const runTalentPoolSummary = useCallback(async () => {
    setProcessingFailed(false);
    setProcessingNote(null);
    const t0 = Date.now();
    setStartedAt(t0);
    setTaskId(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9));
    setMatchRows([]);
    setTalentInsights([]);
    setPhase("processing");
    setActiveStepIndex(0);
    const steps = [800, 900, 700, 600, 500];
    for (let i = 0; i < steps.length; i++) {
      setActiveStepIndex(i);
      await new Promise((r) => setTimeout(r, steps[i]));
    }
    setTalentInsights([
      "Strong concentration of full-stack and React skills among recent applicants.",
      "Remote-friendly candidates align with your hybrid postings.",
      "Consider highlighting leadership keywords to attract senior profiles.",
      "Geographic diversity increased vs. last month (placeholder insight)."
    ]);
    setCompletedSeconds(Math.max(1, Math.round((Date.now() - t0) / 1000)));
    setPhase("results");
    setActiveStepIndex(STEP_LABELS.length);
  }, []);

  const runMatchingPipeline = useCallback(async () => {
    if (!recruiterId || !selectedJobId) {
      toast.error("Select a job first.");
      return;
    }
    const job = jobs.find((j) => j.job_id === selectedJobId) ?? jobDetail;
    if (!job?.job_id) {
      toast.error("Job not available.");
      return;
    }

    if (intent === "talent_pool") {
      await runTalentPoolSummary();
      return;
    }

    setProcessingFailed(false);
    setProcessingNote(null);
    const t0 = Date.now();
    setStartedAt(t0);
    setTaskId(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 9));
    setPhase("processing");
    setActiveStepIndex(0);
    setMatchRows([]);
    setEmptyMatchMessage(null);

    try {
      setActiveStepIndex(0);
      let applications: Application[] = [];
      try {
        const res = await getAllApplicationsByJob(job.job_id);
        applications = res.applications;
      } catch (appErr) {
        console.error(appErr);
        setProcessingFailed(true);
        toast.error(
          describeNetworkFailure(appErr, "the application service (applications API, typically port 3006)")
        );
        setPhase("start");
        return;
      }

      if (applications.length === 0) {
        setMatchRows([]);
        setEmptyMatchMessage(
          "This job has no applicants yet. Share the posting or wait for candidates to apply, then run AI matching again."
        );
        setCompletedSeconds(Math.max(1, Math.round((Date.now() - t0) / 1000)));
        setPhase("results");
        setActiveStepIndex(STEP_LABELS.length);
        toast.error("No candidates to match for this job.");
        return;
      }

      const matchableApplications = applications.filter((a) => !applicationStatusSkipsAiShortlist(a.status));
      if (matchableApplications.length === 0) {
        setMatchRows([]);
        setEmptyMatchMessage(
          "Every application for this job is rejected, withdrawn, or hired — there are no active applicants to AI-match."
        );
        setCompletedSeconds(Math.max(1, Math.round((Date.now() - t0) / 1000)));
        setPhase("results");
        setActiveStepIndex(STEP_LABELS.length);
        toast.error("No active applicants to match.");
        return;
      }

      const memberIds = [...new Set(matchableApplications.map((a) => a.member_id))];

      const loaded = await mapWithConcurrency(memberIds, 5, async (mid) => {
        try {
          const p = await getMember(mid);
          return { mid, profile: p };
        } catch {
          return { mid, profile: null };
        }
      });
      const profileByMember = new Map(loaded.map((x) => [x.mid, x.profile]));

      setActiveStepIndex(1);
      const jobPayload = jobToPayload(job);

      let done = 0;
      const total = matchableApplications.length || 1;

      const built = await mapWithConcurrency(matchableApplications, 3, async (app) => {
        const profile = profileByMember.get(app.member_id) ?? null;
        const candidate = profile ? memberToCandidateProfile(profile) : minimalCandidate(app.member_id);
        const match = await runMatchAndWait({ candidate, job: jobPayload });
        done += 1;
        setProcessingNote(`Matched ${done} / ${total} applicants`);
        const bucket = bucketForScore(match.match_score);
        const displayName = profile
          ? `${profile.first_name} ${profile.last_name}`.trim()
          : `Candidate #${app.member_id}`;
        const row: MatchRow = {
          member_id: app.member_id,
          application_id: app.application_id,
          name: displayName,
          headline: profile?.headline ?? "—",
          avatar_url: profile?.profile_photo_url ?? null,
          location: profile ? formatMemberLocation(profile) : "—",
          experience_years: profile ? estimateExperienceYears(profile) : 0,
          match,
          profile,
          bucket
        };
        return row;
      });

      setActiveStepIndex(2);
      const sorted = [...built].sort((a, b) => b.match.match_score - a.match.match_score);
      await new Promise((r) => setTimeout(r, 400));
      setActiveStepIndex(3);
      await new Promise((r) => setTimeout(r, 350));
      setActiveStepIndex(4);
      setMatchRows(sorted);
      setEmptyMatchMessage(null);
      setCompletedSeconds(Math.max(1, Math.round((Date.now() - t0) / 1000)));
      setPhase("results");
      setActiveStepIndex(STEP_LABELS.length);
      if (sorted.length === 0) {
        setEmptyMatchMessage(
          "Matching finished, but no candidate rows were produced. Try again or contact support if this persists."
        );
        toast.error("No candidates could be matched.");
      } else {
        toast.success("Matching complete");
      }
    } catch (e) {
      console.error(e);
      setProcessingFailed(true);
      toast.error(
        describeNetworkFailure(e, "the AI service (port 3010, proxied as /ai-service in dev)", {
          includeAiHealthHint: true
        })
      );
      setPhase("start");
    }
  }, [recruiterId, selectedJobId, jobs, jobDetail, intent, runTalentPoolSummary]);

  const openOutreachForRow = useCallback(
    async (row: MatchRow) => {
      if (!recruiterId || !selectedJob) return;
      if (row.match.match_score < MIN_OUTREACH_MATCH_SCORE) {
        toast.error(
          `Outreach is only available when match score is ${MIN_OUTREACH_MATCH_SCORE}% or higher (this candidate is ${Math.round(row.match.match_score)}%).`
        );
        return;
      }
      setOutreachMemberId(row.member_id);
      setOutreachToName(row.name);
      setOutreachSubject(`Your profile — ${selectedJob.title}`);
      setOutreachBody("");
      setOutreachTraceId(null);
      setOutreachOpen(true);
      setOutreachLoading(true);
      try {
        const candidate = row.profile ? memberToCandidateProfile(row.profile) : minimalCandidate(row.member_id);
        const jobPayload = jobToPayload(selectedJob);
        const queued = await startAgentWorkflow({
          recruiter_id: recruiterId,
          candidate,
          job: jobPayload,
          workflow_type: "shortlist_outreach",
          require_human_approval: true,
          candidate_display_name: row.name,
          recruiter_display_name: recruiterDisplayName ?? undefined,
          match_result: row.match
        });
        const cmdStatus = await pollCommandUntilDone(queued.command_id);
        const traceId = (cmdStatus.result as { trace_id?: string } | undefined)?.trace_id;
        if (!traceId) {
          throw new Error("No trace_id returned from AI workflow");
        }
        setOutreachTraceId(traceId);
        const final = await pollTraceUntilReviewable(traceId);
        if (final.status === "failed" || final.status === "rejected") {
          const errMsg =
            typeof (final.final_result as { error?: string })?.error === "string"
              ? (final.final_result as { error: string }).error
              : `AI workflow ended as ${final.status}`;
          toast.error(errMsg);
          setOutreachOpen(false);
          return;
        }
        const skipped = (final.final_result as { outreach_skipped?: boolean })?.outreach_skipped;
        if (skipped) {
          const reason =
            (final.final_result as { outreach_skip_reason?: string })?.outreach_skip_reason ??
            "Outreach was not generated for this candidate.";
          toast.error(reason);
          setOutreachOpen(false);
          return;
        }
        const draftRaw = extractOutreachMessageFromTrace(final);
        const recName = (recruiterDisplayName ?? "").trim() || "Recruiting Team";
        const draft = sanitizeOutreachDraft(String(draftRaw ?? ""), row.name, recName);
        if (!draft.trim()) {
          toast.error(
            "The AI service returned an empty outreach draft. Check Ollama is running and try again, or retry in a few seconds."
          );
          setOutreachOpen(false);
          return;
        }
        setOutreachBody(draft);
        setOutreachStatus((prev) => ({ ...prev, [row.member_id]: "pending_review" }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not generate outreach");
        setOutreachOpen(false);
      } finally {
        setOutreachLoading(false);
      }
    },
    [recruiterId, selectedJob, recruiterDisplayName]
  );

  const handleApproval = useCallback(
    async (action: "approve" | "edit" | "reject") => {
      if (!outreachTraceId || outreachMemberId == null) return;
      try {
        setOutreachLoading(true);
        const queued = await approveAgentWorkflow({
          trace_id: outreachTraceId,
          action,
          edited_message: action === "edit" ? outreachBody : null,
          reviewer_id: recruiterId ?? null
        });
        await pollCommandUntilDone(queued.command_id);

        if ((action === "approve" || action === "edit") && recruiterId) {
          try {
            const thread = await openThread([recruiterId, outreachMemberId]);
            const messageText = outreachSubject
              ? `Subject: ${outreachSubject}\n\n${outreachBody}`
              : outreachBody;
            await sendMessage(thread.thread_id, recruiterId, messageText);
          } catch (deliveryErr) {
            console.error("Failed to deliver outreach to inbox", deliveryErr);
            toast.error(
              deliveryErr instanceof Error
                ? `Approved, but could not deliver to inbox: ${deliveryErr.message}`
                : "Approved, but could not deliver to inbox."
            );
          }
        }

        setOutreachStatus((prev) => ({
          ...prev,
          [outreachMemberId]:
            action === "approve" ? "approved" : action === "edit" ? "edited" : "rejected"
        }));
        setOutreachOpen(false);
        toast.success(
          action === "reject"
            ? "Outreach rejected."
            : "Message sent to candidate's inbox."
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Approval failed");
      } finally {
        setOutreachLoading(false);
      }
    },
    [outreachTraceId, outreachMemberId, outreachBody, outreachSubject, recruiterId]
  );

  const renderStepTracker = () => (
    <div className="space-y-4">
      {STEP_LABELS.map((label, idx) => {
        const st = stepStatusForIndex(activeStepIndex, idx, processingFailed);
        return (
          <div key={label} className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
              {st === "completed" ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
                  ✓
                </span>
              ) : st === "in_progress" ? (
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#0A66C2] opacity-25" />
                  <span className="relative inline-flex h-5 w-5 rounded-full bg-[#0A66C2] ring-2 ring-white" />
                </span>
              ) : st === "failed" ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                  !
                </span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#e5e7eb] bg-white text-xs text-[#9ca3af]">
                  ○
                </span>
              )}
            </div>
            <div>
              <p className={`font-semibold ${st === "in_progress" ? "text-[#0A66C2]" : "text-[#111827]"}`}>{label}</p>
              {st === "in_progress" && processingNote ? (
                <p className="text-sm text-[#6b7280]">{processingNote}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (phase === "start") {
    return (
      <div className="mx-auto min-h-[calc(100vh-120px)] max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef2ff]">
              <Bot className="h-8 w-8 text-[#6366f1]" />
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <h1 className="text-2xl font-bold text-[#111827]">AI Recruiter Assistant</h1>
              <Badge className="bg-[#ede9fe] text-[11px] font-semibold uppercase tracking-wide text-[#5b21b6]">
                Beta
              </Badge>
            </div>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#6b7280]">
              Run intelligent matching against your postings, review ranked candidates, and approve outreach before anything is sent.
            </p>
          </div>

          <fieldset className="mt-8 space-y-3">
            <legend className="sr-only">Matching mode</legend>
            {INTENT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition hover:bg-[#fafafa] ${
                  intent === opt.value ? "border-[#0A66C2] bg-[#f0f7ff]" : "border-[#e5e7eb]"
                }`}
              >
                <input
                  type="radio"
                  name="intent"
                  className="mt-1 h-4 w-4"
                  style={{ accentColor: R_PRIMARY }}
                  checked={intent === opt.value}
                  onChange={() => setIntent(opt.value)}
                />
                <span>
                  <span className="font-semibold text-[#111827]">{opt.label}</span>
                  <span className="mt-0.5 block text-sm text-[#6b7280]">{opt.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-8">
            <label className="block text-sm font-semibold text-[#374151]">Select a job</label>
            <div className="relative mt-2">
              <select
                className="w-full appearance-none rounded-xl border border-[#e5e7eb] bg-white py-3 pl-4 pr-10 text-sm font-medium text-[#111827] shadow-sm focus:border-[#0A66C2] focus:outline-none focus:ring-2 focus:ring-[#0A66C233]"
                value={selectedJobId === "" ? "" : String(selectedJobId)}
                onChange={(e) => setSelectedJobId(e.target.value ? Number(e.target.value) : "")}
                disabled={jobsLoading}
              >
                <option value="">{jobsLoading ? "Loading jobs…" : "Choose a job posting"}</option>
                {jobs.map((j) => (
                  <option key={j.job_id} value={j.job_id}>
                    {j.title} (ID: {j.job_id})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            </div>
            {jobsError ? <p className="mt-2 text-sm text-red-600">{jobsError}</p> : null}
            {!jobsLoading && !jobs.length ? (
              <p className="mt-2 text-sm text-[#6b7280]">No open jobs yet. Post a job first.</p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="primary"
            className="mt-8 w-full rounded-[10px] py-3 text-base"
            style={{ backgroundColor: R_PRIMARY, borderColor: R_PRIMARY }}
            disabled={!selectedJobId || jobsLoading}
            onClick={() => void runMatchingPipeline()}
          >
            <Sparkles className="h-4 w-4" />
            Start AI Matching
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "processing") {
    return (
      <div className="mx-auto min-h-[calc(100vh-120px)] max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-[#111827]">AI Matching in Progress</h2>
            <span className="shrink-0 font-mono text-[11px] text-[#6b7280]">
              Task ID
              <span className="mt-0.5 block max-w-[140px] truncate text-right text-[10px] text-[#9ca3af]">{taskId}</span>
            </span>
          </div>
          {selectedJob ? (
            <p className="mt-2 text-sm text-[#374151]">
              <span className="font-semibold">{selectedJob.title}</span>
              <span className="text-[#6b7280]"> · Job ID: {selectedJob.job_id}</span>
            </p>
          ) : null}

          <div className="mt-8">{renderStepTracker()}</div>

          <p className="mt-8 text-sm text-[#6b7280]">Processing time ~ 45 seconds</p>
          <p className="mt-2 text-sm text-[#9ca3af]">You&apos;ll be notified when results are ready.</p>
        </div>
      </div>
    );
  }

  if (phase === "detail" && selectedRow && selectedJob) {
    const br = breakdownPercents(selectedRow.match);
    const insights = insightBulletsFromMatch(selectedRow.match.reasoning, selectedRow.match.recommendation);
    const detailScoreMs = matchScoreStyles(selectedRow.match.match_score);

    return (
      <div className="mx-auto max-w-[960px] px-4 py-8">
        <button
          type="button"
          onClick={() => {
            setPhase("results");
            setSelectedRow(null);
          }}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0A66C2] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </button>

        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
          <div className="border-b border-[#f3f4f6] bg-gradient-to-r from-[#f8fafc] to-white px-8 py-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <Avatar
                src={selectedRow.avatar_url ?? undefined}
                alt=""
                name={selectedRow.name}
                size="2xl"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-[#111827]">
                  <Link
                    to={`/profile/${selectedRow.member_id}`}
                    className="text-[#111827] hover:text-[#0A66C2] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0A66C2]"
                  >
                    {selectedRow.name}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-[#6b7280]">{selectedRow.headline}</p>
                <p className="mt-1 text-sm text-[#6b7280]">
                  {selectedRow.location} · {selectedRow.experience_years} yrs experience
                </p>
              </div>
              <div className={`flex flex-col items-center justify-center rounded-2xl border px-8 py-4 ${detailScoreMs.panel}`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${detailScoreMs.labelText}`}>Match score</span>
                <span className={`text-4xl font-bold tabular-nums ${detailScoreMs.scoreText}`}>
                  {Math.round(selectedRow.match.match_score)}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-8 py-8 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">Match breakdown</h3>
              <ul className="mt-4 space-y-4">
                {(
                  [
                    ["Skills match", br.skills],
                    ["Experience match", br.experience],
                    ["Location match", br.location],
                    ["Education match", br.education]
                  ] as const
                ).map(([label, pct]) => (
                  <li key={label}>
                    <div className="flex justify-between text-sm font-medium text-[#374151]">
                      <span>{label}</span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
                      <div
                        className="h-full rounded-full bg-[#0A66C2] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#111827]">Top skills</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {(selectedRow.match.matched_skills?.length
                  ? selectedRow.match.matched_skills
                  : selectedRow.profile?.skills ?? []
                )
                  .slice(0, 12)
                  .map((s) => (
                    <span
                      key={s}
                      className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]"
                    >
                      {s}
                    </span>
                  ))}
              </div>
              <h3 className="mt-8 text-sm font-semibold text-[#111827]">Experience</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#374151]">
                {(selectedRow.profile?.experience ?? []).slice(0, 5).map((ex, i) => (
                  <li key={i} className="border-l-2 border-[#e5e7eb] pl-3">
                    <span className="font-medium">{ex.title ?? "Role"}</span>
                    {ex.company ? <span> · {ex.company}</span> : null}
                  </li>
                ))}
                {!selectedRow.profile?.experience?.length ? <li className="text-[#9ca3af]">No structured experience.</li> : null}
              </ul>
              <h3 className="mt-8 text-sm font-semibold text-[#111827]">Education</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#374151]">
                {(selectedRow.profile?.education ?? []).slice(0, 4).map((ed, i) => (
                  <li key={i} className="border-l-2 border-[#e5e7eb] pl-3">
                    {[ed.degree, ed.school].filter(Boolean).join(" · ") || "Education"}
                  </li>
                ))}
                {!selectedRow.profile?.education?.length ? <li className="text-[#9ca3af]">No education listed.</li> : null}
              </ul>
            </div>
          </div>

          <div className="mx-8 mb-8 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-5 py-4">
            <h3 className="text-sm font-semibold text-[#1e3a8a]">AI insights</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#1e40af]">
              {insights.length ? (
                insights.map((line, i) => <li key={i}>{line}</li>)
              ) : (
                <li>Review match reasoning in the breakdown above.</li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-[#f3f4f6] bg-[#fafafa] px-8 py-5">
            <Button
              type="button"
              variant="primary"
              style={{ backgroundColor: R_PRIMARY, borderColor: R_PRIMARY }}
              onClick={() => {
                setDisposition((d) => ({ ...d, [selectedRow.member_id]: "shortlisted" }));
                toast.success("Shortlisted (local tracker)");
              }}
            >
              Shortlist
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={selectedRow.match.match_score < MIN_OUTREACH_MATCH_SCORE}
              title={
                selectedRow.match.match_score < MIN_OUTREACH_MATCH_SCORE
                  ? `Outreach is enabled when match score is ${MIN_OUTREACH_MATCH_SCORE}% or higher`
                  : undefined
              }
              onClick={() => void openOutreachForRow(selectedRow)}
            >
              Generate outreach
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                setDisposition((d) => ({ ...d, [selectedRow.member_id]: "rejected" }));
                if (selectedRow.application_id != null) {
                  try {
                    await updateApplicationStatus(selectedRow.application_id, "rejected");
                    toast.success("Candidate rejected.");
                  } catch {
                    toast.error("Could not update application status — disposition saved locally.");
                  }
                } else {
                  toast.success("Candidate rejected.");
                }
              }}
            >
              Reject
            </Button>
          </div>
        </div>

        {outreachOpen ? (
          <OutreachModal
            loading={outreachLoading}
            toName={outreachToName}
            subject={outreachSubject}
            body={outreachBody}
            onBodyChange={setOutreachBody}
            onApprove={() => void handleApproval("approve")}
            onEditApprove={() => void handleApproval("edit")}
            onReject={() => void handleApproval("reject")}
            onClose={() => setOutreachOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  if (phase === "results") {
    if (!selectedJob) {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-[#374151]">We couldn&apos;t resolve the selected job. Try again from the dashboard or pick a job in the first step.</p>
          <Button type="button" variant="primary" className="mt-6" onClick={() => setPhase("start")}>
            Back to start
          </Button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <div className="flex flex-col gap-4 border-b border-[#e5e7eb] pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[#111827]">AI Matching Results</h1>
              {completedSeconds != null ? (
                <Badge className="bg-emerald-50 text-xs font-semibold text-emerald-800">
                  Completed in {completedSeconds}s
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[#6b7280]">
              <span className="font-semibold text-[#111827]">{selectedJob.title}</span> · Job ID {selectedJob.job_id}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-[#0A66C2] hover:underline"
            onClick={() => {
              setPhase("start");
              setMatchRows([]);
              setEmptyMatchMessage(null);
              setTalentInsights([]);
              setCompletedSeconds(null);
            }}
          >
            New matching run
          </button>
        </div>

        {intent === "talent_pool" ? (
          <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-[#111827]">Talent pool summary</h2>
            <p className="mt-2 text-sm text-[#6b7280]">
              Placeholder insights — replace with aggregated analytics or search-backed signals when available.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[#374151]">
              {talentInsights.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              className="mt-6"
              onClick={() => {
                setIntent("job_match");
                setPhase("start");
              }}
            >
              Run job-based matching
            </Button>
          </div>
        ) : emptyMatchMessage ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-amber-950">No candidates matched</h2>
                <p className="mt-2 text-sm leading-relaxed text-amber-950/90">{emptyMatchMessage}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    style={{ backgroundColor: R_PRIMARY, borderColor: R_PRIMARY }}
                    onClick={() => {
                      setEmptyMatchMessage(null);
                      setPhase("start");
                    }}
                  >
                    Choose another job
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => navigate(`/recruiter/jobs/${selectedJob.job_id}/applicants`)}>
                    View applicants
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(
                [
                  ["Top matches", summary.top, "≥85%"],
                  ["Good matches", summary.good, "70–84%"],
                  ["Possible matches", summary.possible, "50–69%"],
                  ["Low matches", summary.low, "<50%"]
                ] as const
              ).map(([label, count, hint]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                  <p className="text-sm font-medium text-[#6b7280]">{label}</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-[#111827]">{count}</p>
                  <p className="mt-1 text-xs text-[#9ca3af]">{hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#374151]">Sort by</span>
                <select
                  className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as "score" | "name")}
                >
                  <option value="score">Match score</option>
                  <option value="name">Name</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-[#6b7280]" />
                <select
                  className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium"
                  value={bucketFilter}
                  onChange={(e) => setBucketFilter(e.target.value as typeof bucketFilter)}
                >
                  <option value="all">All buckets</option>
                  <option value="top">Top matches</option>
                  <option value="good">Good matches</option>
                  <option value="possible">Possible matches</option>
                  <option value="low">Low matches</option>
                </select>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-[#f3f4f6] bg-[#fafafa] text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    <tr>
                      <th className="px-4 py-3">Candidate</th>
                      <th className="px-4 py-3">Match score</th>
                      <th className="px-4 py-3">Skills match</th>
                      <th className="px-4 py-3">Experience</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f3f4f6]">
                    {sortedFilteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-[#6b7280]">
                          No applicants for this job yet, or none passed the filter.
                        </td>
                      </tr>
                    ) : (
                      sortedFilteredRows.map((row) => {
                        const rowScoreMs = matchScoreStyles(row.match.match_score);
                        return (
                        <tr
                          key={`${row.member_id}-${row.application_id ?? ""}`}
                          className="cursor-pointer hover:bg-[#f9fafb]"
                          onClick={() => {
                            setSelectedRow(row);
                            setPhase("detail");
                          }}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar src={row.avatar_url ?? undefined} alt="" name={row.name} size="sm" />
                              <div>
                                <Link
                                  to={`/profile/${row.member_id}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="font-semibold text-[#111827] hover:text-[#0A66C2] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0A66C2]"
                                >
                                  {row.name}
                                </Link>
                                <div className="text-xs text-[#6b7280]">{row.experience_years} yrs</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-bold ${rowScoreMs.dialRing} ${rowScoreMs.dialPct}`}
                                title="Match score"
                              >
                                {Math.round(row.match.match_score)}%
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {row.match.matched_skills.slice(0, 4).map((s) => (
                                <span
                                  key={s}
                                  className="rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#374151]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-4 tabular-nums text-[#374151]">{row.experience_years} yrs</td>
                          <td className="px-4 py-4 text-[#374151]">{row.location}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                className="rounded-lg p-2 text-[#0A66C2] hover:bg-[#eff6ff]"
                                aria-label="View candidate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRow(row);
                                  setPhase("detail");
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className={`rounded-lg p-2 ${
                                  row.match.match_score >= MIN_OUTREACH_MATCH_SCORE
                                    ? "text-[#0A66C2] hover:bg-[#eff6ff]"
                                    : "cursor-not-allowed text-[#cbd5e1]"
                                }`}
                                aria-label="Generate outreach message"
                                title={
                                  row.match.match_score < MIN_OUTREACH_MATCH_SCORE
                                    ? `Outreach from ${MIN_OUTREACH_MATCH_SCORE}% match only`
                                    : "Generate outreach message"
                                }
                                disabled={row.match.match_score < MIN_OUTREACH_MATCH_SCORE}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openOutreachForRow(row);
                                }}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] text-[#9ca3af]">
                              {disposition[row.member_id] === "shortlisted" ? (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-800">
                                  Shortlisted
                                </span>
                              ) : null}
                              {disposition[row.member_id] === "rejected" ? (
                                <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-800">
                                  Rejected
                                </span>
                              ) : null}
                              {outreachStatus[row.member_id] && outreachStatus[row.member_id] !== "draft" ? (
                                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-800">
                                  {outreachStatus[row.member_id]}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {outreachOpen ? (
          <OutreachModal
            loading={outreachLoading}
            toName={outreachToName}
            subject={outreachSubject}
            body={outreachBody}
            onBodyChange={setOutreachBody}
            onApprove={() => void handleApproval("approve")}
            onEditApprove={() => void handleApproval("edit")}
            onReject={() => void handleApproval("reject")}
            onClose={() => setOutreachOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  return null;
}

function OutreachModal({
  loading,
  toName,
  subject,
  body,
  onBodyChange,
  onApprove,
  onEditApprove,
  onReject,
  onClose
}: {
  loading: boolean;
  toName: string;
  subject: string;
  body: string;
  onBodyChange: (v: string) => void;
  onApprove: () => void;
  onEditApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white shadow-xl">
        <div className="border-b border-[#f3f4f6] px-6 py-4">
          <h2 className="text-lg font-semibold text-[#111827]">Approve outreach message</h2>
        </div>
        <div className="space-y-4 px-6 py-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">To</label>
            <p className="mt-1 text-sm font-medium text-[#111827]">{toName}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Subject</label>
            <p className="mt-1 text-sm font-medium text-[#111827]">{subject}</p>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Message preview</label>
            <textarea
              className="mt-2 min-h-[160px] w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm text-[#374151]"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="primary"
              className="flex-1 bg-emerald-600 border-emerald-600 hover:bg-emerald-700"
              disabled={loading}
              onClick={onApprove}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approve &amp; Send
            </Button>
            <Button type="button" variant="secondary" className="flex-1" disabled={loading} onClick={onEditApprove}>
              Edit &amp; Approve
            </Button>
            <Button type="button" variant="danger" className="flex-1" disabled={loading} onClick={onReject}>
              Reject
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-[#6b7280]">
            Once approved, the message will be delivered to the candidate&apos;s SkillSync inbox. You can track the response in Messages.
          </p>
          <button type="button" className="text-sm font-semibold text-[#6b7280] hover:text-[#111827]" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
