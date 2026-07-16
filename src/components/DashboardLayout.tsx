import { useState } from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className={`${collapsed ? "ml-14" : "ml-[220px]"} min-h-screen transition-all duration-200`}>
        {children}
      </main>
    </div>
  );
}
