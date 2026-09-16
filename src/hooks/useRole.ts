import { useCallback, useEffect, useState } from "react";
import {
  clearAccessToken,
  getCurrentUser,
  login,
  storeAccessToken,
  type AuthUser,
  type Role,
} from "@/lib/api/auth.functions";

export type { Role } from "@/lib/api/auth.functions";

export const ROLE_LABELS: Record<Role, string> = {
  manager: "Manager",
  channel_manager: "Channel Manager",
  release_manager: "Release Manager",
  data_analyst: "Data Analyst",
  fraud_analyst: "Fraud Analyst",
  ops_analyst: "Ops Analyst",
};

export const ROLE_NAV: Record<Role, string[]> = {
  manager: ["/dashboard", "/cola", "/historico-fraude", "/monitor", "/configuracion"],
  release_manager: [
    "/dashboard",
    "/cola",
    "/historico-fraude",
    "/monitor",
    "/configuracion",
    "/testing",
  ],
  channel_manager: [
    "/dashboard",
    "/cola",
    "/historico-fraude",
    "/monitor",
    "/testing",
    "/biblioteca",
    "/configuracion",
    "/modelos",
  ],
  data_analyst: ["/monitor", "/testing", "/biblioteca", "/modelos"],
  fraud_analyst: ["/cola"],
  ops_analyst: ["/dashboard", "/cola", "/monitor"],
};

export function useRole() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (!localStorage.getItem("aria.auth.accessToken")) {
      setUser(null);
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        clearAccessToken();
        setUser(null);
      });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await login(email, password);
    storeAccessToken(session.access_token);
    setUser(session);
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  return { user, role: user?.role, signIn, logout };
}
