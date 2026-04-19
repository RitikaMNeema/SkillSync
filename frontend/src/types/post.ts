export type PostType = "post" | "photo" | "video" | "article";

export interface FeedPost {
  post_id: string;
  member_id: number;
  post_type: PostType;
  content: string;
  media_url?: string | null;
  created_at: string;
  author: {
    first_name?: string | null;
    last_name?: string | null;
    headline?: string | null;
    profile_photo_url?: string | null;
  };
}

export interface FeedPostListResponse {
  posts: FeedPost[];
  total: number;
  page: number;
  page_size: number;
}
