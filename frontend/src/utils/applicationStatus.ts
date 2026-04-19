import type { ApplicationStatus } from "../types/application";

/** Mirrors backend `application_service.models.application.VALID_TRANSITIONS`. */
export const VALID_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["reviewing", "rejected", "withdrawn"],
  reviewing: ["interview", "rejected", "withdrawn"],
  interview: ["offer", "rejected", "withdrawn"],
  offer: ["rejected", "withdrawn"],
  rejected: [],
  withdrawn: []
};

/** Status values allowed in the recruiter status dropdown for the current application state. */
export function selectableApplicationStatuses(current: ApplicationStatus): ApplicationStatus[] {
  const next = VALID_STATUS_TRANSITIONS[current] ?? [];
  return Array.from(new Set<ApplicationStatus>([current, ...next]));
}
