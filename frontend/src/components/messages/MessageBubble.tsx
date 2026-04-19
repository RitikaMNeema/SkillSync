import type { Message } from "../../types/message";
import { formatDate } from "../../utils/formatDate";
import { Avatar } from "../ui/Avatar";

export function MessageBubble({ message, own }: { message: Message; own: boolean }) {
  return (
    <div className={`flex ${own ? "justify-end" : "justify-start"} animate-slide-up`}>
      {!own ? <Avatar alt="Sender" name={message.sender_id} size="xs" /> : null}
      <div className={`max-w-[75%] px-3 py-2 text-sm ${own ? "ml-2 rounded-[18px_18px_4px_18px] bg-brand text-white" : "ml-2 rounded-[18px_18px_18px_4px] bg-hover text-text-primary"}`}>
        <p>{message.text}</p>
        <p className={`mt-1 text-[11px] ${own ? "text-white/80" : "text-text-tertiary"}`}>{formatDate(message.timestamp, "MMM d, p")}</p>
      </div>
    </div>
  );
}
