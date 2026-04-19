import api from "./axios";
import type { ApiResponse } from "../types/common";
import type { MemberProfile, MemberSearchResponse } from "../types/member";

export async function getMember(member_id: number) {
  const response = await api.post<ApiResponse<MemberProfile>>("/members/get", { member_id });
  return response.data.data;
}

export async function createMember(payload: Partial<MemberProfile> & { member_id: number; first_name: string; last_name: string }) {
  const response = await api.post<ApiResponse<{ member_id: number }>>("/members/create", payload);
  return response.data.data;
}

export async function updateMember(payload: Partial<MemberProfile> & { member_id: number }) {
  const response = await api.post<ApiResponse<{ member_id: number; updated: boolean }>>("/members/update", payload);
  return response.data.data;
}

export async function searchMembers(payload: { keyword?: string; skill?: string; location?: string; page?: number }) {
  const response = await api.post<ApiResponse<MemberSearchResponse>>("/members/search", payload);
  return response.data.data;
}

export async function uploadResume(payload: { member_id: number; resume_url: string }) {
  const response = await api.post<ApiResponse<{ member_id: number; resume_url: string }>>("/members/uploadResume", payload);
  return response.data.data;
}

export async function getResume(member_id: number) {
  const response = await api.post<ApiResponse<{ member_id: number; resume_url: string }>>("/members/getResume", { member_id });
  return response.data.data;
}
