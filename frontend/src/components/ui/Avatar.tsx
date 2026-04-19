import { cn } from "../../utils/cn";

const sizes = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-[72px] w-[72px] text-2xl",
  "2xl": "h-[120px] w-[120px] text-4xl",
  "3xl": "h-[200px] w-[200px] text-6xl"
} as const;

export function Avatar({
  src,
  alt,
  name,
  size = "md"
}: {
  src?: string | null;
  alt: string;
  name: string;
  size?: keyof typeof sizes;
}) {
  if (src) {
    return <img src={src} alt={alt} className={cn("rounded-full object-cover", sizes[size])} />;
  }

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={cn("flex items-center justify-center rounded-full bg-brand font-semibold text-white", sizes[size])}>
      {initials}
    </div>
  );
}
