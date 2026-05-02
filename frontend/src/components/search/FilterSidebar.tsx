import { SlidersHorizontal } from "lucide-react";

export type SearchFiltersState = {
  location: string;
  currentCompany: string;
  pastCompany: string;
  school: string;
};

export function FilterSidebar({
  filters,
  onFiltersChange,
}: {
  filters: SearchFiltersState;
  onFiltersChange: (next: SearchFiltersState) => void;
}) {
  function patch<K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <section className="rounded-lg border border-[#e4e6eb] bg-white">
      <div className="flex items-center justify-between border-b border-[#eef0f2] px-4 py-3">
        <h3 className="text-[1.05rem] font-semibold text-[#1f1f1f]">Filter</h3>
        <SlidersHorizontal className="h-4 w-4 text-[#666]" />
      </div>
      <div className="space-y-3 px-4 py-3 text-sm">
        <FilterTextField
          label="Location"
          placeholder="e.g. San Jose"
          value={filters.location}
          onChange={(v) => patch("location", v)}
        />
        <div className="border-t border-[#f0f2f5]" />
        <FilterTextField
          label="Current company"
          placeholder="Company name"
          value={filters.currentCompany}
          onChange={(v) => patch("currentCompany", v)}
        />
        <div className="border-t border-[#f0f2f5]" />
        <FilterTextField
          label="Past company"
          placeholder="Past employer"
          value={filters.pastCompany}
          onChange={(v) => patch("pastCompany", v)}
        />
        <div className="border-t border-[#f0f2f5]" />
        <FilterTextField label="School" placeholder="School name" value={filters.school} onChange={(v) => patch("school", v)} />
        <button
          type="button"
          className="pt-1 text-sm font-semibold text-[#0a66c2] hover:underline"
          onClick={() => onFiltersChange({ location: "", currentCompany: "", pastCompany: "", school: "" })}
        >
          Clear filters
        </button>
      </div>
    </section>
  );
}

function FilterTextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="font-semibold text-[#1f1f1f]">{label}</p>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-[#d0d7de] bg-white px-2.5 py-1.5 text-sm text-[#1f1f1f] placeholder:text-[#999] focus:border-[#0a66c2] focus:outline-none focus:ring-1 focus:ring-[#0a66c2]"
      />
    </div>
  );
}
