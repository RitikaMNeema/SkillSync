import type { Job } from "../../types/job";
import type { MemberProfile } from "../../types/member";
import type { CandidateProfile, JobPayload } from "../../api/ai";

export type FlowIntent =
  | "job_match"
  | "applicant_shortlist"
  | "outreach_focus"
  | "talent_pool";

export const R_PRIMARY = "#0A66C2";

/** Aligned with backend `OUTREACH_MIN_MATCH_SCORE` — outreach drafts only at or above this score. */
export const MIN_OUTREACH_MATCH_SCORE = 80;

/** Strip LLM preamble lines and template tokens; inject real candidate / recruiter names. */
const OUTREACH_META_LEAD =
  /^\s*(here'?s a professional outreach[^\n]*|here'?s an? professional outreach[^\n]*|here'?s an? outreach[^\n]*|here is an? outreach[^\n]*|below is[^\n]*|this is an? outreach[^\n]*|the following is[^\n]*|here'?s (a|the) message[^\n]*)\s*:?\s*\n+/i;

/** Map fullwidth / lenticular brackets to ASCII so `\[` patterns match. */
function normalizeBracketChars(s: string): string {
  return s
    .replace(/\uFF3B/g, "[")
    .replace(/\uFF3D/g, "]")
    .replace(/\u3010/g, "[")
    .replace(/\u3011/g, "]");
}

/**
 * If the opening line is Hi/Hello/Dear followed by a bracket token that clearly
 * means "candidate name" (including Unicode lookalikes the model may use), replace
 * the whole token with the real name. Catches cases literal `[Candidate Name]` misses.
 */
function fixLeadingBracketGreeting(s: string, displayName: string): string {
  const g = displayName.trim() || "there";
  const lines = s.split(/\r?\n/);
  if (!lines.length) return s;
  const first = lines[0];
  const replaced = first.replace(
    /^(Hi|Hello|Dear)\s+(\[[^\]\r\n]+?\])(\s*,)?/i,
    (full, greet: string, bracket: string, comma: string | undefined) => {
      const innerRaw = bracket.slice(1, -1);
      const inner = innerRaw.normalize("NFKC").toLowerCase();
      const looksCandidateSlot =
        (inner.includes("candidate") && inner.includes("name")) ||
        inner === "name" ||
        inner === "candidate" ||
        /\bcandid\w*\s+name\b/.test(inner) ||
        /\bapplicant\s+name\b/.test(inner);
      const looksRecruiterSlot = inner.includes("your") && inner.includes("name");
      if (looksRecruiterSlot) return full;
      if (!looksCandidateSlot) return full;
      const punct = comma?.trim() === "," ? "," : comma ? comma : ",";
      return `${greet} ${g}${punct}`;
    }
  );
  if (replaced !== first) {
    lines[0] = replaced;
    return lines.join("\n");
  }
  return s;
}

/** Pull outreach body from trace (final_result first, then last completed outreach_generator step). */
export function extractOutreachMessageFromTrace(trace: {
  final_result?: {
    outreach_draft?: { message?: string | null } | null;
  } | null;
  steps?: Array<{ step_name?: string; data?: { message?: string; skipped?: boolean } }>;
}): string {
  const fromFinal = trace.final_result?.outreach_draft?.message;
  if (typeof fromFinal === "string" && fromFinal.trim()) return fromFinal;
  const steps = trace.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const s = steps[i];
    if (s?.step_name !== "outreach_generator" || !s.data || s.data.skipped) continue;
    const m = s.data.message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "";
}

