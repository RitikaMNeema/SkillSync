import type { ReactNode } from "react";
import { Card } from "../ui/Card";
import { cn } from "../../utils/cn";

export function ChartCard({
  title,
  action,
  children,
  className
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-[#d9dee3]", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-6">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}
