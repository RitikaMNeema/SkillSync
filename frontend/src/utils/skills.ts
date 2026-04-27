/**
 * Keep in sync with backend `SKILL_CANONICAL_MAP` in
 * `profile_service/models/member_mysql.py` so `skills` and `skill_ids` match
 * what the server persists.
 */
const SKILL_CANONICAL_MAP: Record<string, string> = {
  "power bi": "Microsoft Power BI",
  "microsoft power bi": "Microsoft Power BI",
  css: "Cascading Style Sheets (CSS)",
  js: "JavaScript"
};

export function canonicalizeSkill(skill: string): string {
  const t = skill.trim();
  if (!t) return t;
  return SKILL_CANONICAL_MAP[t.toLowerCase()] ?? t;
}
