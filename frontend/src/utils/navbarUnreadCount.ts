/**
 * Navbar messaging badge: only positive finite integers count as unread.
 * Coerces null/undefined/NaN/''/false → 0 (no badge).
 */
export function normalizeNavbarUnreadCount(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 999_999);
}
