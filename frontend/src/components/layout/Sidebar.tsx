import type { ReactNode } from "react";

export function Sidebar({ children }: { children: ReactNode }) {
  return <aside className="hidden self-start lg:sticky lg:top-[68px] lg:block lg:w-[225px]">{children}</aside>;
}

export function RightSidebar({ children }: { children: ReactNode }) {
  return <aside className="hidden self-start md:block md:w-[300px] md:sticky md:top-[68px]">{children}</aside>;
}
