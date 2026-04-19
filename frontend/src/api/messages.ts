import api from "./axios";
import type { ApiResponse } from "../types/common";
import type { Message, MessageListResponse, Thread, ThreadListResponse } from "../types/message";

export async function openThread(participant_ids: number[]) {
  const response = await api.post<ApiResponse<Thread>>("/threads/open", { participant_ids });
  return response.data.data;
}

export async function getThread(thread_id: string) {
  const response = await api.post<ApiResponse<Thread>>("/threads/get", { thread_id });
  return response.data.data;
}

export async function getThreadsByUser(user_id: number, page = 1) {
  const response = await api.post<ApiResponse<ThreadListResponse>>("/threads/byUser", { user_id, page });
  return response.data.data;
}

export async function sendMessage(thread_id: string, sender_id: number, text: string) {
  const response = await api.post<ApiResponse<Message>>("/messages/send", { thread_id, sender_id, text });
  return response.data.data;
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
  return response.data.data;
}
