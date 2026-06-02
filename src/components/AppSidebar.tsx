import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Inbox, ListChecks, Activity, Settings, GaugeCircle } from "lucide-react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cola", label: "Mi cola", icon: Inbox },
  { to: "/casos", label: "Casos", icon: ListChecks },
  { to: "/monitor", label: "Monitor del Agente", icon: GaugeCircle },
  { to: "/agente", label: "Agente ARIA", icon: Activity },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="fixed inset-y-0 left-0 w-[220px] bg-sidebar text-sidebar-foreground flex flex-col z-20">
      <div className="px-5 h-16 flex items-center">
        <span className="text-[18px] font-bold tracking-tight">ARIA</span>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
                active ? "bg-sidebar-accent font-medium" : "hover:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center text-[12px] font-semibold">
            MR
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">María Rodríguez</div>
            <div className="text-[11px] text-white/70 truncate">Supervisor</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          ARIA Agente · Operativo
        </div>
      </div>
    </aside>
  );
}
