import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { Button } from "../ui/Button";

interface ProfileCompletionCardProps {
  title: string;
  helper: string;
  actionLabel: string;
  previewTitle: string;
  previewSubtitle: string;
  previewMeta?: string;
  icon: LucideIcon;
  onAction: () => void;
  onDismiss: () => void;
}

export function ProfileCompletionCard({
  title,
  helper,
  actionLabel,
  previewTitle,
  previewSubtitle,
  previewMeta,
  icon: Icon,
  onAction,
  onDismiss
}: ProfileCompletionCardProps) {
  return (
    <div className="rounded-2xl border border-[#d9dee5] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[1.55rem] font-semibold tracking-[-0.02em] text-[#1f1f1f]">{title}</h3>
          <p className="mt-2 max-w-[760px] text-[1rem] leading-7 text-[#525252]">{helper}</p>
        </div>
        <button
          type="button"
          aria-label={`Dismiss ${title}`}
          className="rounded-full p-2 text-[#525252] transition hover:bg-[#f3f6f8]"
          onClick={onDismiss}
        >
          <X className="h-7 w-7" />
        </button>
      </div>

      <div className="mb-6 flex items-start gap-4 rounded-2xl border border-dashed border-[#d0d7df] bg-[#fbfcfd] p-4 text-[#a3a3a3]">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-[#c8d0d9] bg-white">
          <Icon className="h-7 w-7 text-[#a8adb3]" />
        </div>
        <div>
          <p className="text-[1.25rem] font-semibold text-[#b1b1b1]">{previewTitle}</p>
          <p className="text-[1rem]">{previewSubtitle}</p>
          {previewMeta ? <p className="text-[1rem]">{previewMeta}</p> : null}
        </div>
      </div>

      <Button
        variant="secondary"
        className="rounded-full border-brand px-5 py-2.5 text-[1.05rem] font-semibold"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
