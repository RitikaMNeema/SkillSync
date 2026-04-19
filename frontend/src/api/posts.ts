import api from "./axios";
import type { ApiResponse } from "../types/common";
import type { FeedPost, FeedPostListResponse, PostType } from "../types/post";

export async function createPost(payload: { member_id: number; content: string; post_type?: PostType; media_url?: string }) {
  const response = await api.post<ApiResponse<FeedPost>>("/posts/create", payload);
  return response.data.data;
}

export async function getFeedPosts(page = 1) {
  const response = await api.post<ApiResponse<FeedPostListResponse>>("/posts/feed", { page });
  return response.data.data;
}

export async function getPostsByMember(member_id: number, page = 1) {
  const response = await api.post<ApiResponse<FeedPostListResponse>>("/posts/byMember", { member_id, page });
  return response.data.data;
}
