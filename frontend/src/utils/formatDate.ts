import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function formatDate(value?: string | null, pattern = "MMM d, yyyy") {
  if (!value) return "N/A";
  return format(parseISO(value), pattern);
}

export function formatRelativeDate(value?: string | null) {
  if (!value) return "N/A";
  // Backward compatibility: older records may store naive ISO strings.
  // Treat them as UTC to avoid timezone-offset drift (e.g. always +7h/+8h).
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return `${formatDistanceToNowStrict(parseISO(normalized))} ago`;
}
