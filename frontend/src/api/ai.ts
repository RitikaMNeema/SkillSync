import axios from "axios";
import { authStore } from "../context/AuthContext";

const aiApi = axios.create({
  baseURL: import.meta.env.VITE_AI_API_BASE_URL ?? "http://localhost:3010",
});

aiApi.interceptors.request.use((config) => {
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
  >("/ai/agent/request", payload);

  return data.data;
}

export async function approveAgentWorkflow(payload: ApprovalRequest) {
  const { data } = await aiApi.post<
    GenericSuccessResponse<{
      command_id: string;
      status: string;
      action: string;
    }>
  >("/ai/agent/approve", payload);

  return data.data;
}

export async function getAgentStatus(traceId: string) {
  const { data } = await aiApi.get<GenericSuccessResponse<AgentStatusResponse>>(
    `/ai/agent/status/${traceId}`
  );
  return data.data;
}

export async function getAICommandStatus(commandId: string) {
  const { data } = await aiApi.post<GenericSuccessResponse<CommandStatusResponse>>(
    "/ai/command-status",
    {
      command_id: commandId,
    }
  );
  return data.data;
}

export async function getAIMetrics() {
  const { data } = await aiApi.get<GenericSuccessResponse<AIMetricsResponse>>("/ai/metrics");
  return data.data;
}

export function getAIWebSocketUrl(traceId: string, token?: string | null) {
  const base = import.meta.env.VITE_AI_WS_BASE_URL ?? "ws://localhost:3010";
  const url = new URL(`/ai/ws/${traceId}`, base);

  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}