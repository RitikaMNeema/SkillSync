import api from "./axios";
import { resolveCommandResult } from "./commands";
import type { ApiResponse } from "../types/common";
import type { RecruiterProfile, RecruiterSearchResponse } from "../types/recruiter";

export async function createRecruiter(
  payload: {
    recruiter_id: number;
    name: string;
    email: string;
    phone?: string;
    role?: string;
    access_level?: string;
    company?: {
      name: string;
      industry?: string;
      size?: string;
      location?: string;
    };
    company_id?: number;
  },
  authToken?: string
) {
  const response = await api.post<ApiResponse<RecruiterProfile>>("/recruiters/create", payload, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
  });
  return resolveCommandResult<RecruiterProfile>(response.data.data, "/recruiters/commandStatus");
}

export async function getRecruiter(recruiter_id: number) {
  const response = await api.post<ApiResponse<RecruiterProfile>>("/recruiters/get", { recruiter_id });
  return response.data.data;
}

/** Records a profile view for a recruiter profile (24h dedupe + self-view guard on server). */
export async function recordRecruiterProfileView(recruiter_id: number) {
  const response = await api.post<ApiResponse<{ recorded: boolean; reason?: string }>>("/recruiters/recordProfileView", {
    recruiter_id
  });
  return response.data.data;
}

export async function updateRecruiter(payload: Partial<RecruiterProfile> & { recruiter_id: number }) {
  const response = await api.post<ApiResponse<RecruiterProfile>>("/recruiters/update", payload);
  return resolveCommandResult<RecruiterProfile>(response.data.data, "/recruiters/commandStatus");
}

export async function searchRecruiters(payload: { name?: string; company?: string; industry?: string; page?: number }) {
  const response = await api.post<ApiResponse<RecruiterSearchResponse>>("/recruiters/search", payload);
  return response.data.data;
}

export async function uploadRecruiterProfilePhoto(recruiter_id: number, file: File) {
  const formData = new FormData();
  formData.append("recruiter_id", String(recruiter_id));
  formData.append("photo", file);
  const response = await api.post<
    ApiResponse<{ recruiter_id: number; profile_photo_url: string; profile_photo_file_id: string }>
  >("/recruiters/uploadPhoto", formData);
  return response.data.data;
}

export async function uploadRecruiterCoverPhoto(recruiter_id: number, file: File) {
  const formData = new FormData();
  formData.append("recruiter_id", String(recruiter_id));
  formData.append("photo", file);
  const response = await api.post<
    ApiResponse<{ recruiter_id: number; cover_photo_url: string; cover_photo_file_id: string }>
  >("/recruiters/uploadCover", formData);
  return response.data.data;
}

export async function deleteRecruiterCoverPhoto(recruiter_id: number) {
  const response = await api.post<ApiResponse<{ recruiter_id: number; deleted: boolean }>>("/recruiters/deleteCover", {
    recruiter_id
  });
  return resolveCommandResult<{ recruiter_id: number; deleted: boolean }>(
    response.data.data,
    "/recruiters/commandStatus"
  );
}
