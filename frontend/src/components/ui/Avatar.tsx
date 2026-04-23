import { Plus } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
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

const ringClass = "ring-4 ring-white";

type AvatarProps = {
  src?: string | null;
  alt: string;
  name: string;
  size?: keyof typeof sizes;
  editable?: boolean;
  onFileSelected?: (file: File) => void;
  uploading?: boolean;
};

export function Avatar({ src, alt, name, size = "md", editable, onFileSelected, uploading }: AvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dimension = sizes[size];

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleClick = () => inputRef.current?.click();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file && onFileSelected) {
      onFileSelected(file);
    }
  };

  const imageNode = src ? (
    <img src={src} alt={alt} className={cn("rounded-full object-cover", dimension, editable && ringClass)} />
  ) : (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-[#dce6f1] font-semibold text-[#0a66c2]",
        dimension,
        editable && ringClass
      )}
    >
      {name.trim() ? (
        initials
      ) : (
        <svg viewBox="0 0 128 128" className="h-3/4 w-3/4 text-[#a8b7c7]" fill="currentColor" aria-hidden>
          <circle cx="64" cy="48" r="24" />
          <path d="M20 112c0-22 20-36 44-36s44 14 44 36v8H20v-8z" />
        </svg>
      )}
    </div>
  );

  if (!editable) {
    return imageNode;
  }

  return (
    <div className={cn("relative inline-block", dimension)}>
      {imageNode}
      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        aria-label="Change profile photo"
        className={cn(
          "absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-[#0a66c2] text-white shadow transition hover:bg-[#004182] disabled:opacity-60"
        )}
      >
        <Plus className="h-5 w-5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
        data-avatar-upload=""
      />
    </div>
  );
}
