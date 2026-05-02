import type { UserRole } from "../types/common";

export function getHomePath(role: UserRole | null) {
  if (role === "recruiter") return "/feed";
  if (role === "member") return "/feed";
  return "/login";
}

/** Primary Jobs entry in the nav: recruiters manage postings; members browse listings. */
export function getJobsNavPath(role: UserRole | null) {
  if (role === "recruiter") return "/recruiter/jobs";
  return "/jobs";
}

export function getProfilePath(role: UserRole | null, userId: number | null) {
  if (userId) return `/profile/${userId}`;
  return getHomePath(role);
}
