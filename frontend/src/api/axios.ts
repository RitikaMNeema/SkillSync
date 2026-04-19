import axios from "axios";
import { authStore } from "../context/AuthContext";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  headers: {
    "Content-Type": "application/json"
  }
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
    if (error.response?.status === 401) {
      authStore.getState().logout();
      window.location.href = "/login";
    }
    const message = getApiErrorMessage(error);
    return Promise.reject(message ? new Error(message) : error);
  }
);

export default api;
