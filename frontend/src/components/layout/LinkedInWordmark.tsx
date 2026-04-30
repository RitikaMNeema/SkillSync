import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

interface LinkedInWordmarkProps {
  to?: string;
  compact?: boolean;
  className?: string;
}

export function LinkedInWordmark({ to = "/", compact = false, className }: LinkedInWordmarkProps) {
  const content = compact ? (
    <span className="flex h-12 w-12 items-center justify-center rounded-[6px] bg-[#0a66c2] text-[2rem] font-bold leading-none text-white">
      in
    </span>
  ) : (
    <span className="inline-flex items-center text-[2.15rem] font-semibold leading-none tracking-[-0.03em] text-[#0a66c2]">
      <span>Linked</span>
      <span className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#0a66c2] text-[1.8rem] text-white">
        in
      </span>
    </span>
  );

  return (
    <Link to={to} aria-label="LinkedIn home" className={cn("inline-flex items-center hover:no-underline", className)}>
      {content}
    </Link>
  );
}
