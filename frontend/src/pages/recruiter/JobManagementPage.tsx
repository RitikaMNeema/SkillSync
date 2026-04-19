import { Eye, Pencil, Users } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { createJob, getJobsByRecruiter, closeJob } from "../../api/jobs";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
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

export function JobManagementPage() {
  const recruiterId = authStore((state) => state.userId);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset } = useForm<JobFormValues>({
    defaultValues: { work_mode: "remote", company_id: 1 }
  });

  useEffect(() => {
    if (!recruiterId) return;
    void getJobsByRecruiter(recruiterId).then((data) => {
      setJobs(data.jobs);
      setLoading(false);
    });
  }, [recruiterId]);

  async function onSubmit(values: JobFormValues) {
    if (!recruiterId) return;
    const loadingToast = toast.loading("Posting job...");
    try {
      const created = await createJob({
        company_id: values.company_id,
        recruiter_id: recruiterId,
        title: values.title,
        description: values.description,
        work_mode: values.work_mode,
        seniority_level: values.seniority_level,
        employment_type: values.employment_type,
        location: values.location,
        skills_required: values.skills_required.split(",").map((skill) => skill.trim()).filter(Boolean),
        salary_min: Number(values.salary_min),
        salary_max: Number(values.salary_max)
      });
      setJobs((current) => [created, ...current]);
      setOpen(false);
      reset();
      toast.success("Job posted", { id: loadingToast });
    } catch {
      toast.error("Could not create job", { id: loadingToast });
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
        <h1 className="text-2xl font-bold">Job Postings</h1>
        <Button onClick={() => setOpen(true)}>Post a job</Button>
      </div>
      <Card className="p-0">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 border-b px-6 py-4 text-sm font-semibold text-text-secondary">
          <span>Job title</span>
          <span>Posted date</span>
          <span>Applicants</span>
          <span>Views</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {jobs.map((job) => (
          <div key={job.job_id} className="grid min-h-14 grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] items-center gap-4 px-6 py-4 hover:bg-hover">
            <Link to={`/recruiter/jobs/${job.job_id}/applicants`} className="font-semibold text-brand hover:underline">
              {job.title}
            </Link>
            <span className="text-sm text-text-secondary">{formatRelativeDate(job.posted_datetime)}</span>
            <span className="flex items-center gap-1 text-sm text-text-secondary">
              <Users className="h-4 w-4" />
              {job.applicants_count ?? 0}
            </span>
            <span className="flex items-center gap-1 text-sm text-text-secondary">
              <Eye className="h-4 w-4" />
              {job.views_count ?? 0}
            </span>
            <Badge className={getStatusColor(job.status ?? "open")}>{job.status ?? "open"}</Badge>
            <div className="flex items-center gap-2">
              <Link to={`/recruiter/jobs/${job.job_id}/applicants`} className="text-sm">
                View applicants
              </Link>
              <Button variant="icon">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="icon"
                onClick={() =>
                  void closeJob(job.job_id).then(() =>
                    setJobs((current) => current.map((item) => (item.job_id === job.job_id ? { ...item, status: "closed" } : item)))
                  )
                }
              >
                X
              </Button>
            </div>
          </div>
        ))}
      </Card>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay px-4">
          <div className="w-full max-w-[720px] rounded-card bg-white shadow-modal">
            <div className="border-b px-6 py-4">
              <h2 className="text-xl font-semibold">Create a job post</h2>
            </div>
            <form className="grid gap-4 px-6 py-5 md:grid-cols-2" onSubmit={handleSubmit((values) => void onSubmit(values))}>
              <Input {...register("company_id", { valueAsNumber: true })} placeholder="Company ID" />
              <Input {...register("title")} placeholder="Title" />
              <Input {...register("employment_type")} placeholder="Employment type" />
              <Input {...register("seniority_level")} placeholder="Seniority" />
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
                  Save as draft
                </Button>
                <Button type="submit">Post job</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
