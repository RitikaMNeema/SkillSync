import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProfileStatusOption } from "../../types/member";

export interface OpenToItem {
  value: ProfileStatusOption;
  title: string;
  description: string;
}

export const OPEN_TO_OPTIONS: OpenToItem[] = [
  {
    value: "open_to_work",
    title: "Open to work",
    description: "Show recruiters and connections that you are open to work"
  },
  {
    value: "hiring",
    title: "Hiring",
    description: "Let candidates know you are hiring"
  }
];

export function openToLabel(value: ProfileStatusOption | string | null | undefined): string {
  if (!value) return "Open to";
  if (value === "none") return "Open to";
  const match = OPEN_TO_OPTIONS.find((opt) => opt.value === value);
  return match ? match.title : "Open to";
}

/**
 * Trigger-button color palette keyed on the selected status. Green surfaces the
 * "Open to work" affordance (LinkedIn's signature green), while purple is used
 * for the "Hiring" state so recruiters are visually distinct.
 */
const TRIGGER_STYLES: Record<"open_to_work" | "hiring", { bg: string; bgHover: string }> = {
  open_to_work: { bg: "#046a38", bgHover: "#035a2f" },
  hiring: { bg: "#6e4dc9", bgHover: "#5d3eb5" }
};

function triggerStyle(value: ProfileStatusOption | string | null | undefined) {
  if (value === "hiring") return TRIGGER_STYLES.hiring;
  return TRIGGER_STYLES.open_to_work;
}

export function OpenToDropdown({
  value,
  onSelect,
  disabled
}: {
  value: ProfileStatusOption | string | null | undefined;
  onSelect: (next: ProfileStatusOption) => void;
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

  function handleSelect(option: ProfileStatusOption) {
    onSelect(option);
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

  const style = triggerStyle(value);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ backgroundColor: style.bg, borderColor: style.bg }}
        onMouseEnter={(event) => {
          event.currentTarget.style.backgroundColor = style.bgHover;
          event.currentTarget.style.borderColor = style.bgHover;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.backgroundColor = style.bg;
          event.currentTarget.style.borderColor = style.bg;
        }}
        className="inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold text-white transition disabled:opacity-60"
      >
        {openToLabel(value)}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </>
  );
}
