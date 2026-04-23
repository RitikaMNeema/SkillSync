/**
 * Heuristic: turn a company or school name into a guessed domain for the
 * Clearbit Logo API. This is intentionally simple — the `<img>` element has an
 * onError fallback, so misses just render the placeholder.
 *
 *   "Google"                 -> google.com
 *   "Northeastern University"-> northeastern.edu
 *   "MIT"                    -> mit.edu
 */
const SCHOOL_HINTS = [" university", " college", " institute", " school", " polytechnic"];

const STRIP_SUFFIXES = [
  " university",
  " college",
  " institute of technology",
  " institute",
  " school",
  " polytechnic",
  ", inc",
  " inc.",
  " inc",
  " llc",
  " ltd",
  " ltd.",
  " corporation",
  " corp.",
  " corp",
  " co.",
  " company"
];

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function guessDomain(name: string | null | undefined): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  const isSchool = SCHOOL_HINTS.some((hint) => lower.includes(hint));
  let cleaned = lower;
  for (const suffix of STRIP_SUFFIXES) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.slice(0, cleaned.length - suffix.length).trim();
      break;
    }
  }
  const token = slug(cleaned);
  if (!token) return null;
  return isSchool ? `${token}.edu` : `${token}.com`;
}

export function clearbitLogoUrl(name: string | null | undefined): string | null {
  const domain = guessDomain(name);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}`;
}
