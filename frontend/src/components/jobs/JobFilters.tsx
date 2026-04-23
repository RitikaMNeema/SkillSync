import { ChevronDown } from "lucide-react";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";

export interface JobFilterState {
  keyword: string;
  location: string;
  employment_type: string;
  work_mode: string;
  industry: string;
  seniority_level: string;
}

export function JobFilters({
  filters,
  onChange,
  onReset
}: {
  filters: JobFilterState;
  onChange: (field: keyof JobFilterState, value: string) => void;
  onReset: () => void;
}) {
  return (
    <Card className="hidden lg:block">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Filters</h3>
        <button className="text-sm text-brand" onClick={onReset}>
          Reset all filters
        </button>
      </div>
      <div className="space-y-4">
        {[
          ["Experience level", "seniority_level"],
          ["Employment type", "employment_type"],
          ["Remote / Work mode", "work_mode"],
          ["Company / Industry", "industry"]
        ].map(([label, field]) => (
          <div key={field} className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>{label}</span>
              <ChevronDown className="h-4 w-4" />
            </div>
            <Input
              value={filters[field as keyof JobFilterState]}
              onChange={(event) => onChange(field as keyof JobFilterState, event.target.value)}
              placeholder={`Filter by ${label.toLowerCase()}`}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
