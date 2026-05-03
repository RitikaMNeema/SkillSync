import { ArrowLeft, CheckCircle2, ChevronDown, CircleDashed, Clock3, Download, FileText, Mail, MapPin, MoreHorizontal, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getApplication, getAllApplicationsByJob, updateApplicationStatus } from "../../api/applications";
import { approveAgentWorkflow, getAgentStatus, getAICommandStatus, startAgentWorkflow } from "../../api/ai";
import { getJob } from "../../api/jobs";
import { getMember } from "../../api/members";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import type { Application, ApplicationStatus } from "../../types/application";
import type { Job } from "../../types/job";
import type { MemberProfile } from "../../types/member";
import { selectableApplicationStatuses } from "../../utils/applicationStatus";
import { getStatusColor } from "../../utils/getStatusColor";

const STATUS_FILTERS: Array<ApplicationStatus | "all"> = ["all", "submitted", "rejected", "withdrawn"];
const AI_TRACE_TERMINAL_STATUSES = new Set(["awaiting_approval", "completed", "failed", "rejected"]);

type AIAssessment = {
  traceId: string;
  matchScore: number | null;
  strongReasons: string[];
  topGaps: string[];
  recommendation: string;
  reasoning: string;
  confidence: number | null;
  workflowStatus: string;
  workflowSteps: Array<{ label: string; status: "pending" | "running" | "completed"; time?: string }>;
  outreachMessage: string;
};

function toExperienceStrings(profile: MemberProfile): string[] {
  return (profile.experience ?? [])
    .map((entry) => [entry.title, entry.company, entry.description].filter(Boolean).join(" - ").trim())
    .filter(Boolean);
}

function toEducationStrings(profile: MemberProfile): string[] {
  return (profile.education ?? [])
    .map((entry) => [entry.school, entry.degree, entry.field ?? entry.field_of_study].filter(Boolean).join(", ").trim())
    .filter(Boolean);
}

async function pollAiCommand(commandId: string) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const status = await getAICommandStatus(commandId);
    if (status.status === "completed") return status;
    if (status.status === "failed") throw new Error(status.error ?? "AI command failed");
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
  }
  throw new Error("AI command timed out");
}

async function pollAiTrace(traceId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await getAgentStatus(traceId);
    if (AI_TRACE_TERMINAL_STATUSES.has(status.status)) return status;
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  const latest = await getAgentStatus(traceId);
  if (!AI_TRACE_TERMINAL_STATUSES.has(latest.status)) {
    throw new Error(`AI workflow still running (${latest.status})`);
  }
  return latest;
}

function resolveResumeUrl(resumeUrl?: string | null): string | null {
  if (!resumeUrl) return "/resumes/sample_resume.pdf";
  const trimmed = resumeUrl.trim();
  if (!trimmed) return "/resumes/sample_resume.pdf";
  if (!trimmed.toLowerCase().endsWith(".pdf")) {
    return "/resumes/sample_resume.pdf";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "example.com") {
      // Seed data may carry placeholder URLs; point to a real local sample resume.
      return "/resumes/sample_resume.pdf";
    }
  } catch {
    // Keep non-URL values untouched in case a relative path was stored.
  }
  return trimmed;
}

