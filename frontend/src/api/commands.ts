import api from "./axios";
import type { ApiResponse } from "../types/common";

type CommandEnvelope = {
  command_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  action?: string;
  result?: unknown;
  error?: string;
};

function isCommandEnvelope(value: unknown): value is CommandEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "command_id" in value &&
      typeof (value as { command_id?: unknown }).command_id === "string"
  );
}

export async function resolveCommandResult<T>(
  value: unknown,
  commandStatusPath: string,
  timeoutMs = 12000
): Promise<T> {
  if (!isCommandEnvelope(value)) return value as T;

  const start = Date.now();
  let status: CommandEnvelope = value;

  while (Date.now() - start < timeoutMs) {
    if (status.status === "completed") return (status.result as T) ?? ({} as T);
    if (status.status === "failed") {
      throw new Error(status.error || "Command execution failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await api.post<ApiResponse<CommandEnvelope>>(commandStatusPath, {
      command_id: status.command_id
    });
    const next = response.data?.data;
    if (!next || typeof next !== "object") {
      throw new Error("Invalid command status response");
    }
    status = next as CommandEnvelope;
  }

  throw new Error("Command is still processing. Please retry.");
}

