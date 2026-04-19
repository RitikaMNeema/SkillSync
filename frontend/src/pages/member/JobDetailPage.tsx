import { Bookmark, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useParams } from "react-router-dom";
import { getJob, saveJob, trackJobView } from "../../api/jobs";
import { ApplyModal } from "../../components/jobs/ApplyModal";
import { RightSidebar } from "../../components/layout/Sidebar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Job } from "../../types/job";
import { formatDate } from "../../utils/formatDate";
import { formatSalary } from "../../utils/formatSalary";

export function JobDetailPage() {
  const { job_id } = useParams();
  const userId = authStore((state) => state.userId);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!job_id) {
      setJob(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void getJob(Number(job_id))
      .then((data) => {
        setJob(data);
        void trackJobView(data.job_id, userId ?? undefined).catch(() => undefined);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load job");
        setJob(null);
      })
      .finally(() => setLoading(false));
  }, [job_id, userId]);

  if (loading || !job) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card>
            {job.status === "closed" ? (
              <div className="mb-4 rounded-card bg-amber-100 px-4 py-3 text-sm text-amber-800">
                This job is no longer accepting applications
              </div>
            ) : null}
            <div className="flex items-start gap-4">
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded bg-brand-light text-2xl font-semibold text-brand">
                {(job.company_name ?? "Co").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{job.title}</h1>
                <p className="text-sm text-text-secondary">
                  {job.company_name} · {job.location} · {formatDate(job.posted_datetime)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.employment_type ? <Badge className="bg-slate-100 text-slate-700">{job.employment_type}</Badge> : null}
                  <Badge className="bg-brand-light text-brand">{job.work_mode}</Badge>
                  {job.seniority_level ? <Badge className="bg-slate-100 text-slate-700">{job.seniority_level}</Badge> : null}
                </div>
                <p className="mt-3 text-sm text-text-secondary">
                  {job.views_count ?? 0} views · {job.applicants_count ?? 0} applicants
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button disabled={job.status === "closed" || applied} onClick={() => setApplyOpen(true)}>
                {applied ? "Applied ✓" : "Apply"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!userId) return;
                  void saveJob(userId, job.job_id).then(() => toast.success("Saved"));
                }}
              >
                <Bookmark className="h-4 w-4" />
                Save
              </Button>
              <Button variant="secondary">
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-semibold">About the job</h2>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{job.description || "No description provided."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(job.skills_required ?? []).map((skill) => (
                <Badge key={skill} className="bg-brand-light text-brand">
                  {skill}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-sm font-semibold">{formatSalary(job.salary_min, job.salary_max)}</p>
          </Card>
        </div>
        <RightSidebar>
          <div className="space-y-4">
            <Card>
              <h3 className="text-lg font-semibold">About the company</h3>
              <p className="mt-2 text-sm text-text-secondary">{job.company_name}</p>
              <p className="text-sm text-text-secondary">{job.industry || "Industry not listed"}</p>
              <Button className="mt-4" variant="secondary">
                Follow
              </Button>
            </Card>
          </div>
        </RightSidebar>
      </div>
      <ApplyModal
        job={job}
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmitted={() => setApplied(true)}
      />
    </>
  );
}
