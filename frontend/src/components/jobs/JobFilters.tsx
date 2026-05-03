import { ChevronDown } from "lucide-react";
import { Card } from "../ui/Card";

export interface JobFilterState {
  keyword: string;
  location: string;
  employment_type: string;
  work_mode: string;
  seniority_level: string;
}

const FILTER_OPTIONS: { label: string; field: keyof JobFilterState; options: { label: string; value: string }[] }[] = [
  {
    label: "Experience level",
    field: "seniority_level",
    options: [
      { label: "Internship", value: "internship" },
      { label: "Entry level", value: "entry" },
      { label: "Mid level", value: "mid" },
      { label: "Senior", value: "senior" },
      { label: "Lead", value: "lead" },
      { label: "Director", value: "director" },
      { label: "Executive", value: "executive" }
    ]
  },
  {
    label: "Employment type",
    field: "employment_type",
    options: [
      { label: "Full-time", value: "full-time" },
      { label: "Part-time", value: "part-time" },
      { label: "Contract", value: "contract" },
      { label: "Temporary", value: "temporary" },
      { label: "Internship", value: "internship" },
      { label: "Volunteer", value: "volunteer" }
    ]
  },
  {
    label: "Work mode",
    field: "work_mode",
    options: [
      { label: "Remote", value: "remote" },
      { label: "Hybrid", value: "hybrid" },
      { label: "Onsite", value: "onsite" }
    ]
  }
];

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
        <button type="button" className="text-sm text-brand" onClick={onReset}>
          Reset all filters
        </button>
      </div>
      <div className="space-y-4">
        {FILTER_OPTIONS.map(({ label, field, options }) => (
          <div key={field} className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>{label}</span>
              <ChevronDown className="h-4 w-4" />
            </div>
            <div className="relative">
              <select
                value={filters[field]}
                onChange={(e) => onChange(field, e.target.value)}
                className="w-full appearance-none rounded-md border border-border bg-white py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">All</option>
                {options.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
