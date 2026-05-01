import type { ReactNode } from "react";

export function SearchResultsLayout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 bg-[#f3f2ef] py-4">
      <div className="mx-auto grid w-full max-w-[1128px] grid-cols-1 gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section className="min-w-0 space-y-3">{children}</section>
        <aside className="space-y-3">{sidebar}</aside>
      </div>
    </div>
  );
}
