import type { LucideIcon } from "lucide-react";
import { Card } from "../ui/Card";

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon?: LucideIcon;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">{title}</p>
          <p className="mt-2 text-3xl font-bold">{value}</p>
          <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
        </div>
        {Icon ? <Icon className="h-6 w-6 text-brand" /> : null}
      </div>
    </Card>
  );
}
