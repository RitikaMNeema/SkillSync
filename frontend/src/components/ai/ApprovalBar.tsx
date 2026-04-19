import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ApprovalBar({
  approved,
  edited,
  rejected,
  total
}: {
  approved: number;
  edited: number;
  rejected: number;
  total: number;
}) {
  const width = total ? `${(approved / total) * 100}%` : "0%";

  return (
    <Card className="sticky bottom-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold">
            {approved} approved · {edited} edited · {rejected} rejected out of {total}
          </p>
          <div className="mt-2 h-2 rounded-full bg-slate-200">
            <div className="h-2 rounded-full bg-brand" style={{ width }} />
          </div>
        </div>
        <Button disabled={!approved}>Submit approved outreach</Button>
      </div>
    </Card>
  );
}
