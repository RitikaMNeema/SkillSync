import type { Message } from "../../types/message";
import { formatDate } from "../../utils/formatDate";
import { Avatar } from "../ui/Avatar";

function LinkedInMark() {
  return (
    <span className="inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-[2px] bg-[#0a66c2] px-[3px] text-[9px] font-bold text-white">
      in
    </span>
  );
}

export function MessageBubble({
  message,
  own,
  senderName,
  senderAvatar
}: {
  message: Message;
  own: boolean;
  senderName?: string;
  senderAvatar?: string | null;
}) {
  const avatarName = senderName?.split(" ")[0] || message.sender_id;
  const displayName = senderName || `User ${message.sender_id}`;
  return (
    <div className="flex gap-3 py-4 animate-slide-up">
      <Avatar alt={displayName} name={avatarName} src={senderAvatar} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="font-semibold text-[#1f1f1f]">{displayName}</span>
          <LinkedInMark />
          <span className="text-text-tertiary">{formatDate(message.timestamp, "p")}</span>
          {own ? <span className="text-xs text-text-tertiary">(You)</span> : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#1f1f1f]">{message.text}</p>
      </div>
    </div>
  );
}
