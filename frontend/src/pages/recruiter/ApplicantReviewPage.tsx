import { ArrowLeft, CheckCircle2, ChevronDown, CircleDashed, Clock3, Download, FileText, Mail, MapPin, MoreHorizontal, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { getApplication, getAllApplicationsByJob, updateApplicationStatus } from "../../api/applications";
import { downloadResumeFile, getResumeMeta, type ResumeMeta } from "../../api/members";
import { approveAgentWorkflow, getAgentStatus, getAICommandStatus, startAgentWorkflow } from "../../api/ai";
import { getJob } from "../../api/jobs";
import { getRecruiter } from "../../api/recruiters";
import { getMember } from "../../api/members";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import type { Application, ApplicationStatus } from "../../types/application";
import type { Job } from "../../types/job";
import type { MemberProfile } from "../../types/member";
import { applicationStatusSkipsAiShortlist, selectableApplicationStatuses } from "../../utils/applicationStatus";
import { cn } from "../../utils/cn";
import { getStatusColor } from "../../utils/getStatusColor";
import { jobToPayload, matchScoreStyles, memberToCandidateProfile, sanitizeOutreachDraft } from "./aiMatchingUtils";

const STATUS_FILTERS: Array<ApplicationStatus | "all"> = [
  "all",
  "submitted",
  "reviewing",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn"
];
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
  outreachSkipped?: boolean;
  outreachSkipReason?: string;
};

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