export function ApplicantReviewPage() {
  const { job_id } = useParams();
  const location = useLocation();
  const navState = (location.state as { from?: string; fromLabel?: string } | null) ?? null;
  const backTo = navState?.from ?? "/recruiter/jobs";
  const backLabel = navState?.fromLabel ?? "Back to My Jobs";
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [memberProfilesById, setMemberProfilesById] = useState<Record<number, MemberProfile>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all">("all");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiByApplicationId, setAiByApplicationId] = useState<Record<number, AIAssessment>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [approvingAi, setApprovingAi] = useState(false);
  const [aiRetryTick, setAiRetryTick] = useState(0);
  const aiInFlightRef = useRef<Record<number, boolean>>({});
  const appsSignatureRef = useRef<string>("");
  const selectedIdRef = useRef<number | null>(null);
  const memberProfilesRef = useRef<Record<number, MemberProfile>>({});

  const buildAppsSignature = (apps: Application[]) =>
    apps
      .map((application) => `${application.application_id}:${application.status}`)
      .sort()
      .join("|");

  useEffect(() => {
    if (!job_id) return;
    setPageLoading(true);
    setPageError(null);
    let cancelled = false;
    void Promise.all([getJob(Number(job_id)), getAllApplicationsByJob(Number(job_id))])
      .then(async ([jobData, appData]) => {
        if (cancelled) return;
        const memberIds = [...new Set(appData.applications.map((application) => application.member_id))];
        const profileEntries = await Promise.all(
          memberIds.map(async (memberId) => {
            try {
              const member = await getMember(memberId);
              return [memberId, member] as const;
            } catch {
              return null;
            }
          })
        );
        const profilesMap = Object.fromEntries(profileEntries.filter((entry): entry is readonly [number, MemberProfile] => Boolean(entry)));
        setJob(jobData);
        setApplications(appData.applications);
        setSelected(appData.applications[0] ?? null);
        setMemberProfilesById(profilesMap);
        setProfile(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Could not load job or applicants");
          setJob(null);
          setApplications([]);
          setSelected(null);
          setMemberProfilesById({});
        }
      })
      .finally(() => {
        if (!cancelled) setPageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job_id]);

  useEffect(() => {
    selectedIdRef.current = selected?.application_id ?? null;
  }, [selected?.application_id]);

  useEffect(() => {
    appsSignatureRef.current = buildAppsSignature(applications);
  }, [applications]);

  useEffect(() => {
    memberProfilesRef.current = memberProfilesById;
  }, [memberProfilesById]);

  useEffect(() => {
    if (!job_id) return;
    const intervalId = window.setInterval(() => {
      void getAllApplicationsByJob(Number(job_id))
        .then(async (latest) => {
          const latestSignature = buildAppsSignature(latest.applications);
          if (latestSignature === appsSignatureRef.current) return;

          const existingIds = new Set(Object.keys(memberProfilesRef.current).map(Number));
          const missingMemberIds = [...new Set(latest.applications.map((application) => application.member_id))]
            .filter((memberId) => !existingIds.has(memberId));

          if (missingMemberIds.length) {
            const profileEntries = await Promise.all(
              missingMemberIds.map(async (memberId) => {
                try {
                  const member = await getMember(memberId);
                  return [memberId, member] as const;
                } catch {
                  return null;
                }
              })
            );
            const nextProfiles = Object.fromEntries(
              profileEntries.filter((entry): entry is readonly [number, MemberProfile] => Boolean(entry))
            );
            setMemberProfilesById((current) => ({ ...current, ...nextProfiles }));
          }

          setApplications(latest.applications);
          const selectedId = selectedIdRef.current;
          if (selectedId) {
            const refreshedSelected = latest.applications.find((application) => application.application_id === selectedId);
            if (refreshedSelected) {
              setSelected((current) => (current ? { ...current, status: refreshedSelected.status } : refreshedSelected));
            }
          }
          appsSignatureRef.current = latestSignature;
          toast("Applicants updated from background processing.");
        })
        .catch(() => {
          // Keep silent on background polling failures to avoid noisy toasts.
        });
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [job_id]);

  useEffect(() => {
    if (!selected?.application_id) return;
    const appId = selected.application_id;
    const memberId = selected.member_id;
    let cancelled = false;
    setProfile(null);
    void Promise.all([getApplication(appId), getMember(memberId)])
      .then(([detail, member]) => {
        if (cancelled || detail.application_id !== appId) return;
        setSelected(detail);
        setProfile(member);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load applicant");
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.application_id]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return applications.filter((application) => {
      if (statusFilter !== "all" && application.status !== statusFilter) return false;
      if (!keyword) return true;
      const member = memberProfilesById[application.member_id];
      const fullName = member ? `${member.first_name} ${member.last_name}`.trim().toLowerCase() : "";
      return (
        fullName.includes(keyword) ||
        `${application.member_id}`.includes(keyword) ||
        application.status.toLowerCase().includes(keyword)
      );
    });
  }, [applications, memberProfilesById, search, statusFilter]);

  const statusOptions = selected ? selectableApplicationStatuses(selected.status) : [];
  const openResumeUrl = resolveResumeUrl(selected?.resume_url);
  const selectedAppliedAt = selected ? new Date(selected.application_datetime) : null;
  const selectedAppliedText =
    selectedAppliedAt && !Number.isNaN(selectedAppliedAt.getTime())
      ? selectedAppliedAt.toLocaleDateString()
      : "Unknown date";
  const selectedSkills = (profile?.skills ?? []).filter(Boolean).slice(0, 5);
  const resumeFileName =
    profile && openResumeUrl
      ? `${profile.first_name.toLowerCase()}_${profile.last_name.toLowerCase()}_resume.pdf`
      : "resume.pdf";

  const activeAi = selected ? aiByApplicationId[selected.application_id] : null;
  const aiScore = activeAi?.matchScore;

  useEffect(() => {
    if (!selected || !profile) return;
    const role = job?.title ?? "this opportunity";
    setDraftSubject(`Regarding your ${role} application`);
    setDraftMessage("");
    setIsEditingDraft(false);
    setAiError(null);
    setAiLoading(!aiByApplicationId[selected.application_id]);
    return undefined;
  }, [selected?.application_id, profile?.member_id, job?.title]);

  useEffect(() => {
    if (!selected || !profile || !job || aiByApplicationId[selected.application_id]) return;
    if (aiInFlightRef.current[selected.application_id]) return;
    if (!job.recruiter_id) {
      setAiError("Missing recruiter id; unable to request AI workflow.");
      setAiLoading(false);
      return;
    }
    let cancelled = false;
    const candidatePayload = {
      member_id: profile.member_id,
      headline: profile.headline ?? "",
      summary: profile.summary ?? "",
      skills: profile.skills ?? [],
      experiences: toExperienceStrings(profile),
      location: [profile.location_city, profile.location_state, profile.location_country].filter(Boolean).join(", "),
      education: toEducationStrings(profile),
    };
    const jobPayload = {
      job_id: job.job_id,
      title: job.title,
      description: job.description ?? "",
      skills_required: job.skills_required ?? [],
      location: job.location ?? "",
      seniority_level: job.seniority_level ?? "",
      employment_type: job.employment_type ?? "",
    };

    setAiLoading(true);
    setAiError(null);
    aiInFlightRef.current[selected.application_id] = true;
    void startAgentWorkflow({
      recruiter_id: job.recruiter_id,
      candidate: candidatePayload,
      job: jobPayload,
      workflow_type: "shortlist_outreach",
      require_human_approval: true,
    })
      .then((queued) => pollAiCommand(queued.command_id))
      .then((commandDone) => {
        const traceId = commandDone.result?.trace_id as string | undefined;
        if (!traceId) throw new Error("AI trace id was not returned");
        return pollAiTrace(traceId).then((trace) => ({ trace, traceId }));
      })
      .then(({ trace, traceId }) => {
        if (cancelled) return;
        if (trace.status === "failed" || trace.status === "rejected") {
          throw new Error(`AI workflow ${trace.status}`);
        }
        const match = trace.final_result?.match_result ?? {};
        const outreachMessage = trace.final_result?.outreach_draft?.message ?? "";
        const rawScore = Number(match.match_score);
        const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : null;
        if (score == null) {
          throw new Error("AI workflow completed without numeric match_score");
        }
        const matchedSkills = Array.isArray(match.matched_skills) ? match.matched_skills.filter(Boolean) : [];
        const missingSkills = Array.isArray(match.missing_skills) ? match.missing_skills.filter(Boolean) : [];
        const steps = Array.isArray(trace.steps) ? trace.steps : [];
        const workflowSteps = steps.map((step: any) => ({
          label: step.step_name ?? "Step",
          status: step.status === "completed" ? "completed" : step.status === "running" ? "running" : "pending",
          time: step.completed_at || step.started_at || undefined,
        }));
        const recommendation = typeof match.recommendation === "string" ? match.recommendation : "";
        const assessment: AIAssessment = {
          traceId,
          matchScore: score,
          strongReasons: matchedSkills.slice(0, 5),
          topGaps: missingSkills.slice(0, 5),
          recommendation,
          reasoning: typeof match.reasoning === "string" ? match.reasoning : "",
          confidence: null,
          workflowStatus: trace.status,
          workflowSteps,
          outreachMessage,
        };
        setAiByApplicationId((current) => ({ ...current, [selected.application_id]: assessment }));
        if (outreachMessage) {
          setDraftMessage(outreachMessage);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAiError(error instanceof Error ? error.message : "AI analysis unavailable");
          setAiByApplicationId((current) => {
            const next = { ...current };
            delete next[selected.application_id];
            return next;
          });
        }
      })
      .finally(() => {
        aiInFlightRef.current[selected.application_id] = false;
        if (!cancelled) setAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [aiByApplicationId, job, profile, selected, aiRetryTick]);

  const handleRetryAiAnalysis = () => {
    if (!selected) return;
    aiInFlightRef.current[selected.application_id] = false;
    setAiByApplicationId((current) => {
      const next = { ...current };
      delete next[selected.application_id];
      return next;
    });
    setAiError(null);
    setAiLoading(true);
    setAiRetryTick((current) => current + 1);
  };

  const handleApproveAndSend = () => {
    if (!selected || !activeAi) {
      toast.error("AI workflow is not ready yet.");
      return;
    }
    if (!job?.recruiter_id) {
      toast.error("Missing recruiter id.");
      return;
    }
    setApprovingAi(true);
    const isEdited = draftMessage.trim() && draftMessage.trim() !== (activeAi.outreachMessage ?? "").trim();
    void approveAgentWorkflow({
      trace_id: activeAi.traceId,
      action: isEdited ? "edit" : "approve",
      edited_message: isEdited ? draftMessage : null,
      reviewer_id: job.recruiter_id,
    })
      .then((queued) => pollAiCommand(queued.command_id))
      .then(() => getAgentStatus(activeAi.traceId))
      .then((trace) => {
        const nextMessage = trace.final_result?.outreach_draft?.message ?? draftMessage;
        setAiByApplicationId((current) => {
          const existing = current[selected.application_id];
          if (!existing) return current;
          return {
            ...current,
            [selected.application_id]: {
              ...existing,
              workflowStatus: trace.status,
              outreachMessage: nextMessage,
              workflowSteps: Array.isArray(trace.steps)
                ? trace.steps.map((step: any) => ({
                    label: step.step_name ?? "Step",
                    status: step.status === "completed" ? "completed" : step.status === "running" ? "running" : "pending",
                    time: step.completed_at || step.started_at || undefined,
                  }))
                : existing.workflowSteps,
            },
          };
        });
        setDraftMessage(nextMessage);
        setIsEditingDraft(false);
        toast.success("Outreach approved and ready to send.");
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not approve outreach");
      })
      .finally(() => setApprovingAi(false));
  };

  if (pageLoading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (pageError || !job) {
    return (
      <section className="space-y-4">
        <Link to={backTo} className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <Card className="p-6">
          <p className="text-sm text-text-secondary">{pageError ?? "Job not found."}</p>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Link to={backTo} className="inline-flex items-center gap-2 text-sm">
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="text-sm text-text-secondary">
              {applications.length} applicant{applications.length === 1 ? "" : "s"}
              {job.applicants_count != null && job.applicants_count !== applications.length ? (
                <span className="ml-1 text-amber-700">(job row count: {job.applicants_count})</span>
              ) : null}
            </p>
          </div>
          <Badge className={getStatusColor(job.status ?? "open")}>{job.status ?? "open"}</Badge>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <Card className="rounded-xl border border-gray-200 p-4 shadow-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border-gray-200"
            aria-label="Search applicants"
            placeholder="Search applicants"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                  statusFilter === status ? "border-[#0a66c2] bg-[#e8f3fc] text-[#0a66c2]" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {applications.length === 0 ? (
              <div className="rounded-card border border-dashed border-[#d9dee3] bg-[#fafbfd] px-4 py-6 text-center text-sm text-text-secondary">
                <p className="font-medium text-text-primary">No applications yet</p>
                <p className="mt-2">
                  This list only shows real submissions from the application service. Bulk-imported jobs do not create applicants until members apply.
                </p>
              </div>
            ) : (
              filtered.map((application) => (
                <button
                  key={application.application_id}
                  type="button"
                  onClick={() => setSelected(application)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition hover:border-[#c4d7ef] hover:bg-[#f7fbff] ${
                    selected?.application_id === application.application_id ? "border-[#0a66c2] bg-[#eef5fc]" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-sm font-semibold text-[#0a66c2]">
                      {(() => {
                        const member = memberProfilesById[application.member_id];
                        const fullName = member ? `${member.first_name} ${member.last_name}`.trim() : `M${application.member_id}`;
                        const [first = "", last = ""] = fullName.split(" ");
                        return `${first.slice(0, 1)}${last.slice(0, 1) || first.slice(1, 2)}`.toUpperCase();
                      })()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1f2937]">
                        {memberProfilesById[application.member_id]
                          ? `${memberProfilesById[application.member_id].first_name} ${memberProfilesById[application.member_id].last_name}`
                          : `Member #${application.member_id}`}
                      </p>
                      <p className="text-xs capitalize text-[#4b5563]">
                        {application.status} ·{" "}
                        {new Date(application.application_datetime).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric"
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
            {applications.length > 0 && filtered.length === 0 ? (
              <p className="text-center text-sm text-text-secondary">No applicants match your search.</p>
            ) : null}
          </div>
        </Card>
        <div className="space-y-4">
          {applications.length === 0 ? (
            <Card className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-center shadow-sm text-text-secondary">
              <p className="text-sm">There is nothing to review until the first application arrives.</p>
              <p className="text-xs">Share the job in Job Search or have a member apply from their account to populate this view.</p>
            </Card>
          ) : !selected || !profile ? (
            <Card className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 shadow-sm text-text-secondary">Select an applicant</Card>
          ) : (
            <div className="space-y-4">
              <CandidateHeader
                profile={profile}
                selected={selected}
                appliedText={selectedAppliedText}
                selectedSkills={selectedSkills}
              />
              <AIMatchCard
                loading={aiLoading}
                score={aiScore}
                confidence={activeAi?.confidence}
                strongReasons={activeAi?.strongReasons ?? []}
                topGaps={activeAi?.topGaps ?? []}
                error={aiError}
                onRetry={handleRetryAiAnalysis}
              />
              <Card className="rounded-xl border border-gray-200 p-5 shadow-sm">
                <label className="text-sm font-semibold text-[#1f2937]" htmlFor="app-status">
                  Application status
                </label>
                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#7c3aed]" />
                    <select
                      id="app-status"
                      className="linkedin-input h-12 w-full appearance-none rounded-xl border border-[#d1d5db] bg-white pl-10 pr-10 text-[20px] font-semibold capitalize leading-none text-[#1f2937] shadow-sm"
                      value={selected.status}
                      onChange={(event) => {
                        const next = event.target.value as ApplicationStatus;
                        void updateApplicationStatus(selected.application_id, next)
                          .then(() => {
                            toast.success("Application status updated");
                            setSelected((current) => (current ? { ...current, status: next } : current));
                            setApplications((apps) =>
                              apps.map((a) => (a.application_id === selected.application_id ? { ...a, status: next } : a))
                            );
                          })
                          .catch((error: unknown) => {
                            toast.error(error instanceof Error ? error.message : "Could not update status");
                          });
                      }}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
                  </div>
                  <div className="rounded-xl border border-[#f3dfbf] bg-[#fff8ee] px-5 py-4">
                    <p className="text-[15px] font-semibold text-[#b45309]">
                      <Sparkles className="mr-2 inline-block h-4 w-4 align-[-2px]" />
                      AI suggests: {activeAi?.recommendation || (aiLoading ? "Analyzing candidate profile..." : "No recommendation returned")}
                    </p>
                    <p className="mt-2 border-b border-[#f3dfbf] pb-3 text-[15px] leading-7 text-[#374151]">
                      {activeAi?.reasoning || (aiLoading ? "Please wait while AI completes matching and reasoning." : "No reasoning returned by AI for this run.")}
                    </p>
                    {aiError ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-[#b45309]">AI error: {aiError}</p>
                        <button type="button" className="text-xs font-semibold text-[#0a66c2] hover:underline" onClick={handleRetryAiAnalysis}>
                          Retry analysis
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
              <Card className="rounded-xl border border-gray-200 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-[#111827]">Resume</h3>
                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-[#fef2f2] p-2 text-[#ef4444]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium text-[#1f2937]">{resumeFileName}</p>
                        <p className="text-xs text-[#6b7280]">PDF · 245 KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {openResumeUrl ? (
                        <>
                          <a
                            href={openResumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg px-2 py-1.5 text-sm font-semibold text-[#2563eb] transition hover:bg-[#eff6ff]"
                          >
                            Preview
                          </a>
                          <a
                            href={openResumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={resumeFileName}
                            className="rounded-lg p-1.5 text-[#374151] transition hover:bg-gray-100"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button type="button" className="rounded-lg p-1.5 text-[#374151] transition hover:bg-gray-100" aria-label="More resume actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Card className="rounded-xl border border-gray-200 p-4 shadow-sm transition hover:shadow-md">
            <h3 className="text-sm font-semibold text-[#111827]">AI Assistant</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">
              AI-powered insights to help you make better hiring decisions
            </p>
          </Card>
          <AIWorkflowPanel loading={aiLoading} aiSteps={activeAi?.workflowSteps} workflowStatus={activeAi?.workflowStatus} />
          <OutreachDraftPanel
            subject={draftSubject}
            message={draftMessage}
            editing={isEditingDraft}
            isApproving={approvingAi}
            canApprove={Boolean(activeAi?.traceId)}
            onSubjectChange={setDraftSubject}
            onMessageChange={setDraftMessage}
            onToggleEdit={() => setIsEditingDraft((current) => !current)}
            onApprove={handleApproveAndSend}
          />
        </div>
      </div>
    </section>
  );
}

function CandidateHeader({
  profile,
  selected,
  appliedText,
  selectedSkills
}: {
  profile: MemberProfile;
  selected: Application;
  appliedText: string;
  selectedSkills: string[];
}) {
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const [first = "", last = ""] = fullName.split(" ");
  const initials = `${first.slice(0, 1)}${last.slice(0, 1) || first.slice(1, 2)}`.toUpperCase();
  return (
    <Card className="rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-lg font-semibold text-[#0a66c2]">
            {initials}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#111827]">{fullName}</h2>
            <p className="text-sm text-[#4b5563]">{profile.headline || "Professional profile"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#6b7280]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {profile.location_city || "Location not provided"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                Applied {appliedText}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedSkills.length ? (
                selectedSkills.map((skill) => (
                  <span key={skill} className="rounded-full bg-[#eef5fc] px-2.5 py-1 text-xs font-medium text-[#0a66c2]">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[#6b7280]">No highlighted skills</span>
              )}
            </div>
          </div>
        </div>
        <Badge className={`${getStatusColor(selected.status)} capitalize`}>{selected.status}</Badge>
      </div>
    </Card>
  );
}

function AIMatchCard({
  loading,
  score,
  confidence,
  strongReasons,
  topGaps,
  error,
  onRetry
}: {
  loading: boolean;
  score: number | null | undefined;
  confidence?: number | null;
  strongReasons: string[];
  topGaps: string[];
  error?: string | null;
  onRetry: () => void;
}) {
  const numericScore = typeof score === "number" && Number.isFinite(score) ? score : null;
  const isScorePending = loading && numericScore == null;
  const label =
    numericScore == null
      ? isScorePending
        ? "Analyzing..."
        : "Score Unavailable"
      : numericScore >= 80
        ? "Strong Match"
        : numericScore >= 60
          ? "Good Match"
          : numericScore >= 35
            ? "Moderate Match"
            : "Weak Match";
  const displayConfidence = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null;
  return (
    <Card className="rounded-xl border border-gray-200 p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">AI Match Score</div>
      {error ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-800">{error}</p>
          <button type="button" className="shrink-0 text-xs font-semibold text-[#0a66c2] hover:underline" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : null}
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-[6px] border-[#10b981] bg-white">
          <span className="text-[28px] font-semibold leading-none text-[#0b4f35]">{numericScore == null ? (isScorePending ? "..." : "--") : `${Math.round(numericScore)}%`}</span>
          <span className="mt-1 text-[11px] font-medium text-[#059669]">{label}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f2937]"><Sparkles className="h-4 w-4 text-[#0a66c2]" />{label}</p>
          {loading ? (
            <div className="mt-3 animate-pulse space-y-2">
              <div className="h-3 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-full rounded bg-gray-200" />
              <div className="h-3 w-5/6 rounded bg-gray-200" />
            </div>
          ) : (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Why it&apos;s a strong match</p>
                <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                  {strongReasons.length ? strongReasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />{reason}</li>
                  )) : <li className="text-[#6b7280]">{isScorePending ? "Waiting for AI match results..." : "No matched skills returned."}</li>}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Top gaps</p>
                <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                  {topGaps.length ? topGaps.map((gap) => (
                    <li key={gap} className="flex items-start gap-1.5"><CircleDashed className="mt-0.5 h-3.5 w-3.5 text-amber-500" />{gap}</li>
                  )) : <li className="text-[#6b7280]">{isScorePending ? "Waiting for AI gap analysis..." : "No missing skills returned."}</li>}
                </ul>
              </div>
            </div>
          )}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-[#6b7280]">
              <span>AI confidence</span>
              <span>{displayConfidence == null ? "N/A" : `${displayConfidence}%`}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-[#0a66c2] transition-all" style={{ width: `${displayConfidence ?? 0}%` }} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AIWorkflowPanel({
  loading,
  aiSteps,
  workflowStatus
}: {
  loading: boolean;
  aiSteps?: Array<{ label: string; status: "pending" | "running" | "completed"; time?: string }>;
  workflowStatus?: string;
}) {
  const steps = (aiSteps ?? []).map((step) => ({
    label: step.label,
    time: step.time ? new Date(step.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--",
    status: step.status,
  }));
  const [showDetails, setShowDetails] = useState(false);
  return (
    <Card className="rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#111827]">AI Hiring Assistant</h3>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </div>
      <div className="mt-3 space-y-3">
        {steps.length ? (
          steps.map((step) => {
            const done = !loading && step.status === "completed";
            const active = !loading && step.status === "running";
            return (
              <div key={step.label} className="flex items-start gap-3">
                <div className="pt-0.5">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : active ? (
                    <Clock3 className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm ${done ? "text-[#111827]" : "text-[#6b7280]"}`}>{step.label}</p>
                  <p className="text-xs text-[#9ca3af]">{step.time}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-[#6b7280]">{loading ? "Loading workflow..." : "No workflow steps returned yet."}</p>
        )}
      </div>
      <button
        type="button"
        className="mt-3 text-xs font-medium text-[#0a66c2] hover:underline"
        onClick={() => setShowDetails((current) => !current)}
      >
        {showDetails ? "Hide workflow details" : "View workflow details"}
      </button>
      {showDetails ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-[#6b7280]">
            <span className="font-medium text-[#374151]">Workflow status</span>
            <span className="capitalize">{workflowStatus ?? "running"}</span>
          </div>
          <div className="space-y-1.5">
            {steps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="flex items-center justify-between text-xs">
                <span className="truncate text-[#374151]">{index + 1}. {step.label}</span>
                <span className="ml-2 shrink-0 text-[#6b7280] capitalize">
                  {step.status} {step.time ? `· ${step.time}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function OutreachDraftPanel({
  subject,
  message,
  editing,
  isApproving,
  canApprove,
  onSubjectChange,
  onMessageChange,
  onToggleEdit,
  onApprove
}: {
  subject: string;
  message: string;
  editing: boolean;
  isApproving: boolean;
  canApprove: boolean;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onToggleEdit: () => void;
  onApprove: () => void;
}) {
  return (
    <Card className="rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#111827]">Outreach Draft</h3>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </div>
      <div className="mt-3 space-y-3">
        <label className="block text-xs font-semibold text-[#374151]" htmlFor="outreach-subject">
          Subject
        </label>
        <input
          id="outreach-subject"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          disabled={!editing}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
        />
        <label className="block text-xs font-semibold text-[#374151]" htmlFor="outreach-message">
          Message
        </label>
        <textarea
          id="outreach-message"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          disabled={!editing}
          className="min-h-[140px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#374151] hover:bg-gray-50"
          onClick={onToggleEdit}
        >
          {editing ? "Lock draft" : "Edit draft"}
        </Button>
        <Button
          type="button"
          disabled={!canApprove || isApproving}
          onClick={onApprove}
          className="rounded-lg bg-[#0a66c2] px-3 py-2 text-sm text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isApproving ? "Approving..." : "Approve & send"}
        </Button>
      </div>
    </Card>
  );
}
