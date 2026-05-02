import { BriefcaseBusiness, MapPin, Search } from "lucide-react";
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
import { LeadingIconInput } from "../../components/ui/LeadingIconInput";

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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const next = {
      keyword: searchParams.get("keyword") ?? "",
      location: searchParams.get("location") ?? "",
      employment_type: searchParams.get("employment_type") ?? "",
      work_mode: searchParams.get("work_mode") ?? "",
      industry: searchParams.get("industry") ?? "",
      seniority_level: searchParams.get("seniority_level") ?? ""
    };
    const nextPage = Number(searchParams.get("page") ?? "1");
    setCurrentPage(Number.isFinite(nextPage) && nextPage > 0 ? nextPage : 1);
    // Only update if values actually changed to avoid an extra debounce cycle on mount
    setFilters((current: JobFilterState) =>
      Object.keys(next).every((k) => current[k as keyof JobFilterState] === next[k as keyof JobFilterState])
        ? current
        : next
    );
  }, [searchParams]);

  function runSearch() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    params.set("page", "1");
    setSearchParams(params);
  }

  function setPage(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    setSearchParams(params);
  }

  useEffect(() => {
    setLoading(true);
    setError("");
    void searchJobs({ ...debounced, page: currentPage })
      .then((data) => {
        setJobs(data.jobs);
        setTotalJobs(data.total ?? data.jobs.length);
        setPageSize(data.page_size ?? 10);
      })
      .catch(() => {
        setError("Could not load jobs.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [debounced, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debounced.keyword, debounced.location, debounced.employment_type, debounced.work_mode, debounced.industry, debounced.seniority_level]);

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
        <div className="grid min-w-0 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
          <LeadingIconInput
            Icon={Search}
            autoComplete="off"
            value={filters.keyword}
            onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
            aria-label="Search jobs by title, keyword, or company"
          />
          <LeadingIconInput
            Icon={MapPin}
            autoComplete="off"
            value={filters.location}
            onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
            aria-label="Location"
          />
          <Button type="button" className="!h-[46px] shrink-0 rounded-full px-6" onClick={runSearch}>
            Search
          </Button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <JobFilters
          filters={filters}
          onChange={(field, value) => setFilters((current) => ({ ...current, [field]: value }))}
          onReset={() => setFilters(initialFilters)}
        />
        <section className="space-y-3">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>{totalJobs} jobs</span>
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
              title="No jobs found"
              description="Try widening your search criteria."
              actionLabel="Reset filters"
              onAction={() => setFilters(initialFilters)}
            />
          ) : (
            <>
              {jobs.map((job) => <JobCard key={job.job_id} job={job} saved={savedIds.includes(job.job_id)} onSave={toggleSave} />)}
              {Math.ceil(totalJobs / pageSize) > 1 ? (
                <div className="flex items-center justify-center gap-2 pt-2">
                  {Array.from({ length: Math.ceil(totalJobs / pageSize) }, (_, idx) => idx + 1).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`h-8 min-w-8 rounded-full px-2 text-sm font-semibold ${page === currentPage ? "bg-[#0A66C2] text-white" : "text-text-secondary hover:bg-[#edf2f7]"}`}
                      onClick={() => setPage(page)}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
