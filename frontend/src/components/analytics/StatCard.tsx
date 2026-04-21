import type { LucideIcon } from "lucide-react";
import { Card } from "../ui/Card";

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  onClick
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={onClick ? "cursor-pointer border-[#d9dee3] transition hover:border-brand/40 hover:shadow-md" : "border-[#d9dee3]"}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-secondary">{title}</p>
          <p className="mt-2 text-[2rem] font-bold leading-none text-text-primary">{value}</p>
          <p className="mt-2 text-xs text-text-secondary">{subtitle}</p>
        </div>
        {Icon ? (
          <span className="rounded-full border border-[#d6e7f8] bg-[#eef5fc] p-2.5">
            <Icon className="h-4 w-4 text-brand" />
          </span>
        ) : null}
      </div>
    </Card>
  );
}
