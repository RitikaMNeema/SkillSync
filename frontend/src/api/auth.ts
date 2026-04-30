import api from "./axios";
import type { ApiResponse, UserRole } from "../types/common";

export interface RegisterPayload {
  email: string;
  password: string;
  role: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthPayload {
  user_id: number;
  role: UserRole;
  token?: string;
  email?: string;
}

export interface EmailExistsPayload {
  exists: boolean;
}

export async function login(payload: LoginPayload) {
  const response = await api.post<ApiResponse<AuthPayload>>("/auth/login", payload);
  return response.data.data;
}

export async function register(payload: RegisterPayload) {
  const response = await api.post<ApiResponse<AuthPayload>>("/auth/register", payload);
  return response.data.data;
}

export async function validateToken(token: string) {
  const response = await api.post<ApiResponse<AuthPayload>>("/auth/validate", { token });
  return response.data.data;
}

export async function logout() {
  const response = await api.post<ApiResponse<{ message: string }>>("/auth/logout", {});
  return response.data.data;
}

export async function checkEmailExists(email: string) {
  const response = await api.post<ApiResponse<EmailExistsPayload>>("/auth/email-exists", { email });
  return response.data.data;
}

export async function deleteAccount() {
  const response = await api.delete<ApiResponse<{ message: string }>>("/auth/me");
  return response.data.data;
}
