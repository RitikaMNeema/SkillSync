import api from "./axios";
import { resolveCommandResult } from "./commands";
import type { ApiResponse } from "../types/common";
import type {
  FeedPost,
  FeedPostListResponse,
  PostType,
  PostComment,
  CommentListResponse,
  LikeToggleResponse,
  UploadImageResponse
} from "../types/post";

export async function createPost(payload: {
  member_id: number;
  content: string;
  post_type?: PostType;
  media_url?: string;
}) {
  const response = await api.post<ApiResponse<FeedPost>>("/posts/create", payload);
  return resolveCommandResult<FeedPost>(response.data.data, "/posts/commandStatus");
}

export async function getFeedPosts(page = 1) {
  const response = await api.post<ApiResponse<FeedPostListResponse>>("/posts/feed", { page });
  return response.data.data;
}

export async function getPostsByMember(member_id: number, page = 1) {
  const response = await api.post<ApiResponse<FeedPostListResponse>>("/posts/byMember", {
    member_id,
    page
  });
  return response.data.data;
}

export async function likePost(post_id: string, member_id: number) {
  const response = await api.post<ApiResponse<LikeToggleResponse>>("/posts/like", {
    post_id,
    member_id
  });
  return resolveCommandResult<LikeToggleResponse>(response.data.data, "/posts/commandStatus");
}

export async function createComment(post_id: string, member_id: number, content: string) {
  const response = await api.post<ApiResponse<PostComment>>("/posts/comment", {
    post_id,
    member_id,
    content
  });
  return resolveCommandResult<PostComment>(response.data.data, "/posts/commandStatus");
}

export async function listComments(post_id: string, page = 1) {
  const response = await api.post<ApiResponse<CommentListResponse>>("/posts/comments", {
    post_id,
    page
  });
  return response.data.data;
}

export async function uploadPostImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  // Do not set Content-Type manually — the browser must add the multipart boundary.
  const response = await api.post<ApiResponse<UploadImageResponse>>("/posts/upload-image", form);
  return response.data.data.media_url;
}

export async function deletePost(post_id: string, member_id: number) {
  const response = await api.post<ApiResponse<{ post_id: string; deleted: boolean }>>(
    "/posts/delete",
    { post_id, member_id }
  );
  return resolveCommandResult<{ post_id: string; deleted: boolean }>(response.data.data, "/posts/commandStatus");
}
