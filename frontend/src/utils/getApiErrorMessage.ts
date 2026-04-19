import axios from "axios";

/**
 * Extract a user-facing message from axios / API error responses.
 * Supports our API `{ success, error }` and FastAPI `{ detail }` shapes.
 */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data.error === "string" && data.error) return data.error;
      const detail = data.detail;
      if (typeof detail === "string" && detail) return detail;
      if (Array.isArray(detail)) {
        const parts = detail.map((item) => {
          if (item && typeof item === "object" && "msg" in item) return String((item as { msg: string }).msg);
          return JSON.stringify(item);
        });
        if (parts.length) return parts.join("; ");
      }
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
