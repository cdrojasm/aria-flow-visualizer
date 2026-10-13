import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Inbox,
  Settings,
  GaugeCircle,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  History,
  Library,
  BrainCircuit,
  LogOut,
} from "lucide-react";
import { ROLE_LABELS, ROLE_NAV, type Role } from "@/hooks/useRole";
import type { AuthUser } from "@/lib/api/auth.functions";
import { LogoutDialog } from "./LogoutDialog";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cola", label: "En proceso", icon: Inbox },
  { to: "/historico-fraude", label: "Histórico de Gestión de Fraude", icon: History },
  { to: "/monitor", label: "Monitor del Agente", icon: GaugeCircle },
  { to: "/testing", label: "Testing", icon: FlaskConical },
  { to: "/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/modelos", label: "Modelos", icon: BrainCircuit },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar({
  collapsed,
  onToggle,
  role,
  user,
  onLogout,
  apiHealthy,
}: {
  collapsed: boolean;
  onToggle: () => void;
  role: Role | null | undefined;
  user: AuthUser | null | undefined;
  onLogout: () => Promise<void>;
  apiHealthy: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [confirmLogout, setConfirmLogout] = useState(false);
  const visibleNav = role ? nav.filter((item) => ROLE_NAV[role].includes(item.to)) : nav;

  return (
    <aside
      className={`fixed inset-y-0 left-0 ${collapsed ? "w-14" : "w-[220px]"} bg-sidebar text-sidebar-foreground flex flex-col z-20 transition-all duration-200`}
    >
      <div className="h-16 flex items-center justify-between px-3">
        {!collapsed && (
          <span className="flex items-center gap-2 text-[18px] font-bold tracking-tight px-2">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            ARIA
          </span>
        )}
        <button
          onClick={onToggle}
          className={`${collapsed ? "mx-auto" : ""} p-1.5 rounded-md hover:bg-white/10 transition-colors`}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <nav className="flex-1 px-2 space-y-1">
        {visibleNav.map((item) => {
          const active =
            pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          const Icon = item.icon;
          const itemClasses = `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
            active ? "bg-sidebar-accent font-medium" : "hover:bg-white/10"
          } ${collapsed ? "justify-center" : ""} ${!apiHealthy ? "opacity-40 pointer-events-none cursor-not-allowed" : ""}`;

          if (!apiHealthy) {
            return (
              <span
                key={item.to}
                title="No disponible — servicio API caído"
                className={itemClasses}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </span>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={itemClasses}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-3"}`}>
          <div
            className="h-9 w-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-[12px] font-semibold"
            title={collapsed ? user?.name : undefined}
          >
            {user?.name.slice(0, 2).toUpperCase() ?? "AR"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate">
                {user?.name ?? "Sesión requerida"}
              </div>
              <div className="text-[11px] text-white/70 truncate">
                {role ? ROLE_LABELS[role] : "Sin sesión"}
              </div>
            </div>
          )}
          {user && (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="shrink-0 p-1.5 rounded-md hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
            <span className="relative flex h-2 w-2">
              {apiHealthy && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${apiHealthy ? "bg-success" : "bg-danger"}`}
              />
            </span>
            ARIA Agente · {apiHealthy ? "Operativo" : "No disponible"}
          </div>
        )}
      </div>
      <LogoutDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        user={user}
        onLogout={onLogout}
      />
    </aside>
  );
}
