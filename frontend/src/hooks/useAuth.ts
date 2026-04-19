import { useEffect } from "react";
import { authStore } from "../context/AuthContext";
import { validateToken } from "../api/auth";

export function useAuth() {
  const token = authStore((state) => state.token);
  const userId = authStore((state) => state.userId);
  const role = authStore((state) => state.role);
  const setAuth = authStore((state) => state.setAuth);
  const logout = authStore((state) => state.logout);

  useEffect(() => {
    if (!token) return;
    void validateToken(token).then(
      (data) => {
        setAuth({ token, userId: data.user_id, role: data.role });
      },
      () => logout()
    );
  }, [logout, setAuth, token]);

  return { token, userId, role, setAuth, logout };
}
