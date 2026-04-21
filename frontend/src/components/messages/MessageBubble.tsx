import type { Message } from "../../types/message";
import { formatDate } from "../../utils/formatDate";
import { Avatar } from "../ui/Avatar";

export function MessageBubble({ message, own, senderName }: { message: Message; own: boolean; senderName?: string }) {
  const avatarName = senderName?.split(" ")[0] || message.sender_id;
  return (
    <div className={`flex ${own ? "justify-end" : "justify-start"} animate-slide-up`}>
      {!own ? <Avatar alt="Sender" name={avatarName} size="xs" /> : null}
      <div
        className={`max-w-[75%] px-3 py-2.5 text-sm shadow-sm ${
          own
            ? "ml-2 rounded-[18px_18px_4px_18px] border border-[#0a66c2] bg-[#0a66c2] text-white"
            : "ml-2 rounded-[18px_18px_18px_4px] border border-[#d8dee5] bg-white text-text-primary"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p className={`mt-1 text-[11px] ${own ? "text-white/80" : "text-text-tertiary"}`}>{formatDate(message.timestamp, "MMM d, p")}</p>
      </div>
    </div>
  );
}
