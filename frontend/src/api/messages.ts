import api from "./axios";
import { resolveCommandResult } from "./commands";
import { normalizeNavbarUnreadCount } from "../utils/navbarUnreadCount";
import type { ApiResponse } from "../types/common";
import type { Message, MessageListResponse, Thread, ThreadListResponse, ThreadPreference, ThreadPreferencesResponse } from "../types/message";

export async function openThread(participant_ids: number[]) {
  const response = await api.post<ApiResponse<Thread>>("/threads/open", { participant_ids });
  return resolveCommandResult<Thread>(response.data.data, "/messages/commandStatus");
}

export async function getThread(thread_id: string) {
  const response = await api.post<ApiResponse<Thread>>("/threads/get", { thread_id });
  return response.data.data;
}

export async function getThreadsByUser(user_id: number, page = 1) {
  const response = await api.post<ApiResponse<ThreadListResponse>>("/threads/byUser", { user_id, page });
  return response.data.data;
}

export async function getUnreadMessageCount() {
  const response = await api.post<ApiResponse<{ unread_count: number }>>("/messages/unreadCount", {});
  const raw = response.data?.data as { unread_count?: unknown } | undefined;
  return normalizeNavbarUnreadCount(raw?.unread_count);
}

export async function sendMessage(thread_id: string, sender_id: number, text: string) {
  const response = await api.post<ApiResponse<Message>>("/messages/send", { thread_id, sender_id, text });
  return resolveCommandResult<Message>(response.data.data, "/messages/commandStatus");
}

export async function listMessages(thread_id: string, page = 1) {
  const response = await api.post<ApiResponse<MessageListResponse>>("/messages/list", { thread_id, page });
  return response.data.data;
}

export async function markThreadRead(thread_id: string, user_id: number) {
  const response = await api.post<ApiResponse<{ thread_id: string; messages_marked_read: number }>>("/messages/markRead", {
    thread_id,
    user_id
  });
  return resolveCommandResult<{ thread_id: string; messages_marked_read: number }>(
    response.data.data,
    "/messages/commandStatus"
  );
}


export async function getThreadPreferences() {
  const response = await api.post<ApiResponse<ThreadPreferencesResponse>>("/threads/preferences", {});
  return response.data.data;
}

export async function updateThreadPreferences(payload: {
  thread_id: string;
  starred?: boolean;
  muted?: boolean;
  archived?: boolean;
  force_unread?: boolean;
  hidden?: boolean;
}) {
  const response = await api.post<ApiResponse<ThreadPreference>>("/threads/preferences/update", payload);
  return resolveCommandResult<ThreadPreference>(response.data.data, "/messages/commandStatus");
}
