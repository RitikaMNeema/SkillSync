import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function formatDate(value?: string | null, pattern = "MMM d, yyyy") {
  if (!value) return "N/A";
  return format(parseISO(value), pattern);
}

export function formatRelativeDate(value?: string | null) {
  if (!value) return "N/A";
  return `${formatDistanceToNowStrict(parseISO(value))} ago`;
}
