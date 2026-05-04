import type { ApplicationStatus } from "../types/application";

/** Mirrors backend `application_service.models.application.VALID_TRANSITIONS`. */
export const VALID_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["reviewing", "rejected", "withdrawn", "hired"],
  reviewing: ["interview", "rejected", "withdrawn", "hired"],
  interview: ["offer", "rejected", "withdrawn", "hired"],
  offer: ["rejected", "withdrawn", "hired"],
  hired: [],
  rejected: [],
  withdrawn: []
};

/** Status values allowed in the recruiter status dropdown for the current application state. */
export function selectableApplicationStatuses(current: ApplicationStatus): ApplicationStatus[] {
  const next = VALID_STATUS_TRANSITIONS[current] ?? [];
  return Array.from(new Set<ApplicationStatus>([current, ...next]));
}

/**
 * Shortlist / match / outreach AI should not run once the application is no longer active in the pipeline.
 * (Avoids wasted AI calls and confusing “analyzing” UI for rejected or otherwise settled applications.)
 */
export function applicationStatusSkipsAiShortlist(status: ApplicationStatus): boolean {
  return status === "rejected" || status === "withdrawn" || status === "hired";
}
