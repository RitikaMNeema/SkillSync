import type { ReactNode } from "react";
import { APP_SHELL_BREAKOUT_CLASS, appShellInnerRowClass } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";

/** Full-viewport breakout; keep page background on the outer page wrapper where needed. */
export function AppShellBreakout({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(APP_SHELL_BREAKOUT_CLASS, className)}>{children}</div>;
}

/** Centered primary row inside a breakout (`ConnectionsPage` layout). */
export function AppShellMainRow({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={appShellInnerRowClass(className)}>{children}</div>;
}
