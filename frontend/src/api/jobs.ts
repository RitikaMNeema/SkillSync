import api from "./axios";
import { resolveCommandResult } from "./commands";
import type { ApiResponse } from "../types/common";
import type { Job, JobListResponse } from "../types/job";

export async function searchJobs(payload: {
  keyword?: string;
  location?: string;
  employment_type?: string;
  work_mode?: string;
  industry?: string;
  seniority_level?: string;
  page?: number;
}) {
  const response = await api.post<ApiResponse<JobListResponse>>("/jobs/search", payload);
  return response.data.data;
}

export async function getJob(job_id: number) {
  const response = await api.post<ApiResponse<Job>>("/jobs/get", { job_id });
  return response.data.data;
}

export async function getJobsByRecruiter(recruiter_id: number, page = 1) {
  const response = await api.post<ApiResponse<JobListResponse>>("/jobs/byRecruiter", { recruiter_id, page });
  return response.data.data;
}

/** All pages — needed for recruiter dashboard charts and labels when postings exceed `page_size`. */
export async function getAllJobsByRecruiter(recruiter_id: number) {
  const jobs: Job[] = [];
  let page = 1;
  let total = Infinity;
  while (jobs.length < total) {
    const data = await getJobsByRecruiter(recruiter_id, page);
    jobs.push(...data.jobs);
    total = data.total;
    if (data.jobs.length === 0 || data.jobs.length < data.page_size) break;
    page += 1;
  }
  return jobs;
}

export async function createJob(payload: Omit<Job, "job_id"> & { company_id: number; recruiter_id: number; title: string; work_mode: "remote" | "hybrid" | "onsite" }) {
  const response = await api.post<ApiResponse<Job>>("/jobs/create", payload);
  const raw = response.data?.data;
  if (raw === undefined || raw === null) {
    throw new Error("Unexpected response from job create");
  }
  return resolveCommandResult<Job>(raw, "/jobs/commandStatus", 30000);
}

export async function updateJob(payload: Partial<Job> & { job_id: number }) {
  const response = await api.post<ApiResponse<Job>>("/jobs/update", payload);
  const raw = response.data?.data;
  if (raw === undefined || raw === null) {
    throw new Error("Unexpected response from job update");
  }
  return resolveCommandResult<Job>(raw, "/jobs/commandStatus", 30000);
}

export async function closeJob(job_id: number) {
  const response = await api.post<ApiResponse<{ job_id: number; status: "closed" }>>("/jobs/close", { job_id });
  return resolveCommandResult<{ job_id: number; status: "closed" }>(response.data.data, "/jobs/commandStatus", 30000);
}

export async function deleteJob(job_id: number) {
  const response = await api.post<ApiResponse<{ job_id: number; deleted: boolean }>>("/jobs/delete", { job_id });
  return resolveCommandResult<{ job_id: number; deleted: boolean }>(response.data.data, "/jobs/commandStatus", 30000);
}

export async function saveJob(member_id: number, job_id: number) {
  const response = await api.post<ApiResponse<{ member_id: number; job_id: number; saved: boolean }>>("/jobs/save", { member_id, job_id });
  return resolveCommandResult<{ member_id: number; job_id: number; saved: boolean }>(
    response.data.data,
    "/jobs/commandStatus"
  );
}

export async function unsaveJob(member_id: number, job_id: number) {
  const response = await api.post<ApiResponse<{ member_id: number; job_id: number; saved: boolean }>>("/jobs/unsave", { member_id, job_id });
  return resolveCommandResult<{ member_id: number; job_id: number; saved: boolean }>(
    response.data.data,
    "/jobs/commandStatus"
  );
}

export async function getSavedJobs(member_id: number, page = 1) {
  const response = await api.post<ApiResponse<JobListResponse>>("/jobs/savedByMember", { member_id, page });
  return response.data.data;
}

export async function trackJobView(job_id: number, viewer_id?: number) {
  const response = await api.post<ApiResponse<{ job_id: number; tracked: boolean }>>("/jobs/trackView", { job_id, viewer_id });
  return resolveCommandResult<{ job_id: number; tracked: boolean }>(response.data.data, "/jobs/commandStatus");
}
