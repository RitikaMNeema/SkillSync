import { BriefcaseBusiness, ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  seniority_level: ""
};

/** Compact page list: first/last, current ± neighbors, ellipses — avoids rendering hundreds of controls. */
function jobSearchPaginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 1) return [];
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total]);
  for (let d = -2; d <= 2; d++) {
    const p = current + d;
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("ellipsis");
    out.push(sorted[i]);
  }
  return out;
}

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
  }, [debounced.keyword, debounced.location, debounced.employment_type, debounced.work_mode, debounced.seniority_level]);

  useEffect(() => {
    if (!userId) return;
    void getSavedJobs(userId)
      .then((data) => setSavedIds(data.jobs.map((job: Job) => job.job_id)))
      .catch(() => {/* saved state is non-critical; silently ignore */});
  }, [userId]);

  const totalPages = Math.max(1, Math.ceil(totalJobs / Math.max(pageSize, 1)));
  const paginationItems = useMemo(
    () => jobSearchPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

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
            placeholder="Search jobs"
          />
          <LeadingIconInput
            Icon={MapPin}
            autoComplete="off"
            value={filters.location}
            onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))}
            aria-label="Location"
            placeholder="Location"
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
              {totalPages > 1 ? (
                <nav
                  className="relative z-10 flex flex-col items-center gap-3 border-t border-[#e4e6eb] pt-4 sm:flex-row sm:flex-wrap sm:justify-center"
                  aria-label="Job results pages"
                >
                  <p className="order-first text-sm text-text-secondary sm:order-none sm:mr-2">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-9 !min-h-0 !px-3 !py-0 !text-sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
                      Previous
                    </Button>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {paginationItems.map((item, idx) =>
                        item === "ellipsis" ? (
                          <span key={`e-${idx}`} className="px-1 text-sm text-text-secondary" aria-hidden>
                            …
                          </span>
                        ) : (
                          <button
                            key={item}
                            type="button"
                            aria-label={`Page ${item}`}
                            aria-current={item === currentPage ? "page" : undefined}
                            className={`h-9 min-w-9 rounded-full px-2 text-sm font-semibold transition-colors ${
                              item === currentPage
                                ? "bg-[#0A66C2] text-white"
                                : "text-text-secondary hover:bg-[#edf2f7]"
                            }`}
                            onClick={() => setPage(item)}
                          >
                            {item}
                          </button>
                        )
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-9 !min-h-0 !px-3 !py-0 !text-sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                      aria-label="Next page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Button>
                  </div>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
