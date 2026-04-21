export type PostType = "post" | "photo" | "video" | "article";

export interface PostAuthor {
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  profile_photo_url?: string | null;
}

export interface FeedPost {
  post_id: string;
  member_id: number;
  post_type: PostType;
  content: string;
  media_url?: string | null;
  created_at: string;
  author: PostAuthor;
  // Interaction state — populated by backend
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
}

export interface FeedPostListResponse {
  posts: FeedPost[];
  total: number;
  page: number;
  page_size: number;
}

export interface PostComment {
  comment_id: string;
  post_id: string;
  member_id: number;
  content: string;
  created_at: string;
  author: PostAuthor | null;
}

export interface CommentListResponse {
  comments: PostComment[];
  total: number;
  page: number;
  page_size: number;
}

export interface LikeToggleResponse {
  post_id: string;
  liked: boolean;
  like_count: number;
}

export interface UploadImageResponse {
  media_url: string;
}