import { useMemo } from "react";

export function useWebSocket() {
  return useMemo(
    () => ({
      supported: false as const,
      status: "unavailable" as const,
      reason: "No backend WebSocket endpoint is currently implemented."
    }),
    []
  );
}
