import { useCallback, useEffect, useState } from "react";

export type Role = "admin" | "analyst" | "datascience";

const STORAGE_KEY = "aria_role";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  analyst: "Analista",
  datascience: "Data Science",
};

export const ROLE_NAV: Record<Role, string[]> = {
  admin: ["/dashboard", "/cola", "/historico-fraude", "/monitor", "/testing", "/configuracion"],
  analyst: ["/cola", "/dashboard"],
  datascience: ["/historico-fraude", "/monitor", "/dashboard"],
};

function isRole(v: string | null): v is Role {
  return v === "admin" || v === "analyst" || v === "datascience";
}

// undefined = not read from localStorage yet (avoids an SSR/client hydration mismatch);
// null = read, nothing stored — caller should force a selection.
export function useRole() {
  const [role, setRoleState] = useState<Role | null | undefined>(undefined);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setRoleState(isRole(stored) ? stored : null);
  }, []);

  const setRole = useCallback((r: Role) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
  }, []);

  return { role, setRole };
}
