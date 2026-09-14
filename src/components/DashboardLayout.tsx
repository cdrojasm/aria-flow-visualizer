import { useState } from "react";
import type { ReactNode } from "react";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { AppSidebar } from "./AppSidebar";
import { RoleModal } from "./RoleModal";
import { useRole } from "@/hooks/useRole";
import { useApiHealth } from "@/hooks/useApiHealth";

export function DashboardLayout({ children, bottomBar }: { children: ReactNode; bottomBar?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
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
      <main
        className={`${collapsed ? "ml-14" : "ml-[220px]"} min-h-screen transition-all duration-200`}
      >
        {apiChecked && !apiHealthy && (
          <div className="sticky top-0 z-30 flex items-center gap-2.5 bg-danger/10 border-b border-danger/30 px-6 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[13px] text-danger font-medium">
              El servicio API no está disponible. ARIA no funciona sin el servicio principal —
              verifica el proveedor.
            </p>
          </div>
        )}
        <div className="px-8 pt-4">
          <button
            type="button"
            onClick={() => {
              if (canGoBack) {
                router.history.back();
                return;
              }

              navigate({ to: "/dashboard", replace: true });
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Volver a la vista anterior"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </button>
        </div>
        {bottomBar ? <div className="pb-64 sm:pb-44 lg:pb-32">{children}</div> : children}
        {bottomBar && (
          <div className={`fixed bottom-0 right-0 z-30 border-t border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.06)] transition-[left] duration-200 ${collapsed ? "left-14" : "left-[220px]"}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }} role="region" aria-label="Acciones de configuración">
            {bottomBar}
          </div>
        )}
      </main>
      {showModal && (
        <RoleModal
          current={role ?? null}
          forced={forced}
          onSelect={(r) => {
            setRole(r);
            setSwitcherOpen(false);
          }}
          onClose={forced ? undefined : () => setSwitcherOpen(false)}
        />
      )}
    </div>
  );
}
