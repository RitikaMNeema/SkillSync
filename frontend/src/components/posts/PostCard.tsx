import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, MoreHorizontal, ThumbsUp, Trash2 } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";

import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CommentsPanel } from "./CommentsPanel";
import { deletePost, likePost } from "../../api/posts";
import { useMinuteTicker } from "../../hooks/useMinuteTicker";
import { formatTimeAgo } from "../../utils/formatDate";
import type { FeedPost } from "../../types/post";

interface PostCardProps {
  post: FeedPost;
  viewerId: number;
  onUpdate?: (post: FeedPost) => void;
  onDelete?: (postId: string) => void;
}

export function PostCard({ post, viewerId, onUpdate, onDelete }: PostCardProps) {
  useMinuteTicker();
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [hasLiked, setHasLiked] = useState(post.viewer_has_liked);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [liking, setLiking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = post.member_id === viewerId;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpen]);

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    const prevLiked = hasLiked;
    const prevCount = likeCount;
    setHasLiked(!prevLiked);
    setLikeCount(prevLiked ? prevCount - 1 : prevCount + 1);
    try {
      const result = await likePost(post.post_id, viewerId);
      setHasLiked(result.liked);
      setLikeCount(result.like_count);
      onUpdate?.({ ...post, viewer_has_liked: result.liked, like_count: result.like_count });
    } catch {
      setHasLiked(prevLiked);
      setLikeCount(prevCount);
      toast.error("Could not update reaction");
    } finally {
      setLiking(false);
    }
  }

  function handleCommentAdded() {
    setCommentCount((current) => current + 1);
    onUpdate?.({ ...post, comment_count: commentCount + 1 });
  }

  async function handleDelete() {
    if (deleting) return;
    setMenuOpen(false);
    const confirmed = window.confirm(
      "Delete this post? This cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    const loadingToast = toast.loading("Deleting post...");
    try {
      await deletePost(post.post_id, viewerId);
      toast.success("Post deleted", { id: loadingToast });
      onDelete?.(post.post_id);
    } catch {
      toast.error("Could not delete post", { id: loadingToast });
      setDeleting(false);
    }
  }

  const authorName =
    `${post.author.first_name ?? ""} ${post.author.last_name ?? ""}`.trim() || "Member";
  const formattedTime = formatTimeAgo(post.created_at);

  const mediaBlock = post.media_url
    ? post.post_type === "photo"
      ? (
        <img
          src={resolveMediaUrl(post.media_url)}
          alt="Post attachment"
          className="mt-3 max-h-[480px] w-full rounded-card border object-cover"
        />
      )
      : (
        <a
          href={resolveMediaUrl(post.media_url)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-brand hover:underline"
        >
          Open attachment
        </a>
      )
    : null;

  return (
    <div className={clsx("rounded-card border p-4 transition-opacity", deleting && "opacity-50")}>
      <div className="flex items-start gap-3">
  <Link to={`/profile/${post.member_id}`} className="flex-shrink-0">
    <Avatar
      src={post.author.profile_photo_url ?? undefined}
      alt={authorName}
      name={authorName}
    />
  </Link>
  <div className="min-w-0 flex-1">
    <div className="flex items-start justify-between gap-3">
      <Link to={`/profile/${post.member_id}`} className="min-w-0 hover:underline">
        <p className="font-semibold">{authorName}</p>
        <p className="text-sm text-text-secondary">{post.author.headline || "Member"}</p>
      </Link>
      <div className="flex items-start gap-2">
        <div className="text-right">
          <Badge className="bg-slate-100 text-slate-600">{post.post_type}</Badge>
          <p className="mt-1 text-xs text-text-tertiary">{formattedTime}</p>
        </div>
        {isOwner ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full p-1 text-text-secondary hover:bg-hover"
              aria-label="Post options"
              disabled={deleting}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-8 z-10 w-40 rounded-card border bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete post
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>

          {post.content ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">{post.content}</p>
          ) : null}

          {mediaBlock}

          {(likeCount > 0 || commentCount > 0) && (
            <div className="mt-3 flex items-center justify-between border-b pb-2 text-xs text-text-secondary">
              <span>{likeCount > 0 ? `${likeCount} ${likeCount === 1 ? "like" : "likes"}` : ""}</span>
              <button
                type="button"
                className="hover:underline"
                onClick={() => setCommentsOpen((v) => !v)}
              >
                {commentCount > 0
                  ? `${commentCount} ${commentCount === 1 ? "comment" : "comments"}`
                  : ""}
              </button>
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => void handleLike()}
              disabled={liking || deleting}
              className={clsx("flex items-center gap-2", hasLiked && "text-brand")}
            >
              <ThumbsUp className={clsx("h-4 w-4", hasLiked && "fill-current")} />
              Like
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setCommentsOpen((v) => !v)}
              className="flex items-center gap-2"
              disabled={deleting}
            >
              <MessageCircle className="h-4 w-4" />
              Comment
            </Button>
          </div>

          {commentsOpen ? (
            <div className="mt-3 border-t pt-3">
              <CommentsPanel
                postId={post.post_id}
                viewerId={viewerId}
                onCommentAdded={handleCommentAdded}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveMediaUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = import.meta.env.VITE_API_BASE_URL ?? "/api";
  return `${base.replace(/\/$/, "")}${url}`;
}
