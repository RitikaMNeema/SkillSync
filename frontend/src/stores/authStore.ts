import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserRole } from "../types/common";

interface AuthState {
  token: string | null;
  userId: number | null;
  role: UserRole | null;
  setAuth: (auth: { token: string; userId: number; role: UserRole }) => void;
  logout: () => void;
}

export const authStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      role: null,
      setAuth: ({ token, userId, role }) => {
        localStorage.setItem("linkedin_token", token);
        localStorage.removeItem("skillsync_token");
        set({ token, userId, role });
      },
      logout: () => {
        localStorage.removeItem("linkedin_token");
        localStorage.removeItem("skillsync_token");
        set({ token: null, userId: null, role: null });
      }
    }),
    {
      name: "linkedin-auth",
      storage: createJSONStorage(() => localStorage)
    }
  )
);
