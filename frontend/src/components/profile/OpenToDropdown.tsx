import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OpenToOption } from "../../types/member";

export interface OpenToItem {
  value: OpenToOption;
  title: string;
  description: string;
}

export const OPEN_TO_OPTIONS: OpenToItem[] = [
  {
    value: "job",
    title: "Finding a new job",
    description: "Show recruiters and others that you're open to work"
  },
  {
    value: "hiring",
    title: "Hiring",
    description: "Share that you're hiring and attract qualified candidates"
  },
  {
    value: "services",
    title: "Providing services",
    description: "Showcase services you offer so new clients can discover you"
  },
  {
    value: "volunteer",
    title: "Finding volunteer opportunities",
    description: "Show that you are open to skill-based volunteering"
  }
];

export function openToLabel(value: OpenToOption | string | null | undefined): string {
  if (!value) return "Open to";
  const match = OPEN_TO_OPTIONS.find((opt) => opt.value === value);
  return match ? match.title : "Open to";
}

export function OpenToDropdown({
  value,
  onSelect,
  disabled
}: {
  value: OpenToOption | string | null | undefined;
  onSelect: (next: OpenToOption | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setPosition(null);
      return;
    }
    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 8, left: rect.left });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleSelect(option: OpenToOption) {
    const next = option === value ? null : option;
    onSelect(next);
    setOpen(false);
  }

  const menuPanel = open && position ? (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: position.top, left: position.left }}
      className="fixed z-[100] w-[360px] overflow-hidden rounded-xl border border-[#dde3ea] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
    >
      <ul className="py-2">
        {OPEN_TO_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <li key={option.value}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => handleSelect(option.value)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#f3f6f8]"
              >
                <div className="mt-0.5 h-5 w-5 shrink-0">
                  {selected ? <Check className="h-5 w-5 text-[#0a66c2]" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#1f1f1f]">{option.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#666666]">{option.description}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#046a38] bg-[#046a38] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#035a2f] disabled:opacity-60"
      >
        {openToLabel(value)}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </>
  );
}
