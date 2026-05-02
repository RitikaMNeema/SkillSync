/**
 * Kaggle / LinkedIn imports keep `company_id` as the seed org (e.g. Acme) for FK reasons.
 * Real hiring company is stored as the first line of description:
 *   [employer:Some Company Name]
 */
/** Allow BOM / leading whitespace before the tag (some editors or exports). */
const LISTING_EMPLOYER = /^\uFEFF?\s*\[employer:([^\]]+)\]\s*\n?/;

export function stripListingEmployerPrefix(description: string | null | undefined): string {
  return (description ?? "").replace(LISTING_EMPLOYER, "").trimStart();
}

/** Name shown on job cards / headers (falls back to joined `company_name`). */
export function getListingEmployerDisplayName(job: {
  description?: string | null;
  company_name?: string | null;
  listing_employer?: string | null;
}): string {
  const fromApi = job.listing_employer?.trim();
  if (fromApi) return fromApi;
  const m = job.description?.match(LISTING_EMPLOYER);
  if (m?.[1]?.trim()) return m[1].trim();
  return (job.company_name ?? "Company").trim() || "Company";
}
