import { ArrowLeft, Download, Mail, Phone } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { addApplicationNote, getApplication, getAllApplicationsByJob, updateApplicationStatus } from "../../api/applications";
import { getJob } from "../../api/jobs";
import { getMember } from "../../api/members";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import type { Application, ApplicationStatus } from "../../types/application";
import type { Job } from "../../types/job";
import type { MemberProfile } from "../../types/member";
import { selectableApplicationStatuses } from "../../utils/applicationStatus";
import { getStatusColor } from "../../utils/getStatusColor";

const STATUS_LEGEND: ApplicationStatus[] = ["submitted", "reviewing", "interview", "offer", "rejected", "withdrawn"];

function resolveResumeUrl(resumeUrl?: string | null): string | null {
  if (!resumeUrl) return null;
  const trimmed = resumeUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "example.com") {
      // Seed data may carry placeholder URLs; point to a real local sample resume.
      return "/resumes/sample_resume.txt";
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
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
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
    if (!keyword) return applications;
    return applications.filter((application) => {
      const member = memberProfilesById[application.member_id];
      const fullName = member ? `${member.first_name} ${member.last_name}`.trim().toLowerCase() : "";
      return (
        fullName.includes(keyword) ||
        `${application.member_id}`.includes(keyword) ||
        application.status.toLowerCase().includes(keyword)
      );
    });
  }, [applications, memberProfilesById, search]);

  const statusOptions = selected ? selectableApplicationStatuses(selected.status) : [];
  const selectedEmail = "";
  const selectedPhone = (profile?.phone ?? "").trim();
  const openResumeUrl = resolveResumeUrl(selected?.resume_url);

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
      <div className="grid gap-0 overflow-hidden rounded-card border bg-white lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-r p-4">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="border-0 bg-[#eef3f8]" placeholder="Search applicants" />
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_LEGEND.map((status) => (
              <Badge key={status} className="bg-hover text-text-secondary">
                {status}
              </Badge>
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
                  className={`w-full rounded-card border-l-4 px-3 py-3 text-left hover:bg-hover ${
                    selected?.application_id === application.application_id ? "border-l-brand bg-brand-light" : "border-l-transparent"
                  }`}
                >
                  <p className="font-semibold">
                    {memberProfilesById[application.member_id]
                      ? `${memberProfilesById[application.member_id].first_name} ${memberProfilesById[application.member_id].last_name}`
                      : `Member #${application.member_id}`}
                  </p>
                  <p className="text-sm text-text-secondary">{application.status}</p>
                </button>
              ))
            )}
            {applications.length > 0 && filtered.length === 0 ? (
              <p className="text-center text-sm text-text-secondary">No applicants match your search.</p>
            ) : null}
          </div>
        </div>
        <div className="p-6">
          {applications.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 px-4 text-center text-text-secondary">
              <p className="text-sm">There is nothing to review until the first application arrives.</p>
              <p className="text-xs">Share the job in Job Search or have a member apply from their account to populate this view.</p>
            </div>
          ) : !selected || !profile ? (
            <div className="flex min-h-[360px] items-center justify-center text-text-secondary">Select an applicant</div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">
                  {profile.first_name} {profile.last_name}
                </h2>
                <p className="text-sm text-text-secondary">{profile.headline}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {selectedEmail ? (
                      <a href={`mailto:${selectedEmail}`} className="text-brand hover:underline">
                        {selectedEmail}
                      </a>
                    ) : (
                      "No email"
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {selectedPhone ? (
                      <a href={`tel:${selectedPhone}`} className="text-brand hover:underline">
                        {selectedPhone}
                      </a>
                    ) : (
                      "No phone"
                    )}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-sm font-semibold" htmlFor="app-status">
                  Application status:
                </label>
                <select
                  id="app-status"
                  className="linkedin-input w-full max-w-xs sm:w-52"
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
              </div>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Resume</h3>
                  {openResumeUrl ? (
                    <a
                      href={openResumeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-brand"
                    >
                      <Download className="h-4 w-4" />
                      Open
                    </a>
                  ) : (
                    <span className="text-sm text-text-secondary">No URL</span>
                  )}
                </div>
                <div className="mt-3 max-h-[300px] overflow-y-auto rounded-input border bg-hover p-4 font-mono text-sm">
                  {openResumeUrl || "Resume URL not provided in this application."}
                </div>
              </Card>
              <div>
                <h3 className="mb-3 font-semibold">Recruiter notes</h3>
                <div className="space-y-2">
                  {(selected.notes ?? []).map((item) => (
                    <Card key={item.id} className="p-4">
                      <p className="text-sm text-text-secondary">{item.note_text}</p>
                    </Card>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note" className="min-h-[100px] flex-1" />
                  <Button
                    className="self-start"
                    onClick={() => {
                      const rid = job.recruiter_id ?? 0;
                      if (!rid) {
                        toast.error("Missing recruiter id on job");
                        return;
                      }
                      void addApplicationNote(selected.application_id, rid, note)
                        .then(async () => {
                          toast.success("Note added");
                          setNote("");
                          const detail = await getApplication(selected.application_id);
                          setSelected(detail);
                        })
                        .catch((error: unknown) => {
                          toast.error(error instanceof Error ? error.message : "Could not add note");
                        });
                    }}
                  >
                    Add note
                  </Button>
                </div>
              </div>
              <p className="text-sm text-text-secondary">AI hiring assistant is not wired in this build (core hiring flows only).</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
