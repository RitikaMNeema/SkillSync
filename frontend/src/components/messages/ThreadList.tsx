import { MessageSquare, Star } from "lucide-react";
import type { Thread } from "../../types/message";
import { formatRelativeDate } from "../../utils/formatDate";
import { Avatar } from "../ui/Avatar";
import { cn } from "../../utils/cn";

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  threadLabels,
  unreadCountByThread,
  starredThreadIds,
  previewByThread,
  avatarSrcByThreadId,
  onStartNewMessage: _onStartNewMessage
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (thread: Thread) => void;
  threadLabels?: Record<string, string>;
  unreadCountByThread?: Record<string, number>;
  starredThreadIds?: Record<string, boolean>;
  previewByThread?: Record<string, string>;
  /** Primary other participant’s profile photo URL (same source as conversation header). */
  avatarSrcByThreadId?: Record<string, string | null | undefined>;
  onStartNewMessage?: () => void;
}) {
  if (!threads.length) {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center px-5 pb-8 pt-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#eef3f8] text-[#0a66c2]">
          <MessageSquare className="h-9 w-9" strokeWidth={1.5} aria-hidden />
        </div>
        <p className="mt-5 text-lg font-semibold text-[#1f1f1f]">No messages yet</p>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-[#666a73]">
          Reach out and start a conversation to advance your career
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 pb-3 pt-1">
      {threads.map((thread) => {
        const label = threadLabels?.[thread.thread_id] ?? `Conversation ${thread.thread_id.slice(0, 6)}`;
        const avatarName = label.split(",")[0]?.trim().split(" ")[0] || label;
        const photoSrc = avatarSrcByThreadId?.[thread.thread_id] ?? undefined;
        const unreadCount = unreadCountByThread?.[thread.thread_id] ?? 0;
        const isStarred = Boolean(starredThreadIds?.[thread.thread_id]);
        const active = activeThreadId === thread.thread_id;
        return (
          <button
            key={thread.thread_id}
            type="button"
            onClick={() => onSelect(thread)}
            className={cn(
              "group relative flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all duration-150",
              "hover:border-[#dce7f2] hover:bg-[#f7f9fb] hover:shadow-sm",
              active && "border-[#c7dff5] bg-[#e8f3fc] shadow-sm ring-1 ring-[#b6d4ef]/60"
            )}
          >
            {active ? <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-[#0a66c2]" aria-hidden /> : null}
            <Avatar alt={label} name={avatarName} src={photoSrc} size="md" />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className={cn("truncate text-[15px] leading-tight", active ? "font-semibold text-[#1f1f1f]" : "font-semibold text-[#1f1f1f]")}>
                  {label}
                </p>
                <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[#666a73]">{formatRelativeDate(thread.last_message_at)}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-[#666a73]">
                {previewByThread?.[thread.thread_id] || "No messages yet"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
              {isStarred ? <Star className="h-3.5 w-3.5 fill-[#d49100] text-[#d49100]" aria-hidden /> : null}
              {unreadCount > 0 ? (
                unreadCount === 1 ? (
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#0a66c2]" title="Unread message" aria-label="Unread message" />
                ) : (
                  <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#0a66c2] px-1.5 text-[11px] font-bold text-white shadow-sm">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
