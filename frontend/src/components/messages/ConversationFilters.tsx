type FilterId = "all" | "unread" | "muted" | "archived";

type ConversationFiltersProps = {
  activeFilter: FilterId;
  onFilterChange: (id: FilterId) => void;
};

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "muted", label: "Muted" },
  { id: "archived", label: "Archived" }
];

export function ConversationFilters({ activeFilter, onFilterChange }: ConversationFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-[#eef3f8] bg-white px-3 py-2.5">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onFilterChange(filter.id)}
          className={`rounded-full border px-3.5 py-1 text-[12px] font-semibold transition ${
            activeFilter === filter.id
              ? "border-[#067a46] bg-[#067a46] text-white shadow-sm"
              : "border-[#cfd6de] bg-white text-[#666a73] hover:border-[#b6c9dc] hover:bg-[#f7f9fb]"
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
