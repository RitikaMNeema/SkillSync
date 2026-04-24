import { formatRelativeDate } from "../../utils/formatDate";
import type { Thread } from "../../types/message";
import { Avatar } from "../ui/Avatar";
import { Star } from "lucide-react";

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  threadLabels,
  unreadCountByThread,
  starredThreadIds,
  previewByThread
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (thread: Thread) => void;
  threadLabels?: Record<string, string>;
  unreadCountByThread?: Record<string, number>;
  starredThreadIds?: Record<string, boolean>;
  previewByThread?: Record<string, string>;
}) {
  if (!threads.length) {
    return (
      <div className="rounded-card border border-dashed p-4 text-sm text-text-secondary">
        No conversations yet. Click the pencil icon to start a new message.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {threads.map((thread) => {
        const label = threadLabels?.[thread.thread_id] ?? `Conversation ${thread.thread_id.slice(0, 6)}`;
        const avatarName = label.split(",")[0]?.trim().split(" ")[0] || label;
        const unreadCount = unreadCountByThread?.[thread.thread_id] ?? 0;
        const isStarred = Boolean(starredThreadIds?.[thread.thread_id]);
        const active = activeThreadId === thread.thread_id;
        return (
        <button
          key={thread.thread_id}
          onClick={() => onSelect(thread)}
          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-150 hover:border-[#d0d9e4] hover:bg-[#f7f9fb] ${
            active ? "border-[#c7d7eb] bg-[#eef3f8]" : "border-transparent"
          }`}
        >
          <Avatar alt="Thread" name={avatarName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate font-semibold leading-5">{label}</p>
              <span className="shrink-0 text-xs text-text-tertiary">{formatRelativeDate(thread.last_message_at)}</span>
            </div>
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {previewByThread?.[thread.thread_id] || "No messages yet"}
            </p>
          </div>
          <div className="flex items-center gap-1 pt-0.5">
            {isStarred ? <Star className="h-3.5 w-3.5 fill-[#d49100] text-[#d49100]" /> : null}
            {unreadCount > 0 ? (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white shadow-sm">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </div>
        </button>
        );
      })}
    </div>
  );
}
