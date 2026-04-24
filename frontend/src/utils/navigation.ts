import type { UserRole } from "../types/common";

export function getHomePath(role: UserRole | null) {
  if (role === "recruiter") return "/recruiter/dashboard";
  if (role === "member") return "/feed";
  return "/login";
}

export function getProfilePath(role: UserRole | null, userId: number | null) {
  if (userId) return `/profile/${userId}`;
  return getHomePath(role);
}
