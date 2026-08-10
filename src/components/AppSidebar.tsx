import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Inbox, Settings, GaugeCircle, FlaskConical, ChevronLeft, ChevronRight, ShieldCheck, History } from "lucide-react";
import { ROLE_LABELS, ROLE_NAV, type Role } from "@/hooks/useRole";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cola", label: "In Progress", icon: Inbox },
  { to: "/historico-fraude", label: "Histórico de Gestión de Fraude", icon: History },
  { to: "/monitor", label: "Monitor del Agente", icon: GaugeCircle },
  { to: "/testing", label: "Testing", icon: FlaskConical },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar({ collapsed, onToggle, role, onOpenRoleModal }: {
  collapsed: boolean;
  onToggle: () => void;
  role: Role | null | undefined;
  onOpenRoleModal: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visibleNav = role ? nav.filter((item) => ROLE_NAV[role].includes(item.to)) : nav;

  return (
    <aside className={`fixed inset-y-0 left-0 ${collapsed ? "w-14" : "w-[220px]"} bg-sidebar text-sidebar-foreground flex flex-col z-20 transition-all duration-200`}>
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
          const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
                active ? "bg-sidebar-accent font-medium" : "hover:bg-white/10"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={onOpenRoleModal}
          title="Cambiar rol"
          className={`w-full flex items-center rounded-md -mx-1 px-1 py-1 hover:bg-white/10 transition-colors ${collapsed ? "justify-center" : "gap-3"}`}
        >
          <div className="h-9 w-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-[12px] font-semibold">
            MR
          </div>
          {!collapsed && (
            <div className="min-w-0 text-left">
              <div className="text-[13px] font-medium truncate">María Rodríguez</div>
              <div className="text-[11px] text-white/70 truncate">{role ? ROLE_LABELS[role] : "Supervisor"}</div>
            </div>
          )}
        </button>
        {!collapsed && (
          <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            ARIA Agente · Operativo
          </div>
        )}
      </div>
    </aside>
  );
}
