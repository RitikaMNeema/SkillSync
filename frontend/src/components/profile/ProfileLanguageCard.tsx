import { Check, Copy, Pencil } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Card } from "../ui/Card";

const LANGUAGE_OPTIONS = [
  "English",
  "Español",
  "Français",
  "Deutsch",
  "Português",
  "Italiano",
  "中文",
  "日本語",
  "한국어",
  "हिन्दी",
  "العربية"
];

export function ProfileLanguageCard({
  language,
  slug,
  isOwnProfile,
  onLanguageChange
}: {
  language: string | null | undefined;
  slug: string | null | undefined;
  isOwnProfile: boolean;
  onLanguageChange: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(language || "English");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveLanguage = language || "English";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = slug ? `${origin}/in/${slug}` : `${origin}/in/`;

  async function handleSave() {
    if (!draft || draft === effectiveLanguage) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onLanguageChange(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <Card className="rounded-[22px] border border-[#dde3ea] bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#1f1f1f]">Profile language</h3>
        {isOwnProfile ? (
          <button
            type="button"
            aria-label="Edit profile language"
            onClick={() => {
              setDraft(effectiveLanguage);
              setEditing((current) => !current);
            }}
            className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="linkedin-input h-10 flex-1 rounded-[10px] border-[#b8c0c7] bg-white px-3 text-sm text-[#1f1f1f]"
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#0a66c2] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#084c8f] disabled:opacity-60"
          >
            Save
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-[#555555]">{effectiveLanguage}</p>
      )}

      <div className="my-4 border-t border-[#e4e7eb]" />

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#1f1f1f]">Public profile & URL</h3>
        <button
          type="button"
          aria-label={copied ? "Link copied" : "Copy profile URL"}
          onClick={handleCopy}
          className="rounded-full p-2 text-[#434343] transition hover:bg-[#f3f6f8]"
        >
          {copied ? <Check className="h-4 w-4 text-[#046a38]" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <a
        href={publicUrl}
        className="mt-1 block break-all text-sm text-[#0a66c2] hover:underline"
        target="_blank"
        rel="noreferrer"
      >
        {publicUrl}
      </a>
    </Card>
  );
}
