import type { ReactNode } from "react";
import { Card } from "../ui/Card";

export function ChartCard({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  );
}
