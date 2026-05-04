import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMember } from "../../api/members";
import { getRecruiter } from "../../api/recruiters";
import type { ProfileViewerEntry } from "../../types/analytics";
import { formatRelativeDate } from "../../utils/formatDate";

/** Kept in sync with analytics `profile_viewers_recent` aggregation limit. */
export const PROFILE_VIEWERS_DISPLAY_LIMIT = 5;

export function ProfileViewersList({ rows }: { rows: ProfileViewerEntry[] | undefined }) {
  const navigate = useNavigate();
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});

  const displayRows = useMemo(
    () => (rows ?? []).slice(0, PROFILE_VIEWERS_DISPLAY_LIMIT),
    [rows]
  );

  useEffect(() => {
    if (!displayRows.length) {
      setDisplayNames({});
      return;
    }
    let cancelled = false;
    const unique = [...new Set(displayRows.map((r) => String(r.viewer_user_id)))];
    void (async () => {
      const next: Record<string, string> = {};
      for (const id of unique) {
        const uid = Number(id);
        if (!Number.isFinite(uid)) continue;
        let label = "";
        try {
          const m = await getMember(uid);
          label = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
        } catch {
          try {
            const rec = await getRecruiter(uid);
            label = (rec.name ?? `${rec.first_name ?? ""} ${rec.last_name ?? ""}`).trim();
          } catch {
            label = "";
          }
        }
        next[id] = label || `User ${id}`;
      }
      if (!cancelled) setDisplayNames(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayRows]);

  if (!displayRows.length) return null;

  return (
    <div className="mt-4 border-t border-[#e6eaef] pt-4">
      <p className="text-sm font-semibold text-[#1f1f1f]">Who viewed your profile</p>
      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
        {displayRows.map((row, idx) => (
          <li key={`${String(row.viewer_user_id)}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              className="min-w-0 truncate text-left font-medium text-[#0a66c2] hover:underline"
              onClick={() => navigate(`/profile/${row.viewer_user_id}`)}
            >
              {displayNames[String(row.viewer_user_id)] ?? `User ${row.viewer_user_id}`}
            </button>
            <span className="shrink-0 tabular-nums text-[#6b7280]">{formatRelativeDate(row.last_viewed_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
