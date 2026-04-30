import { MoreHorizontal, ShieldCheck } from "lucide-react";

type PersonMeta = {
  id: number;
  name: string;
  headline?: string | null;
  location?: string | null;
  profilePhotoUrl?: string | null;
  /** Only shown when provided by API (> 0). No placeholder or fake follower counts. */
  connectionsCount?: number | null;
  badge?: string | null;
  isVerified?: boolean | null;
  action: "connect" | "message" | "pending";
  onPrimaryAction: () => void;
  onOpenProfile: () => void;
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function PersonResultCard({ person }: { person: PersonMeta }) {
  const metaLine = [person.location].filter(Boolean).join(" · ");
  const connectionsLine =
    person.connectionsCount != null && person.connectionsCount > 0
      ? `${person.connectionsCount} connection${person.connectionsCount === 1 ? "" : "s"}`
      : null;

  const primaryLabel = person.action === "message" ? "Message" : person.action === "pending" ? "Pending" : "Connect";
  const primaryDisabled = person.action === "pending";

  return (
    <div className="flex items-start gap-3 border-t border-[#ebebeb] px-4 py-3 first:border-t-0">
      <button type="button" className="shrink-0" onClick={person.onOpenProfile}>
        {person.profilePhotoUrl ? (
          <img src={person.profilePhotoUrl} alt={person.name} className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dce6f1] text-sm font-semibold text-[#0a66c2]">
            {initialsFromName(person.name)}
          </div>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={person.onOpenProfile} className="max-w-full text-left hover:underline">
          <p className="truncate text-[1.05rem] font-semibold leading-5 text-[#1f1f1f]">
            {person.name}
            {person.isVerified ? <ShieldCheck className="ml-1 inline h-3.5 w-3.5 text-[#5f6368]" /> : null}
          </p>
        </button>
        {person.headline ? <p className="line-clamp-1 text-[0.95rem] leading-5 text-[#1f1f1f]">{person.headline}</p> : null}
        {metaLine ? <p className="mt-0.5 text-[0.93rem] leading-5 text-[#666]">{metaLine}</p> : null}
        {connectionsLine ? <p className="mt-0.5 text-[0.88rem] text-[#666]">{connectionsLine}</p> : null}
        {person.badge ? (
          <span className="mt-1 inline-flex rounded-md border border-[#d0d7de] bg-[#f7f8fa] px-1.5 py-0.5 text-[0.75rem] text-[#5f6368]">
            {person.badge}
          </span>
        ) : null}
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={primaryDisabled}
          className={`rounded-full border px-4 py-[5px] text-sm font-semibold ${
            primaryDisabled
              ? "cursor-default border-[#b0b4b8] bg-[#f3f2ef] text-[#666]"
              : "border-[#0a66c2] bg-white text-[#0a66c2] hover:bg-[#eef3f8]"
          }`}
          onClick={person.onPrimaryAction}
        >
          {primaryLabel}
        </button>
        <button type="button" aria-label="More actions" className="rounded-full p-2 text-[#666] hover:bg-[#f3f2ef]">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
