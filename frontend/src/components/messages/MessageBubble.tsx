import { Check } from "lucide-react";
import type { Message } from "../../types/message";
import { formatDate } from "../../utils/formatDate";
import { Avatar } from "../ui/Avatar";
import { cn } from "../../utils/cn";

export function MessageBubble({
  message,
  own,
  senderName,
  senderAvatar,
  showAvatar,
  isFirstInGroup,
  showSeenFooter,
  seenByOther = false,
  compactTop
}: {
  message: Message;
  own: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  showAvatar: boolean;
  isFirstInGroup: boolean;
  showSeenFooter: boolean;
  seenByOther?: boolean;
  compactTop: boolean;
}) {
  const avatarName = senderName?.split(" ")[0] || message.sender_id;
  const displayName = senderName || `User ${message.sender_id}`;
  const timeStr = formatDate(message.timestamp, "p");

  return (
    <div
      className={cn(
        "flex gap-2 px-1",
        own ? "justify-end" : "justify-start",
        compactTop ? "pt-0.5" : isFirstInGroup ? "pt-5" : "pt-2"
      )}
    >
      {!own ? (
        <div className="flex w-10 shrink-0 justify-end pt-1">{showAvatar ? <Avatar alt={displayName} name={avatarName} src={senderAvatar} size="sm" /> : null}</div>
      ) : null}

      <div className={cn("flex min-w-0 max-w-[min(560px,85%)] flex-col", own ? "items-end" : "items-start")}>
        {own ? (
          <>
            <div className="flex flex-row-reverse items-end gap-2">
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-[#1f1f1f] shadow-sm",
                  "whitespace-pre-wrap break-words",
                  "rounded-br-md bg-[#d9ebfd]"
                )}
              >
                {message.text}
              </div>
              {!showSeenFooter ? <span className="shrink-0 pb-1 text-[11px] tabular-nums text-[#666a73]">{timeStr}</span> : null}
            </div>
            {showSeenFooter ? (
              <div className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-[#666a73]">
                <span>{timeStr}</span>
                {seenByOther ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-0.5 font-medium">
                      <Check className="h-3 w-3 text-[#0a66c2]" strokeWidth={2.5} aria-hidden />
                      Seen
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex items-end gap-2">
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-[#1f1f1f] shadow-sm",
                "whitespace-pre-wrap break-words",
                "rounded-bl-md bg-[#eef3f8]"
              )}
            >
              {message.text}
            </div>
            <span className="shrink-0 pb-1 text-[11px] tabular-nums text-[#666a73]">{timeStr}</span>
          </div>
        )}
      </div>
    </div>
  );
}
