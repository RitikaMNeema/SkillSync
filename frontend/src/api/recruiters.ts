import api from "./axios";
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
    };
    company_id?: number;
  },
  authToken?: string
) {
  const response = await api.post<ApiResponse<RecruiterProfile>>("/recruiters/create", payload, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
  });
  return response.data.data;
}

export async function getRecruiter(recruiter_id: number) {
  const response = await api.post<ApiResponse<RecruiterProfile>>("/recruiters/get", { recruiter_id });
  return response.data.data;
}

export async function searchRecruiters(payload: { name?: string; company?: string; industry?: string; page?: number }) {
  const response = await api.post<ApiResponse<RecruiterSearchResponse>>("/recruiters/search", payload);
  return response.data.data;
}
