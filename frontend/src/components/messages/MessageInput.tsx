import type { KeyboardEvent } from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
    <div className="sticky bottom-0 z-10 border-t border-[#e8ecf1] bg-white px-4 py-3">
      <div className="rounded-xl border border-[#d9dee3] bg-white shadow-sm transition-shadow focus-within:border-[#b6c9dc] focus-within:shadow-md">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-36 min-h-[76px] w-full resize-none !rounded-xl !border-0 bg-transparent px-4 py-3 text-[15px] leading-snug !shadow-none placeholder:text-[#666a73] focus:!border-0 focus:!ring-0 focus:!shadow-none"
          placeholder="Write a message..."
          aria-label="Message text"
        />
        <div className="flex items-center justify-end gap-1 border-t border-[#f0f4f8] px-3 py-2">
          <div className="inline-flex shrink-0 overflow-hidden rounded-full border-2 border-brand shadow-sm">
            <button
              type="button"
              className="border-r border-white/30 bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-45"
              disabled={!trimmedValue}
              onClick={handleSend}
            >
              Send
            </button>
            <button
              type="button"
              className="flex items-center bg-brand px-2 py-2 text-white transition hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-45"
              aria-label="Send options"
              disabled
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
