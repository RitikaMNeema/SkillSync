import { useEffect, useState } from "react";
import { authStore } from "../stores/authStore";

/** True after zustand-persist has loaded `userId` / `role` from storage (avoids treating own profile as a stranger before rehydration). */
export function useAuthHydrated(): boolean {
  const [ready, setReady] = useState(() => safeHasHydrated());

  useEffect(() => {
    if (safeHasHydrated()) {
      setReady(true);
      return undefined;
    }
    const cleanup = safeOnFinishHydration(() => setReady(true));
    return cleanup;
  }, []);

  return ready;
}

function safeHasHydrated(): boolean {
  try {
    return authStore.persist.hasHydrated();
  } catch {
    return true;
  }
}

function safeOnFinishHydration(fn: () => void): (() => void) | undefined {
  try {
    return authStore.persist.onFinishHydration(fn);
  } catch {
    fn();
    return undefined;
  }
}
