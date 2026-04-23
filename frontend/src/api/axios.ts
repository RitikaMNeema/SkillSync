import axios from "axios";
import { authStore } from "../context/AuthContext";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";
import type { ApiRequestError } from "../utils/getApiErrorMessage";

function isAuthCredentialRequest(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("/auth/login") || url.includes("/auth/register");
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api"
  // NOTE: intentionally no default Content-Type. axios auto-sets
  //   • application/json  for plain objects
  //   • multipart/form-data; boundary=... for FormData (browser sets boundary)
  // Hard-coding "application/json" here would strip the boundary on file uploads
  // and break multipart parsing on the server.
});

api.interceptors.request.use((config) => {
  const token =
    authStore.getState().token ??
    localStorage.getItem("linkedin_token") ??
    localStorage.getItem("skillsync_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.DEV && axios.isAxiosError(error)) {
      const cfg = error.config;
      console.error("[api:error]", {
        method: cfg?.method?.toUpperCase(),
        url: cfg?.baseURL != null ? `${cfg.baseURL}${cfg.url ?? ""}` : cfg?.url,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
    }
    if (error.response?.status === 401 && !isAuthCredentialRequest(error.config?.url)) {
      authStore.getState().logout();
      window.location.href = "/login";
    }
    const message = getApiErrorMessage(error);
    const text =
      message ||
      (axios.isAxiosError(error) ? error.message : null) ||
      "Something went wrong";
    const rejection = new Error(text) as ApiRequestError;
    if (axios.isAxiosError(error)) {
      rejection.status = error.response?.status;
      rejection.isNetworkError = !error.response && !!error.request;
    }
    return Promise.reject(rejection);
  }
);

export default api;
