import { BriefcaseBusiness, Search } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { getSavedJobs, saveJob, searchJobs, unsaveJob } from "../../api/jobs";
import { JobCard } from "../../components/jobs/JobCard";
import { type JobFilterState, JobFilters } from "../../components/jobs/JobFilters";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { CardSkeleton } from "../../components/ui/Skeleton";
import { authStore } from "../../context/AuthContext";
import { useDebounce } from "../../hooks/useDebounce";
import type { Job } from "../../types/job";
import { Input } from "../../components/ui/Input";

const initialFilters: JobFilterState = {
  keyword: "",
  location: "",
  employment_type: "",
  work_mode: "",
  industry: "",
  seniority_level: ""
};

export function JobSearchPage() {
  const userId = authStore((state) => state.userId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(initialFilters);
  const debounced = useDebounce(filters, 300);
  const debouncedKey = JSON.stringify(debounced);
  const [page, setPage] = useState(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = {
      keyword: searchParams.get("keyword") ?? "",
      location: searchParams.get("location") ?? "",
      employment_type: searchParams.get("employment_type") ?? "",
      work_mode: searchParams.get("work_mode") ?? "",
      industry: searchParams.get("industry") ?? "",
      seniority_level: searchParams.get("seniority_level") ?? ""
    };
    // Only update if values actually changed to avoid an extra debounce cycle on mount
    setFilters((current: JobFilterState) =>
      Object.keys(next).every((k) => current[k as keyof JobFilterState] === next[k as keyof JobFilterState])
        ? current
        : next
    );
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKey]);

  function runSearch() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setSearchParams(params);
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    const filters = Object.fromEntries(
      Object.entries(debounced).filter(([, v]) => String(v ?? "").trim() !== "")
    ) as JobFilterState;
    void searchJobs({ ...filters, page })
      .then((data) => {
        setJobs(data.jobs);
        setTotal(data.total);
        setPageSize(data.page_size);
      })
      .catch(() => {
        setError("Could not load jobs.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [debounced, page]);

  useEffect(() => {
    if (!userId) return;
    void getSavedJobs(userId)
      .then((data) => setSavedIds(data.jobs.map((job: Job) => job.job_id)))
      .catch(() => {/* saved state is non-critical; silently ignore */});
  }, [userId]);

  async function toggleSave(job: Job) {
    if (!userId) return;
    const saved = savedIds.includes(job.job_id);
    const loadingToast = toast.loading(saved ? "Removing saved job..." : "Saving job...");
    try {
      if (saved) {
        await unsaveJob(userId, job.job_id);
        setSavedIds((current) => current.filter((id) => id !== job.job_id));
      } else {
        await saveJob(userId, job.job_id);
        setSavedIds((current) => [...current, job.job_id]);
      }
      toast.success(saved ? "Removed from saved jobs" : "Saved job", { id: loadingToast });
    } catch {
      toast.error("Could not update saved jobs", { id: loadingToast });
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-[60px] z-40 rounded-card bg-[#eef3f8] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={filters.keyword}
              onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
              className="border-0 bg-white pl-9"
              placeholder="Search jobs"
            />
          </div>
          <Input
            value={filters.location}
            onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
            className="border-0 bg-white"
            placeholder="Location"
          />
          <Button type="button" onClick={runSearch}>
            Search
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <JobFilters
          filters={filters}
          onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
          onReset={() => {
            setFilters(initialFilters);
            setSearchParams({});
          }}
        />
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
            <span>
              {total === 0
                ? "0 jobs"
                : `${Math.min((page - 1) * pageSize + 1, total)}–${Math.min((page - 1) * pageSize + jobs.length, total)} of ${total} jobs`}
            </span>
            <span>Most relevant</span>
          </div>
          {loading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : error ? (
            <Alert message={error} onRetry={() => setFilters((current) => ({ ...current }))} />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No jobs found yet"
              description="Try widening your search or load sample data so the jobs feed has listings to show."
              actionLabel="Reset filters"
              onAction={() => setFilters(initialFilters)}
            />
          ) : (
            <>
              {jobs.map((job) => (
                <JobCard key={job.job_id} job={job} saved={savedIds.includes(job.job_id)} onSave={toggleSave} />
              ))}
              {total > pageSize ? (
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-2 text-sm text-text-secondary">
                    Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page * pageSize >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
