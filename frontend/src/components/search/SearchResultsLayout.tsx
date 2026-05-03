import type { ReactNode } from "react";
import { APP_SHELL_BREAKOUT_CLASS, appShellInnerGridClass } from "../../constants/appShellLayout";
import { cn } from "../../utils/cn";

export function SearchResultsLayout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className={cn(APP_SHELL_BREAKOUT_CLASS, "bg-[#f3f2ef] py-4")}>
      <div className={appShellInnerGridClass("grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start")}>
        <section className="min-w-0 space-y-3">{children}</section>
        <aside className="space-y-3">{sidebar}</aside>
      </div>
    </div>
  );
}
