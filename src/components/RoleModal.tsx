import { X, ShieldCheck, UserCheck, FlaskConical, Check } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/hooks/useRole";

const ROLE_ORDER: Role[] = ["admin", "analyst", "datascience"];

const ROLE_META: Record<Role, { icon: typeof ShieldCheck; desc: string }> = {
  admin: { icon: ShieldCheck, desc: "Acceso completo a todas las secciones." },
  analyst: { icon: UserCheck, desc: "In Progress y Dashboard." },
  datascience: { icon: FlaskConical, desc: "Histórico de Gestión de Fraude, Monitor del Agente y Dashboard." },
};

export function RoleModal({ current, forced, onSelect, onClose }: {
  current: Role | null;
  forced: boolean;
  onSelect: (role: Role) => void;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={forced ? undefined : onClose}>
      <div className="w-full max-w-sm bg-card rounded-xl border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-[15px] font-bold text-text-primary">Selecciona tu rol</div>
            <div className="text-[12px] text-text-secondary mt-0.5">
              {forced ? "Elige cómo quieres ver ARIA para continuar." : "Cambia la vista sin cerrar sesión."}
            </div>
          </div>
          {!forced && onClose && (
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
          )}
        </div>
        <div className="p-3 space-y-2">
          {ROLE_ORDER.map((role) => {
            const meta = ROLE_META[role];
            const Icon = meta.icon;
            const active = current === role;
            return (
              <button
                key={role}
                onClick={() => onSelect(role)}
                className={`w-full flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  active ? "border-primary bg-primary-light" : "border-border hover:bg-surface"
                }`}
              >
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? "text-primary" : "text-text-secondary"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text-primary">{ROLE_LABELS[role]}</div>
                  <div className="text-[11px] text-text-secondary mt-0.5">{meta.desc}</div>
                </div>
                {active && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
