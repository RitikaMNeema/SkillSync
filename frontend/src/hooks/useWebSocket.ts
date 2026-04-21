import { useEffect, useMemo, useState } from "react";
import { authStore } from "../context/AuthContext";
import type { Message } from "../types/message";

type WebSocketStatus = "idle" | "connecting" | "connected" | "error" | "closed" | "unsupported";

function getWsBaseUrl() {
  if (import.meta.env.VITE_WS_BASE_URL) return import.meta.env.VITE_WS_BASE_URL as string;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:3007`;
}

export function useWebSocket(threadId: string | null, onMessage: (message: Message) => void) {
  const token = authStore((state) => state.token);
  const [status, setStatus] = useState<WebSocketStatus>("idle");
  const [reason, setReason] = useState("Connect to a conversation to start real-time updates.");

  useEffect(() => {
    if (!("WebSocket" in window)) {
      setStatus("unsupported");
      setReason("This browser does not support WebSocket.");
      return;
    }
    if (!threadId || !token) {
      setStatus("idle");
      setReason("Connect to a conversation to start real-time updates.");
      return;
    }

    setStatus("connecting");
    setReason("Connecting...");
    const socket = new WebSocket(`${getWsBaseUrl()}/ws?thread_id=${encodeURIComponent(threadId)}&token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      setStatus("connected");
      setReason("Real-time updates connected.");
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { event?: string; data?: Message };
        if (payload.event === "message.created" && payload.data) {
          onMessage(payload.data);
        }
      } catch {
        // Ignore malformed payloads from unexpected senders.
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setReason("Could not establish real-time connection.");
    };

    socket.onclose = () => {
      setStatus("closed");
      setReason("Real-time connection closed.");
    };

    return () => socket.close();
  }, [threadId, token, onMessage]);

  return useMemo(
    () => ({
      supported: "WebSocket" in window,
      status,
      reason
    }),
    [reason, status]
  );
}
