import { Bookmark, Clock3, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import type { Job } from "../../types/job";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function JobCard({
  job,
  saved,
  onSave
}: {
  job: Job;
  saved?: boolean;
  onSave?: (job: Job) => void;
}) {
  return (
    <Card className="transition-shadow duration-150 hover:shadow-[0_0_0_1px_#0a66c2,0_2px_8px_rgba(10,102,194,.15)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-brand-light font-semibold text-brand">
            {(job.company_name ?? "Co").slice(0, 2).toUpperCase()}
          </div>
          <div className="space-y-1">
            <Link to={`/jobs/${job.job_id}`} className="text-base font-semibold text-text-primary hover:text-brand">
              {job.title}
            </Link>
            <p className="text-sm text-text-secondary">{job.company_name}</p>
            <p className="flex items-center gap-1 text-sm text-text-secondary">
              <MapPin className="h-4 w-4" />
              {job.location || "Location not listed"}
            </p>
            <div className="flex flex-wrap gap-2">
              {job.employment_type ? <Badge className="bg-slate-100 text-slate-700">{job.employment_type}</Badge> : null}
              <Badge className="bg-brand-light text-brand">{job.work_mode}</Badge>
              {job.status === "open" ? <Badge className="bg-emerald-100 text-success">Open</Badge> : null}
            </div>
          </div>
        </div>
        <Button variant="icon" onClick={() => onSave?.(job)} aria-label="Save job">
          <Bookmark className={`h-5 w-5 ${saved ? "fill-brand text-brand" : ""}`} />
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-text-tertiary">
        <span className="flex items-center gap-1">
          <Clock3 className="h-3.5 w-3.5" />
          {formatDate(job.posted_datetime)}
        </span>
        <span>{job.applicants_count ?? 0} applicants</span>
      </div>
    </Card>
  );
}
