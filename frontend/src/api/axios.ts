import axios from "axios";
import { authStore } from "../context/AuthContext";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";
import type { ApiRequestError } from "../utils/getApiErrorMessage";

function isAuthCredentialRequest(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("/auth/login") || url.includes("/auth/register");
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  // Paths like `/auth/login` must still go under `/api/...` for the Vite proxy / gateway.
  // Without this, axios treats a leading `/` as host-absolute and drops the baseURL path.
  allowAbsoluteUrls: false,
  // NOTE: intentionally no default Content-Type. axios auto-sets
  //   • application/json  for plain objects
  //   • multipart/form-data; boundary=... for FormData (browser sets boundary)
  // Hard-coding "application/json" here would strip the boundary on file uploads
  // and break multipart parsing on the server.
});

api.interceptors.request.use((config) => {
  // Axios can still resolve `baseURL: "/api"` + `url: "/auth/login"` as `/auth/login` (404 in dev).
  // Fold root-relative API paths under the base explicitly, then clear baseURL for this request.
  const base = typeof config.baseURL === "string" ? config.baseURL.replace(/\/$/, "") : "";
  const u = typeof config.url === "string" ? config.url : "";
  if (base && u.startsWith("/") && !u.startsWith("http") && !u.startsWith(`${base}/`)) {
    config.url = `${base}${u}`;
    config.baseURL = "";
  }

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
