import axios from "axios";
import { authStore } from "../context/AuthContext";

/**
 * Base URL must be set per request in dev: at module load `window` may not exist yet,
 * which previously forced `http://localhost:3010` and caused axios "Network Error" for every AI call.
 * In dev we always use same-origin `/ai-service` (see vite.config.ts proxy → port 3010).
 */
const aiApi = axios.create({
  baseURL: "",
  allowAbsoluteUrls: false
});

aiApi.interceptors.request.use((config) => {
  const envOverride = import.meta.env.VITE_AI_API_BASE_URL;
  if (typeof envOverride === "string" && envOverride.trim()) {
    config.baseURL = envOverride.trim().replace(/\/$/, "");
  } else if (import.meta.env.DEV) {
    if (typeof window !== "undefined" && window.location?.origin) {
      config.baseURL = `${window.location.origin}/ai-service`.replace(/\/$/, "");
    } else {
      config.baseURL = "http://127.0.0.1:3010";
    }
  } else {
    /** Production / Docker nginx: same-origin `/ai-service` is proxied to ai-service :3010 (see nginx.conf.template). */
    config.baseURL = "/ai-service";
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

export type CandidateProfile = {
  member_id: number;
  headline?: string;
  summary?: string;
  skills?: string[];
  experiences?: string[];
  location?: string;
  education?: string[];
  /** Raw resume text extracted from the uploaded PDF / stored as plain text on the member profile. Primary input for the Resume Parser skill. */
  resume_text?: string;
};

export type JobPayload = {
  job_id: number;
  title: string;
  description?: string;
  skills_required?: string[];
  location?: string;
  seniority_level?: string;
  employment_type?: string;
};

export type AgentWorkflowRequest = {
  trace_id?: string | null;
  recruiter_id: number;
  candidate: CandidateProfile;
  job: JobPayload;
  workflow_type?: string;
  require_human_approval?: boolean;
  idempotency_key?: string | null;
  /** Used in outreach copy — full name preferred */
  candidate_display_name?: string | null;
  recruiter_display_name?: string | null;
  /**
   * When the UI already ran matching for this candidate/job, pass it so the workflow does not
   * re-run a second (non-deterministic) match that can dip below the outreach threshold.
   */
  match_result?: Record<string, unknown> | null;
};

export type ApprovalRequest = {
  trace_id: string;
  action: "approve" | "edit" | "reject";
  edited_message?: string | null;
  reviewer_id?: number | null;
};

export type GenericSuccessResponse<T> = {
  success: boolean;
  data: T;
};

export type CommandStatusResponse = {
  command_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  action: string;
  result?: any;
  error?: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
};

export type AgentStatusResponse = {
  trace_id: string;
  status: string;
  current_step?: string | null;
  requires_human_approval?: boolean;
  approval_status?: string | null;
  final_result?: any;
  steps?: any[];
};

export type AIMetricsResponse = {
  total_workflows: number;
  approval_rate: number;
  rejection_rate: number;
  edit_rate: number;
  completion_rate: number;
  average_match_score: number;
  recommendation_quality_score: number;
  high_fit_approval_rate: number;
  average_time_to_decision_seconds: number;
  fit_band_distribution: {
    high_fit: number;
    medium_fit: number;
    low_fit: number;
  };
};

export async function startAgentWorkflow(payload: AgentWorkflowRequest) {
  const { data } = await aiApi.post<
    GenericSuccessResponse<{
      command_id: string;
      status: string;
      action: string;
    }>
  >("ai/agent/request", payload);

  return data.data;
}

export async function approveAgentWorkflow(payload: ApprovalRequest) {
  const { data } = await aiApi.post<
    GenericSuccessResponse<{
      command_id: string;
      status: string;
      action: string;
    }>
  >("ai/agent/approve", payload);

  return data.data;
}

export async function getAgentStatus(traceId: string) {
  const { data } = await aiApi.get<GenericSuccessResponse<AgentStatusResponse>>(
    `ai/agent/status/${traceId}`
  );
  return data.data;
}

export async function getAICommandStatus(commandId: string) {
  const { data } = await aiApi.post<GenericSuccessResponse<CommandStatusResponse>>(
    "ai/command-status",
    {
      command_id: commandId,
    }
  );
  return data.data;
}

export async function getAIMetrics() {
  const { data } = await aiApi.get<GenericSuccessResponse<AIMetricsResponse>>("ai/metrics");
  return data.data;
}

/** Match-only command payload (mirrors `AIMatchRequest` in ai-service). */
export type AIMatchCommandPayload = {
  candidate: CandidateProfile;
  job: JobPayload;
};

/** Result shape from `compute_match` (see `match_controller.py`). */
export type AIMatchResult = {
  match_score: number;
  overlap_score?: number;
  embedding_score?: number;
  matched_skills: string[];
  missing_skills?: string[];
  reasoning?: string;
  seniority_fit?: string;
  location_fit?: string;
  recommendation?: string;
};

export async function enqueueMatchCommand(payload: AIMatchCommandPayload) {
  const { data } = await aiApi.post<
    GenericSuccessResponse<{
      command_id: string;
      status: string;
      action: string;
    }>
  >("ai/match", payload);
  return data.data;
}

export async function waitForAICommandResult(
  commandId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<unknown> {
  // Default: 150 attempts × 1.2 s = ~3 minutes.
  // Covers slow AWS Ollama (embedding + LLM can each take 20–25 s per candidate).
  const maxAttempts = options?.maxAttempts ?? 150;
  const intervalMs = options?.intervalMs ?? 1200;
  for (let i = 0; i < maxAttempts; i += 1) {
    const status = await getAICommandStatus(commandId);
    if (status.status === "completed") return status.result;
    if (status.status === "failed") {
      throw new Error(status.error || "AI command failed");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for AI command");
}

export async function runMatchAndWait(payload: AIMatchCommandPayload): Promise<AIMatchResult> {
  const { command_id } = await enqueueMatchCommand(payload);
  const result = await waitForAICommandResult(command_id);
  return result as AIMatchResult;
}

export function getAIWebSocketUrl(traceId: string, token?: string | null) {
  const envWs = import.meta.env.VITE_AI_WS_BASE_URL;
  let url: URL;
  if (typeof envWs === "string" && envWs.trim()) {
    url = new URL(`/ai/ws/${traceId}`, envWs.trim());
  } else if (typeof window !== "undefined") {
    url = new URL(`/ai-service/ai/ws/${traceId}`, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  } else {
    url = new URL(`/ai/ws/${traceId}`, "http://localhost:3010");
    url.protocol = "ws:";
  }

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}