import type { HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center rounded-badge px-2.5 py-0.5 text-xs font-semibold", className)}
      {...props}
    />
  );
}
