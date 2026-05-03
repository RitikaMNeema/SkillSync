import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type NetworkListRowProps = {
  avatar: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  /** Third line (e.g. mutual connections, “Connected …”). */
  tertiary?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Single row: avatar + text stack + optional right actions, vertically centered.
 */
export function NetworkListRow({ avatar, primary, secondary, tertiary, actions, className }: NetworkListRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-[72px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[#fafafa] md:px-6",
        className
      )}
    >
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-[1.25] tracking-[-0.01em] text-[#222] [&_button]:font-semibold">
          {primary}
        </div>
        {secondary ? <div className="mt-1 text-[14px] leading-snug text-[#666]">{secondary}</div> : null}
        {tertiary ? <div className="mt-1 text-[12px] leading-snug text-[#666]">{tertiary}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
