import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  createOptimizerSession,
  getActiveAgentObjective,
  sendAgentMessage,
  startOptimizerSession,
  type AgentSession,
} from "@/lib/api/agent.functions";
import { AREA_LABEL, BUDGET_RESOURCE_LABEL, budgetLabel } from "./labels";

function newMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `aria-${Date.now()}`;
}

/** Two steps in one drawer: choose the scope, then review the server-set budget and start. */
export function OptimizerLaunchDrawer({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (session: AgentSession) => void;
}) {
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<AgentSession | null>(null);
  const [error, setError] = useState("");
  const objective = useQuery({
    queryKey: ["agentActiveObjective"],
    queryFn: getActiveAgentObjective,
    enabled: open,
  });

  const reset = () => {
    setAreas([]);
    setNotes("");
    setDraft(null);
    setError("");
  };
  const create = useMutation({
    mutationFn: () => createOptimizerSession(areas),
    onSuccess: (created) => {
      setDraft(created);
      setError("");
    },
    onError: (failure) =>
      setError(failure instanceof Error ? failure.message : "No se pudo crear la sesión."),
  });
  const start = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("No hay sesión en revisión.");
      if (notes.trim()) await sendAgentMessage(draft.session_id, newMessageId(), notes.trim());
      return startOptimizerSession(draft.session_id);
    },
    onSuccess: (started) => {
      reset();
      onOpenChange(false);
      onStarted(started);
    },
    onError: (failure) =>
      setError(failure instanceof Error ? failure.message : "No se pudo iniciar el optimizador."),
  });

  return (
    <SideDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Lanzar optimizador"
      description={
        draft ? "Revisa el objetivo y el presupuesto antes de iniciar." : "Elige qué investigar."
      }
      dirty={areas.length > 0 || notes.length > 0}
      footer={
        draft ? (
          <>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-border px-3 py-2 text-[12px]"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate()}
              className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {start.isPending ? "Iniciando…" : "Confirmar e iniciar"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!areas.length || create.isPending || objective.isLoading}
            onClick={() => create.mutate()}
            className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
          >
            {create.isPending ? "Preparando…" : "Revisar objetivo y presupuesto"}
          </button>
        )
      }
    >
      {!draft ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-text-secondary">
              Alcance de la investigación
            </legend>
            {Object.entries(AREA_LABEL).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={areas.includes(value)}
                  onChange={(event) =>
                    setAreas((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((item) => item !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="block text-[12px] text-text-secondary" htmlFor="optimizer-notes">
            Notas iniciales
            <textarea
              id="optimizer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={8_000}
              className="mt-1 min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
              placeholder="¿Qué quieres investigar?"
            />
          </label>
          <p className="text-[12px] text-text-secondary">
            El optimizador propone experimentos y borradores. No activa cambios ni publica modelos.
          </p>
          {objective.data && (
            <div className="rounded-lg border border-border bg-card p-3 text-[12px] text-text-secondary">
              Objetivo activo v{objective.data.version}: {objective.data.success_label}; piso de
              precisión {(objective.data.precision_floor * 100).toFixed(1)}%.
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3 text-[13px]">
          <p className="font-semibold text-text-primary">
            Revisión previa · objetivo v{objective.data?.version ?? "—"}
          </p>
          <p className="text-text-secondary">
            El servidor asigna el presupuesto; los límites son de solo lectura.
          </p>
          <dl className="grid grid-cols-3 gap-2 text-[12px]">
            {Object.entries(draft.budget_limits).map(([resource, amount]) => (
              <div key={resource} className="rounded-lg border border-border p-2">
                <dt className="text-text-secondary">
                  {BUDGET_RESOURCE_LABEL[resource] ?? resource}
                </dt>
                <dd className="font-medium text-text-primary">{budgetLabel(resource, amount)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </SideDrawer>
  );
}
