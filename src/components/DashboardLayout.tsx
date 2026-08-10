import { useState } from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { RoleModal } from "./RoleModal";
import { useRole } from "@/hooks/useRole";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { role, setRole } = useRole();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const forced = role === null; // read from localStorage, nothing stored yet
  const showModal = forced || switcherOpen;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        role={role}
        onOpenRoleModal={() => setSwitcherOpen(true)}
      />
      <main className={`${collapsed ? "ml-14" : "ml-[220px]"} min-h-screen transition-all duration-200`}>
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