export function sanitizeOutreachDraft(raw: string, candidateName: string, recruiterName: string): string {
  let s = (raw || "").trim().normalize("NFKC");
  s = normalizeBracketChars(s);
  for (let i = 0; i < 8; i++) {
    const next = s.replace(OUTREACH_META_LEAD, "").trim();
    if (next === s) break;
    s = next;
  }
  const g = candidateName.trim() || "there";
  const r = recruiterName.trim() || "Recruiting Team";
  const ws = String.raw`[\s\u00A0\u202F\u2007]+`;
  s = s
    .replace(new RegExp(String.raw`\[\s*Candidate${ws}Name\s*\]`, "gi"), g)
    .replace(/\[Candidate Name\]/gi, g)
    .replace(/\[Candidate(?:'|\u2019)s Name\]/gi, g)
    .replace(/\{Candidate Name\}/gi, g)
    .replace(/\[CandidateName\]/gi, g)
    .replace(/\[CANDIDATE_NAME\]/gi, g)
    .replace(/\[candidate_name\]/gi, g)
    .replace(/\[Your Name\]/gi, r)
    .replace(/\[\s*Your\s+Name\s*\]/gi, r)
    .replace(/\[Recruiter Name\]/gi, r)
    .replace(/\[Hiring Manager Name\]/gi, r);
  s = fixLeadingBracketGreeting(s, g);
  return s.trim();
}

export function formatMemberLocation(m: Pick<MemberProfile, "location_city" | "location_state">): string {
  return [m.location_city, m.location_state].filter(Boolean).join(", ") || "—";
}

export function memberToCandidateProfile(m: MemberProfile): CandidateProfile {
  // Keep in sync with ApplicantReviewPage candidate payload so match scores match
  // across the shortlist table and per-applicant AI review (embeddings + fuzzy skills use this text).
  const experiences = (m.experience ?? [])
    .map((e) => [e.title, e.company, e.description].filter(Boolean).join(" - ").trim())
    .filter(Boolean) as string[];
  const education = (m.education ?? [])
    .map((e) => [e.school, e.degree, e.field ?? e.field_of_study].filter(Boolean).join(", ").trim())
    .filter(Boolean) as string[];
  const location =
    [m.location_city, m.location_state, m.location_country].filter(Boolean).join(", ") ||
    formatMemberLocation(m);
  return {
    member_id: m.member_id,
    headline: m.headline ?? "",
    summary: m.summary ?? "",
    skills: m.skills ?? [],
    experiences,
    location,
    education,
    // Pass dedicated resume_text when available; otherwise fall back to summary,
    // which the Kaggle seeder stores the full resume text in (up to 12,000 chars).
    resume_text: (m.resume_text ?? m.summary ?? "").trim()
  };
}

export function jobToPayload(job: Job): JobPayload {
  return {
    job_id: job.job_id,
    title: job.title,
    description: job.description ?? "",
    skills_required: job.skills_required ?? [],
    location: job.location ?? "",
    seniority_level: job.seniority_level ?? "",
    employment_type: job.employment_type ?? ""
  };
}

/** Rough years for display (reference UI). */
export function estimateExperienceYears(m: MemberProfile): number {
  const ex = m.experience ?? [];
  if (!ex.length) return 0;
  let sum = 0;
  for (const e of ex) {
    const start = e.start_year ?? null;
    const end = e.end_year ?? (e.is_current ? new Date().getFullYear() : null);
    if (start && end && end >= start) sum += end - start;
    else sum += 1.5;
  }
  return Math.round(sum * 10) / 10;
}

export function bucketForScore(score: number): "top" | "good" | "possible" | "low" {
  if (score >= 85) return "top";
  if (score >= 70) return "good";
  if (score >= 50) return "possible";
  return "low";
}

export function bucketCounts(rows: { bucket: "top" | "good" | "possible" | "low" }[]) {
  return {
    top: rows.filter((r) => r.bucket === "top").length,
    good: rows.filter((r) => r.bucket === "good").length,
    possible: rows.filter((r) => r.bucket === "possible").length,
    low: rows.filter((r) => r.bucket === "low").length
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  }

  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * AI match % colors: green above 80, orange from 60 through 80, red below 60.
 * (Exactly 80 is orange; above 80 is green.)
 */
export function matchScoreStyles(score: number): {
  scoreText: string;
  labelText: string;
  panel: string;
  dialRing: string;
  dialPct: string;
  dialSub: string;
} {
  const n = Number(score);
  if (!Number.isFinite(n)) {
    return {
      scoreText: "text-gray-800",
      labelText: "text-gray-500",
      panel: "border-[#e5e7eb] bg-[#f9fafb]",
      dialRing: "border-gray-300",
      dialPct: "text-gray-800",
      dialSub: "text-gray-500"
    };
  }
  if (n > 80) {
    return {
      scoreText: "text-green-700",
      labelText: "text-green-800",
      panel: "border-green-200 bg-green-50",
      dialRing: "border-green-600",
      dialPct: "text-green-700",
      dialSub: "text-green-800"
    };
  }
  if (n >= 60) {
    return {
      scoreText: "text-orange-600",
      labelText: "text-orange-800",
      panel: "border-orange-200 bg-orange-50",
      dialRing: "border-orange-500",
      dialPct: "text-orange-600",
      dialSub: "text-orange-800"
    };
  }
  return {
    scoreText: "text-red-600",
    labelText: "text-red-800",
    panel: "border-red-200 bg-red-50",
    dialRing: "border-red-500",
    dialPct: "text-red-600",
    dialSub: "text-red-800"
  };
}

export function insightBulletsFromMatch(reasoning?: string, recommendation?: string): string[] {
  const parts: string[] = [];
  if (recommendation?.trim()) parts.push(recommendation.trim());
  if (reasoning?.trim()) {
    const chunks = reasoning
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
    parts.push(...chunks);
  }
  const uniq = [...new Set(parts)];
  return uniq.slice(0, 5);
}

/** UI-only breakdown bars (backend returns aggregate match + text fits). */
export function breakdownPercents(match: {
  match_score: number;
  overlap_score?: number;
  embedding_score?: number;
  location_fit?: string;
}): { skills: number; experience: number; location: number; education: number } {
  const skills = Math.min(100, Math.round(match.overlap_score ?? match.match_score));
  const experience = Math.min(100, Math.round(match.embedding_score ?? match.match_score * 0.92));
  const loc =
    match.location_fit?.toLowerCase().includes("same") ||
    match.location_fit?.toLowerCase().includes("match")
      ? 88
      : 62;
  const education = Math.min(95, Math.round((match.embedding_score ?? match.match_score) * 0.9));
  return { skills, experience, location: loc, education };
}
