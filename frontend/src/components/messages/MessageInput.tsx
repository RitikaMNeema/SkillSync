import type { KeyboardEvent } from "react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";

export function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");
  const trimmedValue = value.trim();

  function handleSave() {
    if (!trimmedValue) return;
    onSend(trimmedValue);
    setValue("");
  }

  function handleCancel() {
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="border-t bg-[#f3f2ef] p-3">
      <div className="rounded-xl border border-[#e3e1dc] bg-[#f8f8f8] p-3">
        <div className="rounded-xl bg-[#e9e7e3] p-4">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            className="max-h-36 min-h-[120px] !rounded-md !border-0 bg-transparent px-3 py-2 text-[40px] leading-tight !shadow-none focus:!border-0 focus:!shadow-none"
            aria-label="Message body"
          />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-full border-[#0a66c2] px-6 py-1.5 text-[#0a66c2]" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="primary" className="rounded-full px-6 py-1.5" disabled={!trimmedValue} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
