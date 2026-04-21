import { FileImage, Paperclip, SendHorizonal, Smile, Sticker } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";

export function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const trimmedValue = value.trim();

  function handleSend() {
    if (!trimmedValue) return;
    onSend(trimmedValue);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t bg-[#fafafa] p-3">
      <div className="mb-2 flex items-center gap-1 text-text-secondary">
        {[Paperclip, Smile, Sticker, FileImage].map((Icon, index) => (
          <Button key={index} variant="icon">
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-2 rounded-2xl border border-[#d8dee5] bg-white p-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-32 min-h-[42px] border-0 shadow-none focus:border-0 focus:shadow-none"
          placeholder="Write a message..."
        />
        <Button
          variant="primary"
          className="h-10 rounded-full px-4 text-sm"
          disabled={!trimmedValue}
          onClick={handleSend}
        >
          <SendHorizonal className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  );
}
