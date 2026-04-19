import { formatRelativeDate } from "../../utils/formatDate";
import type { Thread } from "../../types/message";
import { Avatar } from "../ui/Avatar";

export function ThreadList({
  threads,
  activeThreadId,
  onSelect
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (thread: Thread) => void;
}) {
  return (
    <div className="space-y-1">
      {threads.map((thread) => (
        <button
          key={thread.thread_id}
          onClick={() => onSelect(thread)}
          className={`flex w-full items-center gap-3 rounded-card px-3 py-3 text-left transition-all duration-150 hover:bg-hover ${
            activeThreadId === thread.thread_id ? "bg-hover" : ""
          }`}
        >
          <Avatar alt="Thread" name={thread.participant_ids.join(", ")} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Conversation {thread.thread_id.slice(0, 6)}</p>
            <p className="truncate text-sm text-text-secondary">{thread.participant_ids.join(", ")}</p>
          </div>
          <span className="text-xs text-text-tertiary">{formatRelativeDate(thread.last_message_at)}</span>
        </button>
      ))}
    </div>
  );
}
