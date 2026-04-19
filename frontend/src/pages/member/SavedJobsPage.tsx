import { BookmarkX } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedJobs, unsaveJob } from "../../api/jobs";
import { JobCard } from "../../components/jobs/JobCard";
import { EmptyState } from "../../components/ui/EmptyState";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import type { Job } from "../../types/job";

export function SavedJobsPage() {
  const navigate = useNavigate();
  const userId = authStore((state) => state.userId);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    void getSavedJobs(userId).then((data) => {
      setJobs(data.jobs);
      setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <EmptyState
        icon={BookmarkX}
        title="No saved jobs yet"
        description="Jobs you save will appear here."
        actionLabel="Find jobs"
        onAction={() => navigate("/jobs")}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Saved jobs</h1>
        <div className="mt-2 flex gap-4 text-sm">
          <span className="border-b-2 border-brand pb-1 font-semibold text-brand">Saved</span>
          <button onClick={() => navigate("/applications")} className="text-text-secondary">
            Applied
          </button>
        </div>
      </div>
      {jobs.map((job) => (
        <JobCard
          key={job.job_id}
          job={job}
          saved
          onSave={() => {
            if (!userId) return;
            void unsaveJob(userId, job.job_id).then(() => setJobs((current) => current.filter((item) => item.job_id !== job.job_id)));
          }}
        />
      ))}
    </section>
  );
}
