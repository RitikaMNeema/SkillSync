import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

/**
 * Naive ISO datetimes from the API (e.g. Python `datetime.utcnow().isoformat()`)
 * must be treated as UTC. Append `Z` when no offset is present.
 */
export function normalizeIsoForParse(value: string): string {
  const v = value.trim();
  if (!v) return v;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return v;
  return `${v}Z`;
}

export function formatDate(value?: string | null, pattern = "MMM d, yyyy") {
  if (!value) return "N/A";
  const d = parseISO(normalizeIsoForParse(value));
  if (Number.isNaN(d.getTime())) return "N/A";
  return format(d, pattern);
}

export function formatRelativeDate(value?: string | null) {
  if (!value) return "N/A";
  const normalized = normalizeIsoForParse(value);
  const d = parseISO(normalized);
  if (Number.isNaN(d.getTime())) return "N/A";
  return `${formatDistanceToNowStrict(d)} ago`;
}

/** Relative age for feed posts (compact buckets). */
export function formatTimeAgo(isoString: string): string {
  const postTime = parseISO(normalizeIsoForParse(isoString));
  if (Number.isNaN(postTime.getTime())) return "N/A";
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - postTime.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return postTime.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: postTime.getFullYear() !== now.getFullYear() ? "numeric" : undefined
  });
}
