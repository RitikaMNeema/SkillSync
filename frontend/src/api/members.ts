import api from "./axios";
import type { ApiResponse } from "../types/common";
import type { LanguageEntry, MemberProfile, MemberSearchResponse } from "../types/member";

export async function getMember(member_id: number) {
  const response = await api.post<ApiResponse<MemberProfile>>("/members/get", { member_id });
  return response.data.data;
}

export async function createMember(
  payload: Partial<MemberProfile> & { member_id: number; first_name: string; last_name: string; headline: string },
  authToken?: string
) {
  const response = await api.post<ApiResponse<{ member_id: number }>>("/members/create", payload, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
  });
  return response.data.data;
}

export async function updateMember(
  payload: Partial<MemberProfile> & {
    member_id: number;
    about?: string | null;
    summary?: string | null;
    freeform_experience?: unknown;
    open_to?: string | null;
    profile_language?: string | null;
    birthday?: string | null;
    website?: string | null;
    languages?: LanguageEntry[] | null;
    followed_skills?: string[] | null;
  }
) {
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

export interface ResumeMeta {
  member_id: number;
  resume_file_id: string;
  resume_file_name: string;
  resume_content_type: string;
  resume_uploaded_at: string | null;
}

export async function uploadProfilePhoto(member_id: number, file: File) {
  if (import.meta.env.DEV) {
    console.debug("[upload:photo] start", {
      member_id,
      fileName: file.name,
      type: file.type,
      size: file.size
    });
  }
  const formData = new FormData();
  formData.append("member_id", String(member_id));
  formData.append("photo", file);
  // Let axios + the browser set the multipart boundary automatically.
  const response = await api.post<
    ApiResponse<{ member_id: number; profile_photo_url: string; profile_photo_file_id: string }>
  >("/members/uploadPhoto", formData);
  if (import.meta.env.DEV) {
    console.debug("[upload:photo] ok", response.data);
  }
  return response.data.data;
}

export async function uploadCoverPhoto(member_id: number, file: File) {
  const formData = new FormData();
  formData.append("member_id", String(member_id));
  formData.append("photo", file);
  const response = await api.post<
    ApiResponse<{ member_id: number; cover_photo_url: string; cover_photo_file_id: string }>
  >("/members/uploadCover", formData);
  return response.data.data;
}

export async function deleteCoverPhoto(member_id: number) {
  const response = await api.post<ApiResponse<{ member_id: number; deleted: boolean }>>("/members/deleteCover", {
    member_id
  });
  return response.data.data;
}

export async function uploadResumeFile(member_id: number, file: File) {
  if (import.meta.env.DEV) {
    console.debug("[upload:resume] start", {
      member_id,
      fileName: file.name,
      type: file.type,
      size: file.size
    });
  }
  const formData = new FormData();
  formData.append("member_id", String(member_id));
  formData.append("resume", file);
  const response = await api.post<ApiResponse<ResumeMeta>>("/members/uploadResumeFile", formData);
  if (import.meta.env.DEV) {
    console.debug("[upload:resume] ok", response.data);
  }
  return response.data.data;
}

export async function getResumeMeta(member_id: number) {
  const response = await api.post<ApiResponse<ResumeMeta | null>>("/members/resumeMeta", { member_id });
  return response.data.data;
}

export async function deleteResume(member_id: number) {
  const response = await api.post<ApiResponse<{ member_id: number; deleted: boolean }>>(
    "/members/deleteResume",
    { member_id }
  );
  return response.data.data;
}

function parseDownloadFilename(contentDisposition?: string): string | null {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (asciiMatch?.[1]) return asciiMatch[1];
  return null;
}

export async function downloadResumeFile(member_id: number): Promise<{ blob: Blob; fileName: string }> {
  const response = await api.get(`/members/resume/${member_id}/file`, { responseType: "blob" });
  const contentType = response.headers["content-type"] || "application/octet-stream";
  const blob = new Blob([response.data], { type: contentType });
  const contentDisposition = response.headers["content-disposition"];
  const fileName = parseDownloadFilename(contentDisposition) || `resume_${member_id}`;
  return { blob, fileName };
}
