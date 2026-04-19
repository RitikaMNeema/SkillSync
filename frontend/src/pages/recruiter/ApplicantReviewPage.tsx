import { ArrowLeft, Download, Mail, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { addApplicationNote, getApplication, getApplicationsByJob, updateApplicationStatus } from "../../api/applications";
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

export function ApplicantReviewPage() {
  const { job_id } = useParams();
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!job_id) return;
    setPageLoading(true);
    setPageError(null);
    let cancelled = false;
    void Promise.all([getJob(Number(job_id)), getApplicationsByJob(Number(job_id))])
      .then(([jobData, appData]) => {
        if (cancelled) return;
        setJob(jobData);
        setApplications(appData.applications);
        setSelected(appData.applications[0] ?? null);
        setProfile(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPageError(error instanceof Error ? error.message : "Could not load job or applicants");
          setJob(null);
          setApplications([]);
          setSelected(null);
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
        <Link to="/recruiter/jobs" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to My Jobs
        </Link>
        <Card className="p-6">
          <p className="text-sm text-text-secondary">{pageError ?? "Job not found."}</p>
        </Card>
      </section>
    );
  }

  const filtered = applications.filter((application) =>
    `${application.member_id}`.toLowerCase().includes(search.toLowerCase())
  );

  const statusOptions = selected ? selectableApplicationStatuses(selected.status) : [];

  return (
    <section className="space-y-4">
      <Link to="/recruiter/jobs" className="inline-flex items-center gap-2 text-sm">
        <ArrowLeft className="h-4 w-4" />
        Back to My Jobs
      </Link>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <p className="text-sm text-text-secondary">{applications.length} applicants</p>
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
            {filtered.map((application) => (
              <button
                key={application.application_id}
                type="button"
                onClick={() => setSelected(application)}
                className={`w-full rounded-card border-l-4 px-3 py-3 text-left hover:bg-hover ${
                  selected?.application_id === application.application_id ? "border-l-brand bg-brand-light" : "border-l-transparent"
                }`}
              >
                <p className="font-semibold">Member #{application.member_id}</p>
                <p className="text-sm text-text-secondary">{application.status}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="p-6">
          {!selected || !profile ? (
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
                    {selected.member_id}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {profile.phone || "No phone"}
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
                  {selected.resume_url ? (
                    <a
                      href={selected.resume_url}
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
                  {selected.resume_url || "Resume URL not provided in this application."}
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
