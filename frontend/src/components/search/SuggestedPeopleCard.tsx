export type SuggestedPerson = {
  id: string;
  name: string;
  subtitle: string;
  location: string;
  profilePhotoUrl?: string | null;
  onOpen: () => void;
  primaryLabel: "Connect" | "Message" | "Pending";
  onPrimaryAction: () => void;
};

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function SuggestedPeopleCard({ people }: { people: SuggestedPerson[] }) {
  return (
    <section className="rounded-lg border border-[#e4e6eb] bg-white">
      <div className="border-b border-[#eef0f2] px-4 py-3">
        <h3 className="text-[1.05rem] font-semibold text-[#1f1f1f]">People you may know</h3>
      </div>
      <div className="px-4 py-2">
        {people.length === 0 ? (
          <p className="py-2 text-sm text-[#666]">Suggestions will appear as your network grows.</p>
        ) : (
          people.map((person) => {
            const pending = person.primaryLabel === "Pending";
            return (
              <div key={person.id} className="flex items-start gap-2.5 border-t border-[#eef0f2] py-2 first:border-t-0">
                <button type="button" onClick={person.onOpen} className="shrink-0">
                  {person.profilePhotoUrl ? (
                    <img src={person.profilePhotoUrl} alt={person.name} className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dce6f1] text-xs font-semibold text-[#0a66c2]">
                      {initials(person.name)}
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={person.onOpen} className="truncate text-left text-sm font-semibold text-[#1f1f1f] hover:underline">
                    {person.name}
                  </button>
                  <p className="line-clamp-1 text-xs text-[#666]">{person.subtitle}</p>
                  <p className="line-clamp-1 text-xs text-[#666]">{person.location}</p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className={`shrink-0 rounded-full border px-3 py-[3px] text-xs font-semibold ${
                    pending
                      ? "cursor-default border-[#b0b4b8] bg-[#f3f2ef] text-[#666]"
                      : person.primaryLabel === "Message"
                        ? "border-[#0a66c2] bg-white text-[#0a66c2] hover:bg-[#eef3f8]"
                        : "border-[#0a66c2] bg-white text-[#0a66c2] hover:bg-[#eef3f8]"
                  }`}
                  onClick={person.onPrimaryAction}
                >
                  {person.primaryLabel}
                </button>
              </div>
            );
          })
        )}
      </div>
      <button type="button" className="w-full border-t border-[#eef0f2] px-4 py-2 text-left text-sm font-semibold text-[#0a66c2] hover:bg-[#f7f8fa]">
        Show more →
      </button>
    </section>
  );
}
