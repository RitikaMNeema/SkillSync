import { useEffect, useState } from "react";

const DEFAULT_MS = 60_000;

/** Triggers a re-render on an interval so relative labels (e.g. "5m ago") update while the view is open. */
export function useMinuteTicker(intervalMs: number = DEFAULT_MS) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}
