import { cn } from "../../utils/cn";

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  const p = parts[0] ?? local;
  return p.slice(0, 2).toUpperCase() || "?";
}

const BG = ["bg-[#dce6f1]", "bg-[#e8dcf5]", "bg-[#d9e8f3]", "bg-[#e5e8f0]"] as const;
const FG = ["text-[#38434f]", "text-[#5c3d6e]", "text-[#334e68]", "text-[#494949]"] as const;

type MutualAvatarStackProps = {
  emails: readonly string[];
  className?: string;
};

/** LinkedIn-style overlapping circular initials for mutual connection hints. */
export function MutualAvatarStack({ emails, className }: MutualAvatarStackProps) {
  const slice = emails.slice(0, 4);
  if (slice.length === 0) return null;

  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      {slice.map((email, i) => (
        <div
          key={`${email}-${i}`}
          title={email}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-bold leading-none shadow-sm ring-1 ring-black/5",
            BG[i % BG.length],
            FG[i % FG.length],
            i > 0 && "-ml-1.5"
          )}
          aria-hidden
        >
          {initialsFromEmail(email)}
        </div>
      ))}
    </div>
  );
}
