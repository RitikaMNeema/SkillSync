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
    if (event.key === "Escape") {
      setValue("");
    }
  }

  return (
    <div className="border-t border-[#e8e8e8] bg-white px-4 py-3">
      <div className="flex items-end gap-2 rounded-xl border border-[#cfcfcf] bg-white px-3 py-2 shadow-sm transition-colors focus-within:border-[#0a66c2] focus-within:shadow-[0_0_0_1px_rgba(10,102,194,0.25)]">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="min-h-[44px] max-h-36 w-0 min-w-0 flex-1 resize-none !border-0 bg-transparent py-1.5 pl-0 pr-1 text-left text-sm leading-snug !shadow-none placeholder:text-[#666a73] focus:!border-0 focus:!ring-0"
          placeholder="Write a message…"
        />
        <div className="shrink-0">
          <Button
            variant="primary"
            className="rounded-full border-[#0a66c2] bg-[#0a66c2] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:border-[#004182] hover:bg-[#004182] disabled:opacity-50"
            disabled={!trimmedValue}
            onClick={handleSend}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
