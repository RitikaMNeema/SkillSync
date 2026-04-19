import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="linkedin-card flex flex-col items-center justify-center gap-3 p-10 text-center">
      <Icon className="h-12 w-12 text-gray-300" />
      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      {actionLabel && onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
