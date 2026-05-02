import { Bookmark, CircleCheck } from "lucide-react";
import type { Job } from "../../types/job";

function relativePosted(iso?: string) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffDays = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function logoInitial(company?: string) {
  const text = (company || "C").trim();
  return text.slice(0, 1).toUpperCase();
}

export function JobResultCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const posted = relativePosted(job.posted_datetime);
  const applicants = job.applicants_count ?? 0;
  return (
    <div className="flex items-start gap-3 border-t border-[#ebebeb] px-4 py-3 first:border-t-0">
      <button type="button" onClick={onOpen} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#e6f0ff] text-base font-semibold text-[#0a66c2]">
        {logoInitial(job.company_name)}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="text-left hover:underline">
          <p className="line-clamp-1 text-[1rem] font-semibold text-[#1f1f1f]">{job.title}</p>
        </button>
        <p className="line-clamp-1 text-sm text-[#1f1f1f]">{job.company_name || "Company"}</p>
        <p className="line-clamp-1 text-sm text-[#666]">{job.location || "Location not specified"}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#057642]">
          <CircleCheck className="h-3.5 w-3.5" />
          Actively recruiting
        </p>
        <p className="mt-1 text-xs text-[#666]">
          {posted || "Recently posted"} {applicants > 0 ? `· ${applicants} applicants` : ""}
        </p>
      </div>
      <button type="button" aria-label="Save job" className="rounded-full p-2 text-[#666] hover:bg-[#f3f2ef]">
        <Bookmark className="h-4 w-4" />
      </button>
    </div>
  );
}
