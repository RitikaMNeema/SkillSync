import api from "./axios";
import type { ApiResponse } from "../types/common";
import type {
  ClickMetric,
  FunnelMetric,
  GeoMetric,
  MemberDashboard,
  RecruiterDashboardMetric,
  SavedJobMetric,
  TopJobMetric
} from "../types/analytics";

export async function getTopJobs(month: string) {
  const response = await api.post<ApiResponse<TopJobMetric[]>>("/analytics/jobs/top", { month });
  return response.data.data;
}

export async function getLowTractionJobs() {
  const response = await api.post<ApiResponse<TopJobMetric[]>>("/analytics/jobs/lowTraction", {});
  return response.data.data;
}

export async function getJobClicks() {
  const response = await api.post<ApiResponse<ClickMetric[]>>("/analytics/jobs/clicks", {});
  return response.data.data;
}

export async function getSavedJobsTrend(period: "day" | "week") {
  const response = await api.post<ApiResponse<SavedJobMetric[]>>("/analytics/jobs/saves", { period });
  return response.data.data;
}

export async function getFunnel() {
  const response = await api.post<ApiResponse<FunnelMetric>>("/analytics/funnel", {});
  return response.data.data;
}

export async function getGeoDistribution() {
  const response = await api.post<ApiResponse<GeoMetric[]>>("/analytics/geo", {});
  return response.data.data;
}

export async function getMemberDashboard(member_id: number) {
  const response = await api.post<ApiResponse<MemberDashboard>>("/analytics/member/dashboard", { member_id });
  return response.data.data;
}

export async function getRecruiterDashboard(recruiter_id: number) {
  const response = await api.post<ApiResponse<RecruiterDashboardMetric[]>>("/analytics/recruiter/dashboard", {
    recruiter_id
  });
  return response.data.data;
}
