import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";
import { Input } from "./Input";

/** Left icon: clears input border inset; vertically centered.
 * `.linkedin-input` in globals sets fixed padding-left without ! — we use !pl-* on the field below. */
const LEADING_ICON_CLASS =
  "pointer-events-none absolute left-[15px] top-1/2 z-[1] size-[18px] -translate-y-1/2 text-[#666666] shrink-0";

/**
 * Pill search styling (navbar / jobs toolbars).
 * Important left padding overrides global `.linkedin-input` padding so icons never collide with text.
 */
export const linkedInSearchPillInputClassNames = cn(
  "!h-[46px] min-h-[46px] w-full rounded-full !border-2 border-solid border-[#b0b4b8] bg-[#ffffff]",
  "!pl-[3rem] !pr-5 text-[17px] leading-tight text-[#1f1f1f] placeholder:text-[#666666]",
  "caret-[#1f2937] accent-transparent [-webkit-appearance:none] appearance-none",
  "focus:border-[#666666] focus:!shadow-none focus:!outline-none focus:ring-0",
  "focus-visible:border-[#666666] focus-visible:!shadow-none focus-visible:!outline-none focus-visible:ring-0"
);

export type LeadingIconInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  Icon: LucideIcon;
  /** Lucide glyph weight (navbar uses slightly heavier strokes). */
  iconStrokeWidth?: number;
  iconClassName?: string;
  /** Classes on wrapper (width constraints, grid cell, etc.). */
  wrapperClassName?: string;
  /** Absolute right adornment (e.g. clear). Reserve space via input !pr-* in className or automatically when set. */
  endAdornment?: ReactNode;
  /** Merged onto the underlying `<input />`. */
  className?: string;
};

/** Search / location pills with an absolutely positioned leading icon (LinkedIn-aligned). */
export const LeadingIconInput = forwardRef<HTMLInputElement, LeadingIconInputProps>(function LeadingIconInput(
  { Icon, iconStrokeWidth = 2, iconClassName, wrapperClassName, className, endAdornment, ...props },
  ref
) {
  return (
    <div className={cn("relative isolate w-full min-w-0", wrapperClassName)}>
      <Icon className={cn(LEADING_ICON_CLASS, iconClassName)} aria-hidden strokeWidth={iconStrokeWidth} />
      <Input
        ref={ref}
        className={cn(
          linkedInSearchPillInputClassNames,
          className,
          endAdornment ? "!pr-10" : null
        )}
        {...props}
      />
      {endAdornment ? (
        <div className="pointer-events-none absolute inset-y-0 right-2 z-[2] flex items-center">
          <div className="pointer-events-auto">{endAdornment}</div>
        </div>
      ) : null}
    </div>
  );
});
