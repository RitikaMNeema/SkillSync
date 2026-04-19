import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", fullWidth, children, ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-pill border-2 px-4 py-1.5 text-base font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
  const variants: Record<Variant, string> = {
    primary: "border-brand bg-brand text-text-inverse hover:border-brand-dark hover:bg-brand-dark",
    secondary: "border-brand bg-transparent text-brand hover:bg-brand-light",
    danger: "border-[#cc1016] bg-transparent text-[#cc1016] hover:bg-red-50",
    ghost: "border-transparent bg-transparent text-text-secondary hover:bg-hover",
    icon: "h-9 w-9 rounded-full border-transparent bg-transparent p-0 text-text-secondary hover:bg-hover"
  };

  return (
    <button ref={ref} className={cn(base, variants[variant], fullWidth && "w-full", className)} {...props}>
      {children}
    </button>
  );
});
