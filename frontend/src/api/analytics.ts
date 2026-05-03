import api from "./axios";
import type { ApiResponse } from "../types/common";
import type {
  ClickMetric,
  FunnelMetric,
  GeoMetric,
  MemberDashboard,
  RecruiterDashboardMetric,
  RecruiterProfileDashboard,
  SavedJobMetric,
  TopJobMetric
} from "../types/analytics";

export async function getTopJobs(month: string, recruiter_id?: number) {
  const response = await api.post<ApiResponse<TopJobMetric[]>>("/analytics/jobs/top", { month, recruiter_id });
  return response.data.data;
}

export async function getLowTractionJobs(month: string, recruiter_id?: number) {
  const response = await api.post<ApiResponse<TopJobMetric[]>>("/analytics/jobs/lowTraction", { month, recruiter_id });
  return response.data.data;
}

export async function getJobClicks(month?: string, recruiter_id?: number) {
  const response = await api.post<ApiResponse<ClickMetric[]>>("/analytics/jobs/clicks", { month, recruiter_id });
  return response.data.data;
}

export async function getSavedJobsTrend(period: "day" | "week", month?: string, recruiter_id?: number) {
  const response = await api.post<ApiResponse<SavedJobMetric[]>>("/analytics/jobs/saves", { period, month, recruiter_id });
  return response.data.data;
}

export async function getFunnel() {
  const response = await api.post<ApiResponse<FunnelMetric>>("/analytics/funnel", {});
  return response.data.data;
}

export async function getGeoDistribution(month?: string, recruiter_id?: number, job_id?: string) {
  const response = await api.post<ApiResponse<GeoMetric[]>>("/analytics/geo", { month, recruiter_id, job_id });
  return response.data.data;
}

export async function getMemberDashboard(member_id: number) {
  const response = await api.post<ApiResponse<MemberDashboard>>("/analytics/member/dashboard", { member_id });
  return response.data.data;
}

export async function getRecruiterDashboard(recruiter_id: number, month?: string) {
  const payload: { recruiter_id: number; month?: string } = { recruiter_id };
  if (month) payload.month = month;
  const response = await api.post<ApiResponse<RecruiterDashboardMetric[]>>("/analytics/recruiter/dashboard", payload);
  return response.data.data;
}

export async function getRecruiterProfileDashboard(recruiter_id: number) {
  const response = await api.post<ApiResponse<RecruiterProfileDashboard>>("/analytics/recruiter/profileDashboard", {
    recruiter_id
  });
  return response.data.data;
}

export async function getRecruiterEventCounts(month?: string, recruiter_id?: number, job_id?: string) {
  const response = await api.post<ApiResponse<RecruiterDashboardMetric[]>>("/analytics/debug/eventCounts", {
    month,
    recruiter_id,
    job_id
  });
  return response.data.data;
}
