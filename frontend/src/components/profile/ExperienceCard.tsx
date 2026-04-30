import { Pencil, Plus } from "lucide-react";
import type { EducationEntry, ExperienceEntry } from "../../types/member";
import { Card } from "../ui/Card";

export function ExperienceCard({
  title,
  items,
  onAdd,
  onEdit,
  /** Opens the section manage/details page (LinkedIn-style). Do not use row `onEdit` for this. */
  onManageSection,
  /** When true, only the entry list is shown (no section header); use with an external manage header. */
  compact = false,
  /** Show per-row edit pencils. Defaults to `compact` so the main profile shows only the section pencil. */
  showRowEdit
}: {
  title: string;
  items: Array<ExperienceEntry | EducationEntry>;
  onAdd?: () => void;
  onEdit?: (index: number) => void;
  onManageSection?: () => void;
  compact?: boolean;
  showRowEdit?: boolean;
}) {
  const rowEditEnabled = showRowEdit ?? compact;
  function isExperience(item: ExperienceEntry | EducationEntry): item is ExperienceEntry {
    return "title" in item || "company" in item;
  }

  /** Non-empty trimmed string, or null (treat "" as missing so we fall back to structured fields). */
  function nonEmpty(s: string | null | undefined) {
    const t = s?.trim();
    return t ? t : null;
  }

  function educationDateLabel(item: EducationEntry) {
    const start = [shortMonth(item.start_month), item.start_year].filter((v) => v !== null && v !== undefined && `${v}` !== "").join(" ");
    const endRaw = [shortMonth(item.end_month), item.end_year].filter((v) => v !== null && v !== undefined && `${v}` !== "").join(" ");
    const year = item.year;
    // If a start date is set but no end date, assume the user checked "Present".
    const end = endRaw || (start && !item.end_year && !year ? "Present" : "");
    if (start && end) return `${start} - ${end}`;
    if (start) return start;
    if (endRaw) return endRaw;
    if (year !== null && year !== undefined && `${year}` !== "") return String(year);
    return "";
  }

  function educationHeading(item: EducationEntry) {
    return item.school ?? "Unknown school";
  }

  function educationSubheading(item: EducationEntry) {
    return [item.degree, item.field_of_study ?? item.field].filter(Boolean).join(", ");
  }

  function experienceMeta(item: ExperienceEntry) {
    const employmentType = item.employment_type
      ? item.employment_type
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join("-")
      : null;
    return [item.company, employmentType].filter(Boolean).join(" · ");
  }

  function monthIndex(month?: string | null) {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];
    return month ? months.indexOf(month) : -1;
  }

  function shortMonth(month?: string | null) {
    if (!month) return null;
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    const index = monthIndex(month);
    return index >= 0 ? months[index] : month.slice(0, 3);
  }

  function experienceDuration(item: ExperienceEntry) {
    if (!item.start_year) return "";
    const start = new Date(item.start_year, Math.max(monthIndex(item.start_month), 0), 1);
    const end = item.is_current
      ? new Date()
      : item.end_year
        ? new Date(item.end_year, Math.max(monthIndex(item.end_month), 0), 1)
        : null;

    if (!end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return "";

    const monthsTotal = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
    const years = Math.floor(monthsTotal / 12);
    const months = monthsTotal % 12;
    const yearText = years ? `${years} yr${years === 1 ? "" : "s"}` : "";
    const monthText = months ? `${months} mo${months === 1 ? "" : "s"}` : "";
    return [yearText, monthText].filter(Boolean).join(" ");
  }

  function experienceDateLabel(item: ExperienceEntry) {
    const isCurrent = Boolean(item.is_current);
    const startFromParts =
      [shortMonth(item.start_month), item.start_year].filter((v) => v !== null && v !== undefined && `${v}` !== "").join(" ") || null;
    const startDisp = startFromParts ?? nonEmpty(item.start);

    const endFromParts = isCurrent
      ? "Present"
      : [shortMonth(item.end_month), item.end_year].filter((v) => v !== null && v !== undefined && `${v}` !== "").join(" ") || null;
    const endDisp = isCurrent ? "Present" : endFromParts ?? nonEmpty(item.end);

    const range = [startDisp, endDisp].filter(Boolean).join(" - ");
    const duration = experienceDuration(item);
    return [range, duration].filter(Boolean).join(" · ");
  }

  function skillsSummary(skills?: string[] | null) {
    const normalized = (skills ?? []).filter(Boolean);
    if (!normalized.length) return null;
    if (normalized.length === 1) return normalized[0];
    if (normalized.length === 2) return `${normalized[0]}, ${normalized[1]}`;
    return `${normalized[0]}, ${normalized[1]} and +${normalized.length - 2} skills`;
  }

  return (
    <Card className="rounded-2xl border border-[#dde3ea] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      {!compact ? (
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-[1.55rem] font-semibold tracking-[-0.02em] text-[#1f1f1f]">{title}</h2>
          <div className="flex items-center gap-2">
            {onAdd ? (
              <button
                type="button"
                aria-label={`Add ${title}`}
                className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                onClick={onAdd}
              >
                <Plus className="h-6 w-6" />
              </button>
            ) : null}
            {onManageSection ? (
              <button
                type="button"
                aria-label={`Manage ${title}`}
                className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                onClick={onManageSection}
              >
                <Pencil className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="space-y-4">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${title}-${index}`} className="flex gap-4 border-t border-[#edf1f4] pt-4 first:border-t-0 first:pt-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#eef3f8] text-brand">
                {(String(isExperience(item) ? item.company : item.school) || "S").slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1f1f1f]">{isExperience(item) ? item.title ?? "Untitled" : educationHeading(item)}</p>
                    <p className="text-sm text-[#555555]">{isExperience(item) ? experienceMeta(item) || "Unknown organization" : educationSubheading(item) || "Add degree details"}</p>
                    <p className="text-sm text-[#6b7280]">{isExperience(item) ? experienceDateLabel(item) : educationDateLabel(item)}</p>
                    {isExperience(item) && item.location ? <p className="text-sm text-[#6b7280]">{item.location}</p> : null}
                    {isExperience(item) && item.description ? (
                      <p className="mt-2 text-sm leading-6 text-[#555555]">{item.description}</p>
                    ) : null}
                    {skillsSummary((item as ExperienceEntry | EducationEntry).skill_ids) ? (
                      <p className="mt-2 text-sm font-semibold text-[#1f2937]">
                        {skillsSummary((item as ExperienceEntry | EducationEntry).skill_ids)}
                      </p>
                    ) : null}
                  </div>
                  {onEdit && rowEditEnabled ? (
                    <button
                      type="button"
                      aria-label={`Edit ${title} item ${index + 1}`}
                      className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
                      onClick={() => onEdit(index)}
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#6b7280]">No entries yet.</p>
        )}
      </div>
    </Card>
  );
}
