import { FileImage, Paperclip, SendHorizonal, Smile, Sticker } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Input";

export function MessageInput({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="border-t bg-white p-4">
      <div className="mb-3 flex items-center gap-1 text-text-secondary">
        {[Paperclip, Smile, Sticker, FileImage].map((Icon, index) => (
          <Button key={index} variant="icon">
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
      <div className="flex items-end gap-3">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="max-h-32 min-h-[48px]"
          placeholder="Write a message..."
        />
        <Button
          variant="icon"
          className="bg-brand text-white hover:bg-brand-dark"
          disabled={!value.trim()}
          onClick={() => {
            onSend(value);
            setValue("");
          }}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
