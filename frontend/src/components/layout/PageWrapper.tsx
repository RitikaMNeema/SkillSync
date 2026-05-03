import type { ReactNode } from "react";
import { APP_SHELL_MAIN_COLUMN_CLASS } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";

export function PageWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn(APP_SHELL_MAIN_COLUMN_CLASS, "py-4", className)}>{children}</main>;
}
