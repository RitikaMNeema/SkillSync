import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export function PageWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto w-full max-w-[1128px] px-4 py-4 md:px-6", className)}>{children}</main>;
}
