import { Pencil, Search, X } from "lucide-react";
import { Input } from "../ui/Input";

type MessagingHeaderProps = {
  inboxSearch: string;
  onInboxSearchChange: (value: string) => void;
  onComposeClick: () => void;
};

export function MessagingHeader({ inboxSearch, onInboxSearchChange, onComposeClick }: MessagingHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e8ecf1] px-4 py-2.5 md:gap-4 md:px-5">
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-[#1f1f1f] md:text-[17px]">Messaging</h1>
      <div className="relative flex min-h-9 min-w-0 flex-1 items-center rounded-full border border-transparent bg-[#eef3f8] md:max-w-xl md:flex-none md:basis-[420px] transition-colors focus-within:border-[#0a66c2]/40 focus-within:bg-white focus-within:shadow-[0_0_0_1px_rgba(10,102,194,0.25)]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#666a73]" aria-hidden />
        <Input
          value={inboxSearch}
          onChange={(event) => onInboxSearchChange(event.target.value)}
          placeholder="Search messages"
          aria-label="Search inbox"
          className={`h-9 flex-1 rounded-full border-0 bg-transparent !pl-9 text-[14px] shadow-none placeholder:text-[#666a73] focus:ring-0 ${inboxSearch ? "!pr-9" : "!pr-3"}`}
        />
        {inboxSearch ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#666a73] transition hover:bg-black/5 hover:text-[#1f1f1f]"
            aria-label="Clear search"
            onClick={() => onInboxSearchChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          onClick={onComposeClick}
          className="rounded-full p-2 text-[#666a73] transition hover:bg-[#eef3f8] hover:text-[#0a66c2]"
          aria-label="Start new conversation"
        >
          <Pencil className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
