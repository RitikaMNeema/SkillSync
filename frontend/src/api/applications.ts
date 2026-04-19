import api from "./axios";
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
  return response.data.data;
}

export async function getApplication(application_id: number) {
  const response = await api.post<ApiResponse<Application>>("/applications/get", { application_id });
  return response.data.data;
}

export async function getApplicationsByJob(job_id: number, page = 1) {
  const response = await api.post<ApiResponse<ApplicationListResponse>>("/applications/byJob", { job_id, page });
  return response.data.data;
}

export async function getApplicationsByMember(member_id: number, page = 1) {
  const response = await api.post<ApiResponse<ApplicationListResponse>>("/applications/byMember", { member_id, page });
  return response.data.data;
}

export async function updateApplicationStatus(application_id: number, new_status: ApplicationStatus) {
  const response = await api.post<ApiResponse<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>>(
    "/applications/updateStatus",
    { application_id, new_status }
  );
  return response.data.data;
}

export async function addApplicationNote(application_id: number, recruiter_id: number, note_text: string) {
  const response = await api.post<ApiResponse<{ note_id: number; application_id: number }>>("/applications/addNote", {
    application_id,
    recruiter_id,
    note_text
  });
  return response.data.data;
}

export async function withdrawApplication(application_id: number) {
  const response = await api.post<ApiResponse<{ application_id: number; old_status: ApplicationStatus; new_status: ApplicationStatus }>>(
    "/applications/withdraw",
    { application_id }
  );
  return response.data.data;
}
