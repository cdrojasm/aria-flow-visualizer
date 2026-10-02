import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clearAccessToken,
  clearUserDrafts,
  getCurrentUser,
  login,
  logoutSession,
  storeAccessToken,
  type AuthUser,
  type Role,
} from "@/lib/api/auth.functions";
import { ACCESS_TOKEN_KEY, SESSION_ENDED_EVENT } from "@/lib/api/client";

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
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    if (!localStorage.getItem(ACCESS_TOKEN_KEY)) {
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

  // The session can end outside this component: a 401 from any API call
  // (expired/revoked token) or a logout in another tab (the storage event
  // only fires in the *other* tabs).
  useEffect(() => {
    const endSession = () => {
      queryClient.clear();
      setUser(null);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACCESS_TOKEN_KEY && !event.newValue) endSession();
    };
    window.addEventListener(SESSION_ENDED_EVENT, endSession);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, endSession);
      window.removeEventListener("storage", onStorage);
    };
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await login(email, password);
    storeAccessToken(session.access_token);
    setUser(session);
  }, []);

  const logout = useCallback(async () => {
    // Best effort: even if the API is down the local session still ends;
    // the token then just runs out at its exp.
    await logoutSession().catch(() => undefined);
    clearAccessToken();
    clearUserDrafts();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  return { user, role: user?.role, signIn, logout };
}
