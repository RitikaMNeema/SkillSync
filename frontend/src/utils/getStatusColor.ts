import type { ApplicationStatus } from "../types/application";
import type { JobStatus } from "../types/job";

export function getStatusColor(status: ApplicationStatus | JobStatus) {
  switch (status) {
    case "submitted":
      return "bg-blue-100 text-blue-800";
    case "reviewing":
      return "bg-amber-100 text-review";
    case "interview":
      return "bg-violet-100 text-interview";
    case "offer":
      return "bg-emerald-100 text-success";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "withdrawn":
      return "bg-slate-100 text-slate-600";
    case "open":
      return "bg-emerald-100 text-success";
    case "closed":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
