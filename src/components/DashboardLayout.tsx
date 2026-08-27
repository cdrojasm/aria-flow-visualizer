import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { RoleModal } from "./RoleModal";
import { useRole } from "@/hooks/useRole";
import { useApiHealth } from "@/hooks/useApiHealth";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { role, setRole } = useRole();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { healthy: apiHealthy, checked: apiChecked } = useApiHealth();

  const forced = role === null; // read from localStorage, nothing stored yet
  const showModal = forced || switcherOpen;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        role={role}
        onOpenRoleModal={() => setSwitcherOpen(true)}
        apiHealthy={apiHealthy}
      />
      <main className={`${collapsed ? "ml-14" : "ml-[220px]"} min-h-screen transition-all duration-200`}>
        {apiChecked && !apiHealthy && (
          <div className="sticky top-0 z-30 flex items-center gap-2.5 bg-danger/10 border-b border-danger/30 px-6 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[13px] text-danger font-medium">
              El servicio API no está disponible. ARIA no funciona sin el servicio principal — verifica el proveedor.
            </p>
          </div>
        )}
        {children}
      </main>
      {showModal && (
        <RoleModal
          current={role ?? null}
          forced={forced}
          onSelect={(r) => { setRole(r); setSwitcherOpen(false); }}
          onClose={forced ? undefined : () => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
}
