import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";

export type ProfileSectionKey =
  | "photo"
  | "headline"
  | "about"
  | "education"
  | "experience"
  | "skills"
  | "resume";

interface SectionLink {
  key: ProfileSectionKey;
  label: string;
}

interface SectionGroup {
  title: string;
  description?: string;
  items: SectionLink[];
  expandedByDefault?: boolean;
}

const GROUPS: SectionGroup[] = [
  {
    title: "Core",
    description: "Complete these core sections to improve your profile visibility to recruiters and connections.",
    expandedByDefault: true,
    items: [
      { key: "photo", label: "Add profile photo" },
      { key: "headline", label: "Add headline" },
      { key: "about", label: "Add about" },
      { key: "education", label: "Add education" },
      { key: "experience", label: "Add position" },
      { key: "skills", label: "Add skills" }
    ]
  },
  {
    title: "Recommended",
    items: [{ key: "resume", label: "Add resume" }]
  }
];

export function AddProfileSectionModal({
  onClose,
  onSelect
}: {
  onClose: () => void;
  onSelect: (key: ProfileSectionKey) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of GROUPS) initial[group.title] = Boolean(group.expandedByDefault);
    return initial;
  });

  function toggle(title: string) {
    setExpanded((current) => ({ ...current, [title]: !current[title] }));
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-4 py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100vh-3rem)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between border-b border-[#e4e7eb] px-6 py-4">
          <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-[#1f1f1f]">Add to profile</h2>
          <button type="button" aria-label="Close" className="rounded-full p-2 text-[#4d4d4d] transition hover:bg-[#f3f6f8]" onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="rounded-xl border border-[#e4e7eb] bg-[#f9fafb] p-5">
            <h3 className="text-[1.05rem] font-semibold text-[#1f1f1f]">
              Set up your profile in minutes with a resume
            </h3>
            <p className="mt-1 text-sm text-[#666666]">
              Upload a recent resume to fill out your profile with the help of AI.
            </p>
            <div className="mt-3">
              <Button
                className="rounded-full px-5 py-2 text-sm font-semibold"
                onClick={() => onSelect("resume")}
              >
                Get started
              </Button>
            </div>
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.04em] text-[#666666]">Manual setup</p>

          <div className="mt-2 divide-y divide-[#e4e7eb] border-t border-b border-[#e4e7eb]">
            {GROUPS.map((group) => {
              const isOpen = Boolean(expanded[group.title]);
              return (
                <div key={group.title}>
                  <button
                    type="button"
                    onClick={() => toggle(group.title)}
                    className="flex w-full items-center justify-between py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[1.05rem] font-semibold text-[#1f1f1f]">{group.title}</span>
                    <ChevronDown className={`h-5 w-5 text-[#434343] transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen ? (
                    <div className="pb-4">
                      {group.description ? (
                        <p className="mb-2 text-sm text-[#666666]">{group.description}</p>
                      ) : null}
                      <ul className="divide-y divide-[#eef1f4]">
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              onClick={() => onSelect(item.key)}
                              className="flex w-full items-center justify-between py-3 text-left text-[1rem] text-[#1f1f1f] transition hover:text-[#0a66c2]"
                            >
                              {item.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
