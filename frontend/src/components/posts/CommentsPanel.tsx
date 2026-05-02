import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Send } from "lucide-react";

import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { createComment, listComments } from "../../api/posts";
import { formatRelativeDate } from "../../utils/formatDate";
import type { PostComment } from "../../types/post";

interface CommentsPanelProps {
  postId: string;
  viewerId: number;
  onCommentAdded?: () => void;
}

export function CommentsPanel({ postId, viewerId, onCommentAdded }: CommentsPanelProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listComments(postId, 1);
      setComments(data.comments);
    } catch {
      toast.error("Could not load comments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [postId]);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const comment = await createComment(postId, viewerId, trimmed);
      setComments((current) => [...current, comment]);
      setText("");
      onCommentAdded?.();
    } catch {
      toast.error("Could not post comment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-text-secondary">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-text-secondary">No comments yet. Be the first!</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const name = `${comment.author?.first_name ?? ""} ${comment.author?.last_name ?? ""}`.trim() || "Member";
            return (
              <li key={comment.comment_id} className="flex items-start gap-2">
                <Avatar
                  src={comment.author?.profile_photo_url ?? undefined}
                  alt={name}
                  name={name}
                  size="sm"
                />
                <div className="min-w-0 flex-1 rounded-card bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-text-tertiary">
                      {formatRelativeDate(comment.created_at)}
                    </p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                    {comment.content}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Comment"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !text.trim()}
          className="flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          Post
        </Button>
      </div>
    </div>
  );
}