import { MessageSquare, Star } from "lucide-react";
import { formatRelativeDate } from "../../utils/formatDate";
import type { Thread } from "../../types/message";
import { Avatar } from "../ui/Avatar";

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  threadLabels,
  unreadCountByThread,
  starredThreadIds,
  previewByThread,
  onStartNewMessage
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (thread: Thread) => void;
  threadLabels?: Record<string, string>;
  unreadCountByThread?: Record<string, number>;
  starredThreadIds?: Record<string, boolean>;
  previewByThread?: Record<string, string>;
  onStartNewMessage?: () => void;
}) {
  if (!threads.length) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 pb-8 pt-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#eef3f8] text-[#0a66c2]">
          <MessageSquare className="h-11 w-11 stroke-[1.5]" aria-hidden />
        </div>
        <p className="mt-5 text-lg font-semibold text-[#1f1f1f]">No messages yet</p>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-[#666a73]">
          Reach out and start a conversation to advance your career
        </p>
        {onStartNewMessage ? (
          <button
            type="button"
            onClick={onStartNewMessage}
            className="mt-6 rounded-full border border-[#0a66c2] bg-white px-5 py-2 text-sm font-semibold text-[#0a66c2] shadow-sm transition hover:bg-[#f3f9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a66c2]"
          >
            New message
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="divide-y divide-transparent">
      {threads.map((thread) => {
        const label = threadLabels?.[thread.thread_id] ?? `Conversation ${thread.thread_id.slice(0, 6)}`;
        const avatarName = label.split(",")[0]?.trim().split(" ")[0] || label;
        const unreadCount = unreadCountByThread?.[thread.thread_id] ?? 0;
        const isStarred = Boolean(starredThreadIds?.[thread.thread_id]);
        const active = activeThreadId === thread.thread_id;
        const hasUnread = unreadCount > 0;

        return (
          <button
            key={thread.thread_id}
            onClick={() => onSelect(thread)}
            className={`relative flex w-full items-start gap-3 border-b border-[#f0f0f0] py-2.5 pl-3 pr-2 text-left transition-colors last:border-b-0 hover:bg-[#f3f6f8] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0a66c2] ${
              active ? "border-transparent bg-[#eef3f8] hover:bg-[#eef3f8]" : "bg-white"
            }`}
          >
            {active ? <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-[#0a66c2]" aria-hidden /> : null}
            <div className="relative shrink-0">
              <Avatar alt="Thread" name={avatarName} size="md" />
              {hasUnread && !active ? (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#0a66c2]" aria-hidden />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className={`truncate text-sm leading-tight ${hasUnread ? "font-semibold text-[#1f1f1f]" : "font-semibold text-[#1f1f1f]"}`}>
                  {label}
                </p>
                <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[#666a73]">{formatRelativeDate(thread.last_message_at)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className={`min-w-0 flex-1 truncate text-sm ${hasUnread ? "font-medium text-[#1f1f1f]" : "text-[#666a73]"}`}>
                  {previewByThread?.[thread.thread_id] || "No messages yet"}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {isStarred ? <Star className="h-3.5 w-3.5 fill-[#d49100] text-[#d49100]" aria-hidden /> : null}
                  {unreadCount > 0 ? (
                    <span className="inline-flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[#0a66c2] px-1 text-[10px] font-bold text-white shadow-sm">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
