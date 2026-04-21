import { Eye, Pencil, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { createJob, deleteJob, getJobsByRecruiter, updateJob } from "../../api/jobs";
import { getApplicationsByJob } from "../../api/applications";
import { getMember } from "../../api/members";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Application } from "../../types/application";
import type { Job } from "../../types/job";
import { formatRelativeDate } from "../../utils/formatDate";
import { getStatusColor } from "../../utils/getStatusColor";

interface JobFormValues {
  company_id: number;
  title: string;
  work_mode: "remote" | "hybrid" | "onsite";
  description: string;
  seniority_level: string;
  employment_type: string;
  location: string;
  skills_required: string;
  salary_min: number;
  salary_max: number;
}

interface RecruiterApplicationRow {
  job: Job;
  application: Application;
}

export function JobManagementPage() {
  const recruiterId = authStore((state) => state.userId);
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const backToListPath = `/recruiter/jobs${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reviewingCountByJob, setReviewingCountByJob] = useState<Record<number, number>>({});
  const [applicationRows, setApplicationRows] = useState<RecruiterApplicationRow[]>([]);
  const [memberNameById, setMemberNameById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [workModeFilter, setWorkModeFilter] = useState<"all" | "remote" | "hybrid" | "onsite">("all");
  const jobTableColumns = "grid-cols-[minmax(220px,2.2fr)_minmax(130px,1fr)_minmax(110px,0.9fr)_minmax(90px,0.8fr)_minmax(110px,0.9fr)_minmax(240px,1.6fr)]";
  const pageTitle =
    focus === "active"
      ? "Active Jobs"
      : focus === "applicants"
        ? "Total Applicants"
        : focus === "new"
          ? "New This Week"
          : focus === "pending"
            ? "Pending Review"
            : "Job Postings";
  const { register, handleSubmit, reset } = useForm<JobFormValues>({
    defaultValues: { work_mode: "remote", company_id: 1, seniority_level: "mid" }
  });

  useEffect(() => {
    if (!recruiterId) return;
    void getJobsByRecruiter(recruiterId).then(async (data) => {
      setJobs(data.jobs);
      const rows = await Promise.all(
        data.jobs.map(async (job) => {
          try {
            const details = await getApplicationsByJob(job.job_id);
            return {
              job,
              applications: details.applications
            };
          } catch {
            return {
              job,
              applications: [] as Application[]
            };
          }
        })
      );
      const stats = rows.map((row) => [row.job.job_id, row.applications.filter((application) => application.status === "reviewing").length] as const);
      const flattenedRows = rows.flatMap((row) =>
        row.applications.map((application) => ({
          job: row.job,
          application
        }))
      );
      const uniqueMemberIds = [...new Set(flattenedRows.map((row) => row.application.member_id))];
      const memberEntries = await Promise.all(
        uniqueMemberIds.map(async (memberId) => {
          try {
            const profile = await getMember(memberId);
            const fullName = `${profile.first_name} ${profile.last_name}`.trim();
            return [memberId, fullName || `Member #${memberId}`] as const;
          } catch {
            return [memberId, `Member #${memberId}`] as const;
          }
        })
      );
      setReviewingCountByJob(Object.fromEntries(stats));
      setApplicationRows(flattenedRows);
      setMemberNameById(Object.fromEntries(memberEntries));
      setLoading(false);
    });
  }, [recruiterId]);

  const filteredJobs = useMemo(() => {
    if (focus === "active") return jobs.filter((job) => (job.status ?? "open") === "open");
    if (focus === "applicants") return jobs.filter((job) => (job.applicants_count ?? 0) > 0);
    if (focus === "new") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return jobs.filter((job) => {
        if (!job.posted_datetime) return false;
        return new Date(job.posted_datetime) >= weekAgo;
      });
    }
    if (focus === "pending") return jobs.filter((job) => (reviewingCountByJob[job.job_id] ?? 0) > 0);
    return jobs;
  }, [focus, jobs, reviewingCountByJob]);

  const filterMeta = useMemo(() => {
    if (!focus) return null;
    if (focus === "active") {
      return `${filteredJobs.length} active job${filteredJobs.length === 1 ? "" : "s"}`;
    }
    if (focus === "applicants") {
      const totalApplicants = filteredJobs.reduce((sum, job) => sum + (job.applicants_count ?? 0), 0);
      return `${filteredJobs.length} job${filteredJobs.length === 1 ? "" : "s"} with applicants (${totalApplicants} total applicants)`;
    }
    if (focus === "new") {
      const uniqueTitles = new Set(filteredJobs.map((job) => job.title.trim().toLowerCase())).size;
      return `${uniqueTitles} unique title${uniqueTitles === 1 ? "" : "s"} from ${filteredJobs.length} posting${filteredJobs.length === 1 ? "" : "s"} in last 7 days`;
    }
    const pendingCount = filteredJobs.reduce((sum, job) => sum + (reviewingCountByJob[job.job_id] ?? 0), 0);
    return `${filteredJobs.length} job${filteredJobs.length === 1 ? "" : "s"} with pending review (${pendingCount} reviewing applications)`;
  }, [focus, filteredJobs, reviewingCountByJob]);

  const filteredApplications = useMemo(() => {
    if (focus === "applicants") return applicationRows;
    if (focus === "pending") return applicationRows.filter((row) => row.application.status === "reviewing");
    return [];
  }, [focus, applicationRows]);
  const displayedJobs = useMemo(() => {
    if (focus !== "new") return filteredJobs.map((job) => ({ job, postingCount: 1 }));

    const grouped = new Map<string, { job: Job; postingCount: number }>();
    for (const job of filteredJobs) {
      const key = job.title.trim().toLowerCase();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { job, postingCount: 1 });
        continue;
      }

      const existingTime = existing.job.posted_datetime ? new Date(existing.job.posted_datetime).getTime() : 0;
      const incomingTime = job.posted_datetime ? new Date(job.posted_datetime).getTime() : 0;
      const baseJob = incomingTime >= existingTime ? job : existing.job;

      grouped.set(key, {
        job: {
          ...baseJob,
          applicants_count: (existing.job.applicants_count ?? 0) + (job.applicants_count ?? 0),
          views_count: (existing.job.views_count ?? 0) + (job.views_count ?? 0)
        },
        postingCount: existing.postingCount + 1
      });
    }

    return Array.from(grouped.values());
  }, [focus, filteredJobs]);
  const duplicateTitleMetaByJobId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const { job } of displayedJobs) {
      const key = job.title.trim().toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const meta: Record<number, { index: number; total: number }> = {};
    for (const { job } of displayedJobs) {
      const key = job.title.trim().toLowerCase();
      const nextIndex = (seen.get(key) ?? 0) + 1;
      seen.set(key, nextIndex);
      meta[job.job_id] = { index: nextIndex, total: totals.get(key) ?? 1 };
    }
    return meta;
  }, [displayedJobs]);

  async function onSubmit(values: JobFormValues) {
    if (!recruiterId) return;
    const title = values.title.trim();
    const employmentType = values.employment_type.trim();
    const location = values.location.trim();
    const description = values.description.trim();
    const salaryMin = Number(values.salary_min);
    const salaryMax = Number(values.salary_max);
    if (!title || !employmentType || !location || !description) {
      toast.error("Please fill title, employment type, location and description.");
      return;
    }
    if (salaryMin && salaryMax && salaryMin > salaryMax) {
      toast.error("Salary min cannot be greater than salary max.");
      return;
    }
    const loadingToast = toast.loading(editingJob ? "Updating job..." : "Posting job...");
    try {
      const payload = {
        title,
        description,
        work_mode: values.work_mode,
        seniority_level: values.seniority_level,
        employment_type: employmentType,
        location,
        skills_required: values.skills_required.split(",").map((skill) => skill.trim()).filter(Boolean),
        salary_min: salaryMin || undefined,
        salary_max: salaryMax || undefined
      };
      if (editingJob) {
        const updated = await updateJob({
          job_id: editingJob.job_id,
          ...payload
        });
        setJobs((current) => current.map((job) => (job.job_id === editingJob.job_id ? { ...job, ...updated } : job)));
      } else {
        const created = await createJob({
          company_id: values.company_id,
          recruiter_id: recruiterId,
          ...payload
        });
        setJobs((current) => [created, ...current]);
      }
      setEditingJob(null);
      setOpen(false);
      reset();
      toast.success(editingJob ? "Job updated" : "Job posted", { id: loadingToast });
    } catch {
      toast.error(editingJob ? "Could not update job" : "Could not create job", { id: loadingToast });
    }
  }

  function handleEditJob(job: Job) {
    setEditingJob(job);
    reset({
      company_id: job.company_id ?? 1,
      title: job.title,
      employment_type: job.employment_type ?? "",
      seniority_level: job.seniority_level ?? "mid",
      location: job.location ?? "",
      work_mode: job.work_mode ?? "remote",
      salary_min: Number(job.salary_min ?? 0),
      salary_max: Number(job.salary_max ?? 0),
      skills_required: Array.isArray(job.skills_required) ? job.skills_required.join(", ") : "",
      description: job.description ?? ""
    });
    setOpen(true);
  }

  async function handleDeleteJob(job: Job) {
    const confirmed = window.confirm(`Delete posting "${job.title}"?`);
    if (!confirmed) return;
    try {
      await deleteJob(job.job_id);
      setJobs((current) => current.filter((item) => item.job_id !== job.job_id));
      toast.success("Posting deleted");
    } catch {
      toast.error("Could not delete posting");
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{pageTitle}</h1>
        <Button
          onClick={() => {
            setEditingJob(null);
            reset({ work_mode: "remote", company_id: 1, seniority_level: "mid" });
            setOpen(true);
          }}
        >
          Post a job
        </Button>
      </div>
      {focus ? (
        <p className="text-sm text-text-secondary">
          Showing{" "}
          {focus === "active"
            ? "active jobs"
            : focus === "applicants"
              ? "jobs with applicants"
              : focus === "new"
                ? "jobs posted in the last 7 days"
                : "jobs with applications in reviewing status"}
          {filterMeta ? `: ${filterMeta}. ` : ". "}
          {focus !== "applicants" && focus !== "active" ? <Link to="/recruiter/jobs">Clear filter</Link> : null}
        </p>
      ) : null}
      {focus === "applicants" || focus === "pending" ? (
        <Card className="p-0">
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr] gap-4 border-b px-6 py-4 text-sm font-semibold text-text-secondary">
            <span>Applicant</span>
            <span>Job title</span>
            <span>Applied</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filteredApplications.map((row) => (
            <div
              key={row.application.application_id}
              className="grid min-h-14 grid-cols-[1fr_2fr_1fr_1fr_1fr] items-center gap-4 px-6 py-4 hover:bg-hover"
            >
              <span className="text-sm text-text-secondary">{memberNameById[row.application.member_id] ?? `Member #${row.application.member_id}`}</span>
              <Link
                to={`/recruiter/jobs/${row.job.job_id}/applicants`}
                state={{ from: backToListPath, fromLabel: focus === "applicants" ? "Back to Applicants" : "Back to Pending Review" }}
                className="font-semibold text-brand hover:underline"
              >
                {row.job.title}
              </Link>
              <span className="text-sm text-text-secondary">{formatRelativeDate(row.application.application_datetime)}</span>
              <Badge className={getStatusColor(row.application.status)}>{row.application.status}</Badge>
              <Link
                to={`/recruiter/jobs/${row.job.job_id}/applicants`}
                state={{ from: backToListPath, fromLabel: focus === "applicants" ? "Back to Applicants" : "Back to Pending Review" }}
                className="text-sm"
              >
                Review application
              </Link>
            </div>
          ))}
          {!filteredApplications.length ? (
            <div className="px-6 py-8 text-sm text-text-secondary">No applications found for this filter.</div>
          ) : null}
        </Card>
      ) : (
        <Card className="p-0">
          <div className="grid gap-3 border-b px-6 py-4 md:grid-cols-4">
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Search title, location, type..." />
            <select className="linkedin-input w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "open" | "closed")}>
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
            <select className="linkedin-input w-full" value={workModeFilter} onChange={(event) => setWorkModeFilter(event.target.value as "all" | "remote" | "hybrid" | "onsite")}>
              <option value="all">All work modes</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setKeyword("");
                setStatusFilter("all");
                setWorkModeFilter("all");
              }}
            >
              Clear search
            </Button>
          </div>
          <div className={`grid ${jobTableColumns} gap-4 border-b px-6 py-4 text-sm font-semibold text-text-secondary`}>
            <span>Job title</span>
            <span>Posted date</span>
            <span>Applicants</span>
            <span>Views</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {displayedJobs
            .filter(({ job }) => {
              const text = `${job.title} ${job.location ?? ""} ${job.employment_type ?? ""}`.toLowerCase();
              const matchesKeyword = keyword.trim() ? text.includes(keyword.trim().toLowerCase()) : true;
              const matchesStatus = statusFilter === "all" ? true : (job.status ?? "open") === statusFilter;
              const matchesWorkMode = workModeFilter === "all" ? true : job.work_mode === workModeFilter;
              return matchesKeyword && matchesStatus && matchesWorkMode;
            })
            .map(({ job, postingCount }) => (
            <div key={job.job_id} className={`grid min-h-14 ${jobTableColumns} items-center gap-4 px-6 py-4 hover:bg-hover`}>
              <Link
                to={`/recruiter/jobs/${job.job_id}/applicants`}
                state={{ from: backToListPath, fromLabel: "Back to Job Postings" }}
                className="min-w-0 font-semibold text-brand hover:underline"
              >
                {job.title}
                {duplicateTitleMetaByJobId[job.job_id]?.total > 1 && focus !== "new" ? (
                  <span className="ml-2 text-xs font-normal text-text-secondary">
                    ({duplicateTitleMetaByJobId[job.job_id].index})
                  </span>
                ) : null}
                {focus === "new" && postingCount > 1 ? (
                  <span className="ml-2 text-xs font-normal text-text-secondary">({postingCount} postings)</span>
                ) : null}
              </Link>
              <span className="whitespace-nowrap text-sm text-text-secondary">{formatRelativeDate(job.posted_datetime)}</span>
              <span className="whitespace-nowrap pl-1 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {job.applicants_count ?? 0}
                </span>
              </span>
              <span className="whitespace-nowrap pl-1 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {job.views_count ?? 0}
                </span>
              </span>
              <Badge className={getStatusColor(job.status ?? "open")}>{job.status ?? "open"}</Badge>
              <div className="flex items-center gap-2">
                <Link
                  to={`/recruiter/jobs/${job.job_id}/applicants`}
                  state={{ from: backToListPath, fromLabel: "Back to Job Postings" }}
                  className="text-sm"
                >
                  View applicants
                </Link>
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => handleEditJob(job)} title="Edit posting">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 px-2 text-xs text-[#cc1016] hover:bg-red-50"
                  onClick={() => void handleDeleteJob(job)}
                  title="Delete posting"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay px-4">
          <div className="w-full max-w-[720px] rounded-card bg-white shadow-modal">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-xl font-semibold">{editingJob ? "Update job post" : "Create a job post"}</h2>
              <Button
                type="button"
                variant="icon"
                onClick={() => setOpen(false)}
                aria-label="Close job post form"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form className="grid gap-4 px-6 py-5 md:grid-cols-2" onSubmit={handleSubmit((values) => void onSubmit(values))}>
              <Input {...register("company_id", { valueAsNumber: true })} placeholder="Company ID" />
              <Input {...register("title")} placeholder="Title" />
              <Input {...register("employment_type")} placeholder="Employment type" />
              <select className="linkedin-input w-full" {...register("seniority_level")}>
                <option value="intern">Intern</option>
                <option value="junior">Junior</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="staff">Staff</option>
                <option value="lead">Lead</option>
              </select>
              <Input {...register("location")} placeholder="Location" />
              <select className="linkedin-input w-full" {...register("work_mode")}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
              <Input {...register("salary_min", { valueAsNumber: true })} placeholder="Salary min" />
              <Input {...register("salary_max", { valueAsNumber: true })} placeholder="Salary max" />
              <div className="md:col-span-2">
                <Input {...register("skills_required")} placeholder="Skills required, comma separated" />
              </div>
              <div className="md:col-span-2">
                <Textarea {...register("description")} placeholder="Description" />
              </div>
              <div className="flex gap-3 md:col-span-2 md:justify-end">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingJob ? "Update job" : "Post job"}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
