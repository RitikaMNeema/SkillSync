import api from "./axios";
import { resolveCommandResult } from "./commands";
import type { ApiResponse } from "../types/common";
import type { Application, ApplicationListResponse, ApplicationStatus } from "../types/application";

export async function submitApplication(payload: {
  job_id: number;
  member_id: number;
  resume_url?: string | null;
  cover_letter?: string | null;
  answers?: Record<string, string>;
}) {
  const response = await api.post<ApiResponse<{ application_id: number; job_id: number; member_id: number; status: ApplicationStatus }>>(
    "/applications/submit",
    payload
  );
  return resolveCommandResult<{ application_id: number; job_id: number; member_id: number; status: ApplicationStatus }>(
    response.data.data,
    "/applications/commandStatus"
  );
}

export async function getApplication(application_id: number) {
  const response = await api.post<ApiResponse<Application>>("/applications/get", { application_id });
  return response.data.data;
}

export async function getApplicationsByJob(job_id: number, page = 1) {
  const response = await api.post<ApiResponse<ApplicationListResponse>>("/applications/byJob", { job_id, page });
  return response.data.data;
}

/** Every page for this job (review UI must not cap at first `page_size`). */
export async function getAllApplicationsByJob(job_id: number) {
  const applications: Application[] = [];
  let page = 1;
  let total = Infinity;
  let pageSize = 20;
  while (applications.length < total) {
    const data = await getApplicationsByJob(job_id, page);
    applications.push(...data.applications);
    total = data.total;
    pageSize = data.page_size;
    if (data.applications.length === 0 || data.applications.length < pageSize) break;
    page += 1;
  }
  return { applications, total };
}

export async function getApplicationsByMember(member_id: number, page = 1) {
  const response = await api.post<ApiResponse<ApplicationListResponse>>("/applications/byMember", { member_id, page });
  return response.data.data;
}

/** All pages for this member (profile / job detail must not cap at first `page_size`). */
export async function getAllApplicationsByMember(member_id: number) {
  const applications: Application[] = [];
  let page = 1;
  let total = Infinity;
  let pageSize = 20;
  while (applications.length < total) {
    const data = await getApplicationsByMember(member_id, page);
    applications.push(...data.applications);
    total = data.total;
    pageSize = data.page_size;
    if (data.applications.length === 0 || data.applications.length < pageSize) break;
    page += 1;
  }
  return { applications, total };
}

export async function updateApplicationStatus(application_id: number, new_status: ApplicationStatus) {
  const response = await api.post<ApiResponse<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>>(
    "/applications/updateStatus",
    { application_id, new_status }
  );
  return resolveCommandResult<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>(
    response.data.data,
    "/applications/commandStatus"
  );
}

export async function addApplicationNote(application_id: number, recruiter_id: number, note_text: string) {
  const response = await api.post<ApiResponse<{ note_id: number; application_id: number }>>("/applications/addNote", {
    application_id,
    recruiter_id,
    note_text
  });
  return resolveCommandResult<{ note_id: number; application_id: number }>(
    response.data.data,
    "/applications/commandStatus"
  );
}

export async function withdrawApplication(application_id: number) {
  const response = await api.post<ApiResponse<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>>(
    "/applications/withdraw",
    { application_id }
  );
  return resolveCommandResult<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>(
    response.data.data,
    "/applications/commandStatus"
  );
}
