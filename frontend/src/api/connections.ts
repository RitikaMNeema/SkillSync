import api from "./axios";
import { resolveCommandResult } from "./commands";
import type { ApiResponse } from "../types/common";
import type { Connection, MutualConnection, PendingConnection } from "../types/connection";

export async function requestConnection(requester_id: number, receiver_id: number) {
  const response = await api.post<ApiResponse<{ request_id: number; status: "pending" }>>("/connections/request", {
    requester_id,
    receiver_id
  });
  return resolveCommandResult<{ request_id: number; status: "pending" }>(
    response.data.data,
    "/connections/commandStatus"
  );
}

export async function acceptConnection(request_id: number) {
  const response = await api.post<ApiResponse<{ request_id: number; status: "accepted" }>>("/connections/accept", { request_id });
  return resolveCommandResult<{ request_id: number; status: "accepted" }>(
    response.data.data,
    "/connections/commandStatus"
  );
}

export async function rejectConnection(request_id: number) {
  const response = await api.post<ApiResponse<{ request_id: number; status: "rejected" }>>("/connections/reject", { request_id });
  return resolveCommandResult<{ request_id: number; status: "rejected" }>(
    response.data.data,
    "/connections/commandStatus"
  );
}

export async function withdrawConnection(request_id: number) {
  const response = await api.post<ApiResponse<{ request_id: number; status: "withdrawn" }>>("/connections/withdraw", { request_id });
  return resolveCommandResult<{ request_id: number; status: "withdrawn" }>(
    response.data.data,
    "/connections/commandStatus"
  );
}

export async function listConnections(user_id: number) {
  const response = await api.post<ApiResponse<Connection[]>>("/connections/list", { user_id });
  return response.data.data;
}

export async function listPendingConnections(user_id: number) {
  const response = await api.post<ApiResponse<PendingConnection[]>>("/connections/pending", { user_id });
  return response.data.data;
}

export async function getMutualConnections(user_id_1: number, user_id_2: number) {
  const response = await api.post<ApiResponse<{ mutual_connections: MutualConnection[]; count: number }>>("/connections/mutual", {
    user_id_1,
    user_id_2
  });
  return response.data.data;
}

export async function removeConnection(user_id_1: number, user_id_2: number) {
  const response = await api.post<ApiResponse<{ removed: boolean }>>("/connections/remove", { user_id_1, user_id_2 });
  return resolveCommandResult<{ removed: boolean }>(response.data.data, "/connections/commandStatus");
}

export async function blockConnection(blocker_id: number, blocked_id: number) {
  const response = await api.post<ApiResponse<{ blocked: boolean }>>("/connections/block", { blocker_id, blocked_id });
  return response.data.data;
}
