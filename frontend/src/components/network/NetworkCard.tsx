import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type NetworkCardProps = {
  children: ReactNode;
  className?: string;
  /** Extra classes for inner padding wrapper */
  bodyClassName?: string;
  padded?: boolean;
};

/**
 * White surface card for network sections (LinkedIn-inspired).
 */
export function NetworkCard({ children, className, bodyClassName, padded = true }: NetworkCardProps) {
  return (
    <div
      className={cn("rounded-[8px] border border-[#e0dfdc] bg-white shadow-none", className)}
    >
      <div className={cn(padded && "p-4 md:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

type NetworkCardHeaderProps = {
  title: ReactNode;
  action?: ReactNode;
  border?: boolean;
  className?: string;
};

export function NetworkCardHeader({ title, action, border = true, className }: NetworkCardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        border && "border-b border-[#e0dfdc] pb-3",
        className
      )}
    >
      <div className="min-w-0">{title}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
