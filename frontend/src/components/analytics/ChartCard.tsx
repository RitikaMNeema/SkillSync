import type { ReactNode } from "react";
import { Card } from "../ui/Card";
import { cn } from "../../utils/cn";

export function ChartCard({
  title,
  action,
  children,
  className,
  titleClassName,
  headerClassName
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
  headerClassName?: string;
}) {
  return (
    <Card className={cn("border-[#d9dee3]", className)}>
      <div className={cn("mb-4 flex items-start justify-between gap-3", headerClassName)}>
        <h3 className={cn("text-lg font-semibold leading-6", titleClassName)}>{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}