/** Public HTTPS résumé URL we can open in a new tab (not seed placeholders). */
function externalResumePreviewUrl(resumeUrl?: string | null): string | null {
  if (!resumeUrl?.trim()) return null;
  const trimmed = resumeUrl.trim();
  if (!trimmed.toLowerCase().endsWith(".pdf")) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname === "example.com") return null;
    return trimmed;
  } catch {
    return null;
  }
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
  const [resumeMeta, setResumeMeta] = useState<ResumeMeta | null>(null);
  const [resumeMetaLoading, setResumeMetaLoading] = useState(false);

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
    const memberId = selected?.member_id;
    if (!memberId) {
      setResumeMeta(null);
      setResumeMetaLoading(false);
      return;
    }
    let cancelled = false;
    setResumeMetaLoading(true);
    void getResumeMeta(memberId)
      .then((meta) => {
        if (!cancelled) setResumeMeta(meta);
      })
      .catch(() => {
        if (!cancelled) setResumeMeta(null);
      })
      .finally(() => {
        if (!cancelled) setResumeMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.member_id, selected?.application_id]);

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
  const jobIsClosed = (job?.status ?? "open") === "closed";
  const applicationSettledForAi = selected ? applicationStatusSkipsAiShortlist(selected.status) : false;
  const aiWorkflowUnavailable = jobIsClosed || applicationSettledForAi;
  const selectedAppliedAt = selected ? new Date(selected.application_datetime) : null;
  const selectedAppliedText =
    selectedAppliedAt && !Number.isNaN(selectedAppliedAt.getTime())
      ? selectedAppliedAt.toLocaleDateString()
      : "Unknown date";
  const externalResumeUrl = selected ? externalResumePreviewUrl(selected.resume_url) : null;
  const canPreviewResume = Boolean(resumeMeta?.resume_file_id || externalResumeUrl);
  const resumeFileName =
    resumeMeta?.resume_file_name ||
    (profile ? `${profile.first_name.toLowerCase()}_${profile.last_name.toLowerCase()}_resume.pdf` : "resume.pdf");
  const resumeSubtitle = resumeMetaLoading
    ? "Checking upload…"
    : resumeMeta?.resume_file_id
      ? resumeMeta.resume_content_type?.includes("pdf")
        ? "PDF · uploaded résumé"
        : `${resumeMeta.resume_content_type ?? "File"} · uploaded résumé`
      : externalResumeUrl
        ? "PDF · external link"
        : "No résumé file on file";

  const handlePreviewResume = useCallback(async () => {
    if (!selected) return;
    try {
      if (resumeMeta?.resume_file_id) {
        const { blob } = await downloadResumeFile(selected.member_id);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
        return;
      }
      if (externalResumeUrl) {
        window.open(externalResumeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("No résumé is available to preview for this candidate.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not load résumé preview.");
    }
  }, [selected, resumeMeta?.resume_file_id, externalResumeUrl]);

  const handleDownloadResume = useCallback(async () => {
    if (!selected) return;
    try {
      if (resumeMeta?.resume_file_id) {
        const { blob, fileName } = await downloadResumeFile(selected.member_id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.rel = "noopener";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (externalResumeUrl) {
        window.open(externalResumeUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("No résumé is available to download.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not download résumé.");
    }
  }, [selected, resumeMeta?.resume_file_id, externalResumeUrl]);

  const activeAi = selected ? aiByApplicationId[selected.application_id] : null;
  const aiScore = activeAi?.matchScore;

  useEffect(() => {
    if (!selected || !profile) return;
    const role = job?.title ?? "this opportunity";
    setDraftSubject(`Regarding your ${role} application`);
    setDraftMessage("");
    setIsEditingDraft(false);
    setAiError(null);
    const closed = (job?.status ?? "open") === "closed";
    const skipAi = applicationStatusSkipsAiShortlist(selected.status);
    if (closed || skipAi) {
      setAiLoading(false);
    } else {
      setAiLoading(!aiByApplicationId[selected.application_id]);
    }
    return undefined;
  }, [selected?.application_id, selected?.status, profile?.member_id, job?.title, job?.status]);

  useEffect(() => {
    if (!selected || !profile || !job) return;

    if (applicationStatusSkipsAiShortlist(selected.status)) {
      setAiLoading(false);
      setAiError(null);
      aiInFlightRef.current[selected.application_id] = false;
      setAiByApplicationId((current) => {
        if (!(selected.application_id in current)) return current;
        const next = { ...current };
        delete next[selected.application_id];
        return next;
      });
      return undefined;
    }

    if ((job.status ?? "open") === "closed") {
      setAiLoading(false);
      setAiError(null);
      return undefined;
    }

    if (aiByApplicationId[selected.application_id]) return;
    if (aiInFlightRef.current[selected.application_id]) return;

    if (!job.recruiter_id) {
      setAiError("Missing recruiter id; unable to request AI workflow.");
      setAiLoading(false);
      return;
    }
    let cancelled = false;
    // Same shapes as AIMatchingFlowPage → identical match_score from ai-service.
    const candidatePayload = memberToCandidateProfile(profile);
    const jobPayload = jobToPayload(job);

    setAiLoading(true);
    setAiError(null);
    aiInFlightRef.current[selected.application_id] = true;

    void (async () => {
      try {
        let recruiterDisplayName: string | undefined;
        try {
          const rec = await getRecruiter(job.recruiter_id);
          recruiterDisplayName = rec.name?.trim() || undefined;
        } catch {
          recruiterDisplayName = undefined;
        }
        const candidateDisplayName =
          `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || undefined;

        const queued = await startAgentWorkflow({
          recruiter_id: job.recruiter_id,
          candidate: candidatePayload,
          job: jobPayload,
          workflow_type: "shortlist_outreach",
          require_human_approval: true,
          candidate_display_name: candidateDisplayName,
          recruiter_display_name: recruiterDisplayName
        });
        const commandDone = await pollAiCommand(queued.command_id);
        if (cancelled) return;
        const traceId = commandDone.result?.trace_id as string | undefined;
        if (!traceId) throw new Error("AI trace id was not returned");
        const trace = await pollAiTrace(traceId);
        if (cancelled) return;
        if (trace.status === "failed" || trace.status === "rejected") {
          throw new Error(`AI workflow ${trace.status}`);
        }
        const match = trace.final_result?.match_result ?? {};
        const rawScore = Number(match.match_score);
        const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : null;
        if (score == null) {
          throw new Error("AI workflow completed without numeric match_score");
        }
        const skipped = Boolean((trace.final_result as { outreach_skipped?: boolean })?.outreach_skipped);
        const skipReason =
          typeof (trace.final_result as { outreach_skip_reason?: string })?.outreach_skip_reason === "string"
            ? (trace.final_result as { outreach_skip_reason: string }).outreach_skip_reason
            : "";
        const outreachRaw = skipped
          ? ""
          : String((trace.final_result?.outreach_draft as { message?: string })?.message ?? "");
        const candNmForDraft =
          (candidateDisplayName ?? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()) || "there";
        const recNmForDraft = (recruiterDisplayName ?? "").trim() || "Recruiting Team";
        const outreachMessage = skipped ? "" : sanitizeOutreachDraft(outreachRaw, candNmForDraft, recNmForDraft);
        const matchedSkills = Array.isArray(match.matched_skills) ? match.matched_skills.filter(Boolean) : [];
        const missingSkills = Array.isArray(match.missing_skills) ? match.missing_skills.filter(Boolean) : [];
        const steps = Array.isArray(trace.steps) ? trace.steps : [];
        const workflowSteps = steps.map(
          (step: { step_name?: string; status?: string; completed_at?: string; started_at?: string }) => {
            const st: "pending" | "running" | "completed" =
              step.status === "completed" ? "completed" : step.status === "running" ? "running" : "pending";
            return {
              label: step.step_name ?? "Step",
              status: st,
              time: step.completed_at || step.started_at || undefined
            };
          }
        );
        const recommendation = typeof match.recommendation === "string" ? match.recommendation : "";
        const rawConf = Number(match.confidence);
        const overlap = Number(match.overlap_score);
        const embed = Number(match.embedding_score);
        let confidenceFromApi: number | null = null;
        if (Number.isFinite(rawConf)) {
          confidenceFromApi = Math.max(0, Math.min(100, rawConf));
        } else if (Number.isFinite(overlap) && Number.isFinite(embed)) {
          confidenceFromApi = Math.max(0, Math.min(100, Math.round((overlap + embed) / 2)));
        }
        const assessment: AIAssessment = {
          traceId,
          matchScore: score,
          strongReasons: matchedSkills.slice(0, 5),
          topGaps: missingSkills.slice(0, 5),
          recommendation,
          reasoning: typeof match.reasoning === "string" ? match.reasoning : "",
          confidence: confidenceFromApi,
          workflowStatus: trace.status,
          workflowSteps,
          outreachMessage,
          outreachSkipped: skipped,
          outreachSkipReason: skipReason || undefined
        };
        if (cancelled) return;
        setAiByApplicationId((current) => ({ ...current, [selected.application_id]: assessment }));
        if (!cancelled) {
          if (outreachMessage) {
            setDraftMessage(outreachMessage);
          } else if (skipped) {
            setDraftMessage("");
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setAiError(error instanceof Error ? error.message : "AI analysis unavailable");
          setAiByApplicationId((current) => {
            const next = { ...current };
            delete next[selected.application_id];
            return next;
          });
        }
      } finally {
        aiInFlightRef.current[selected.application_id] = false;
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [aiByApplicationId, job, profile, selected, aiRetryTick]);

  const handleRetryAiAnalysis = () => {
    if (!selected) return;
    if (applicationStatusSkipsAiShortlist(selected.status)) {
      toast.error("AI matching is not available for rejected, withdrawn, or hired applications.");
      return;
    }
    if ((job?.status ?? "open") === "closed") {
      toast.error("AI matching is not available for closed job postings.");
      return;
    }
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
    if (activeAi.outreachSkipped) {
      toast.error("No outreach draft — match score is below the minimum for outreach.");
      return;
    }
    if ((job?.status ?? "open") === "closed") {
      toast.error("Cannot approve outreach for a closed job posting.");
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
        const rawNext = String(trace.final_result?.outreach_draft?.message ?? draftMessage);
        const candNm = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "there" : "there";
        const nextMessage = sanitizeOutreachDraft(rawNext, candNm, "Recruiting Team");
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
          <Badge className={cn(getStatusColor(job.status ?? "open"), "capitalize")}>{job.status ?? "open"}</Badge>
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
                <div
                  key={application.application_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(application)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(application);
                    }
                  }}
                  className={`w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition hover:border-[#c4d7ef] hover:bg-[#f7fbff] ${
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
                      <p className="min-w-0 truncate font-semibold text-[#1f2937]">
                        <Link
                          to={`/profile/${application.member_id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-[#1f2937] hover:text-[#0a66c2] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0a66c2]"
                        >
                          {memberProfilesById[application.member_id]
                            ? `${memberProfilesById[application.member_id].first_name} ${memberProfilesById[application.member_id].last_name}`
                            : `Member #${application.member_id}`}
                        </Link>
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
                </div>
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
              <CandidateHeader profile={profile} selected={selected} appliedText={selectedAppliedText} />
              <AIMatchCard
                loading={aiLoading && !aiWorkflowUnavailable}
                score={aiScore}
                confidence={activeAi?.confidence}
                strongReasons={activeAi?.strongReasons ?? []}
                topGaps={activeAi?.topGaps ?? []}
                reasoning={activeAi?.reasoning ?? ""}
                error={aiWorkflowUnavailable ? null : aiError}
                onRetry={handleRetryAiAnalysis}
                aiUnavailable={
                  jobIsClosed
                    ? "AI matching is not available while this job posting is closed."
                    : applicationSettledForAi
                      ? "AI matching is not run when this application is rejected, withdrawn, or hired."
                      : null
                }
              />
              <Card className="rounded-xl border border-gray-200 p-5 shadow-sm">
                <label className="text-sm font-semibold text-[#1f2937]" htmlFor="app-status">
                  Application status
                </label>
                <div className="mt-4 space-y-3">
                  <div className="relative">
                    <select
                      id="app-status"
                      className={cn(
                        "linkedin-input h-12 w-full appearance-none rounded-xl border border-[#d1d5db] bg-white px-4 pr-10 text-[20px] font-semibold capitalize leading-none shadow-sm",
                        selected.status === "rejected" ? "text-red-700" : "text-[#1f2937]"
                      )}
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
                  <div
                    className={cn(
                      "rounded-xl border px-5 py-4",
                      aiWorkflowUnavailable ? "border-[#e5e7eb] bg-[#f9fafb]" : "border-[#f3dfbf] bg-[#fff8ee]"
                    )}
                  >
                    {jobIsClosed ? (
                      <>
                        <p className="text-[15px] font-semibold text-[#6b7280]">
                          AI suggestions are unavailable for closed job postings.
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                          Reopen the job from Jobs if you need to run AI matching again.
                        </p>
                      </>
                    ) : applicationSettledForAi ? (
                      <>
                        <p className="text-[15px] font-semibold text-[#6b7280]">
                          <Sparkles className="mr-2 inline-block h-4 w-4 align-[-2px] text-[#9ca3af]" />
                          AI suggestions are not shown for this application status.
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                          Matching and outreach drafts are only generated for active pipeline stages. Change the status
                          back to an in-review stage if you need a fresh AI analysis.
                        </p>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
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
                        <p className="text-xs text-[#6b7280]">{resumeSubtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canPreviewResume ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handlePreviewResume()}
                            className="rounded-lg px-2 py-1.5 text-sm font-semibold text-[#2563eb] transition hover:bg-[#eff6ff]"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadResume()}
                            className="rounded-lg p-1.5 text-[#374151] transition hover:bg-gray-100"
                            aria-label="Download résumé"
                          >
                            <Download className="h-4 w-4" />
                          </button>
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
          <AIWorkflowPanel
            loading={aiLoading && !aiWorkflowUnavailable}
            aiSteps={activeAi?.workflowSteps}
            workflowStatus={activeAi?.workflowStatus}
            unavailableMessage={
              jobIsClosed
                ? "AI hiring assistant is unavailable while this job is closed."
                : applicationSettledForAi
                  ? "AI hiring assistant does not run for rejected, withdrawn, or hired applications."
                  : null
            }
          />
          <OutreachDraftPanel
            subject={draftSubject}
            message={draftMessage}
            editing={isEditingDraft}
            isApproving={approvingAi}
            canApprove={
              Boolean(activeAi?.traceId) &&
              !aiWorkflowUnavailable &&
              activeAi?.workflowStatus === "awaiting_approval" &&
              !activeAi?.outreachSkipped
            }
            skipNotice={activeAi?.outreachSkipped ? activeAi?.outreachSkipReason ?? null : null}
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
  appliedText
}: {
  profile: MemberProfile;
  selected: Application;
  appliedText: string;
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
            <h2 className="text-2xl font-semibold text-[#111827]">
              <Link
                to={`/profile/${profile.member_id}`}
                className="text-[#111827] hover:text-[#0a66c2] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#0a66c2]"
              >
                {fullName}
              </Link>
            </h2>
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
  reasoning,
  error,
  onRetry,
  aiUnavailable
}: {
  loading: boolean;
  score: number | null | undefined;
  confidence?: number | null;
  strongReasons: string[];
  topGaps: string[];
  reasoning?: string;
  error?: string | null;
  onRetry: () => void;
  aiUnavailable?: string | null;
}) {
  if (aiUnavailable) {
    return (
      <Card className="rounded-xl border border-gray-200 p-5 shadow-sm transition hover:shadow-md">
        <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">AI Match Score</div>
        <p className="text-sm leading-relaxed text-[#6b7280]">{aiUnavailable}</p>
      </Card>
    );
  }
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
  const alignmentHeading =
    numericScore == null
      ? "Match highlights"
      : numericScore >= 80
        ? "Why it's a strong match"
        : numericScore >= 60
          ? "Strengths for this role"
          : numericScore >= 35
            ? "Partial alignment"
            : "Why the match is weak";
  const reasoningTrim = (reasoning ?? "").trim();
  const dial =
    numericScore == null
      ? { ring: "border-gray-300", pct: "text-gray-800", sub: "text-gray-500" }
      : (() => {
          const ms = matchScoreStyles(numericScore);
          return { ring: ms.dialRing, pct: ms.dialPct, sub: ms.dialSub };
        })();
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
        <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-[6px] bg-white ${dial.ring}`}>
          <span className={`text-[28px] font-semibold leading-none ${dial.pct}`}>{numericScore == null ? (isScorePending ? "..." : "--") : `${Math.round(numericScore)}%`}</span>
          <span className={`mt-1 text-[11px] font-medium ${dial.sub}`}>{label}</span>
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
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">{alignmentHeading}</p>
                {strongReasons.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm text-[#374151]">
                    {strongReasons.map((reason) => (
                      <li key={reason} className="flex items-start gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                ) : reasoningTrim ? (
                  <p className="mt-2 text-sm leading-relaxed text-[#374151]">
                    {reasoningTrim.length > 560 ? `${reasoningTrim.slice(0, 560)}…` : reasoningTrim}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[#6b7280]">
                    {isScorePending ? "Waiting for AI match results…" : "No matched skills returned for this pairing."}
                  </p>
                )}
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
              <span>
                {displayConfidence == null
                  ? "—"
                  : `${Number.isInteger(displayConfidence) ? displayConfidence : displayConfidence.toFixed(1)}%`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-[#0a66c2] transition-all" style={{ width: `${displayConfidence ?? 0}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-[#9ca3af]">
              Based on overlap between required skills and résumé similarity signals.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AIWorkflowPanel({
  loading,
  aiSteps,
  workflowStatus,
  unavailableMessage
}: {
  loading: boolean;
  aiSteps?: Array<{ label: string; status: "pending" | "running" | "completed"; time?: string }>;
  workflowStatus?: string;
  unavailableMessage?: string | null;
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
      {unavailableMessage ? (
        <p className="mt-3 text-sm text-[#6b7280]">{unavailableMessage}</p>
      ) : (
        <>
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
                    <span className="truncate text-[#374151]">
                      {index + 1}. {step.label}
                    </span>
                    <span className="ml-2 shrink-0 text-[#6b7280] capitalize">
                      {step.status} {step.time ? `· ${step.time}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function OutreachDraftPanel({
  subject,
  message,
  editing,
  isApproving,
  canApprove,
  skipNotice,
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
  skipNotice?: string | null;
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
      {skipNotice ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{skipNotice}</p>
      ) : null}
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
