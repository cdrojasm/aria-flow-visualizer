import { useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  createOptimizerSession,
  getActiveAgentObjective,
  getOptimizerLaunchLimits,
  listAgentClaims,
  listAgentSessions,
  sendAgentMessage,
  startOptimizerSession,
  type AgentObjective,
  type AgentSession,
} from "@/lib/api/agent.functions";
import { AREA_DESCRIPTION, AREA_LABEL, BUDGET_RESOURCE_LABEL, budgetLabel } from "./labels";

function newMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `aria-${Date.now()}`;
}

/** Labels stored on the objective, in the words a channel manager uses. */
const SUCCESS_LABEL_COPY: Record<string, string> = {
  fraud_label: "fraude confirmado por el equipo de fraude",
};

const ERROR_COPY: Record<string, string> = {
  SESSION_POLICY:
    "No se pudo crear la sesión: el optimizador está deshabilitado o se alcanzó un límite de sesiones.",
  AGENT_PROMPT_NOT_READY: "El agente aún no tiene todos sus prompts activos. Inténtalo más tarde.",
  ROLE_NOT_ALLOWED: "Solo el Channel Manager puede lanzar el optimizador.",
  PERSONAL_DATA_BLOCKED: "Las notas contienen datos personales; quítalos e inténtalo de nuevo.",
};

/** apiFetch errors read `path -> status: {"detail":{"code":"X"}}`; show the code's copy. */
function errorMessage(failure: unknown, fallback: string) {
  if (!(failure instanceof Error)) return fallback;
  const code = /"code"\s*:\s*"([A-Z_]+)"/.exec(failure.message)?.[1];
  return (code && ERROR_COPY[code]) || fallback;
}

const SESSION_DATE = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

const pct = (value: number) => `${(value * 100).toFixed(1)} %`;

function objectiveGoal(objective: AgentObjective) {
  const target = SUCCESS_LABEL_COPY[objective.success_label] ?? objective.success_label;
  return `Mejorar la detección de ${target} sin bajar la precisión de ${pct(objective.precision_floor)}.`;
}

/** Two steps in one drawer: decide what to investigate and at what cost, then confirm and start. */
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
  // Optional context: when these fail the drawer still works, it just warns less.
  const limits = useQuery({
    queryKey: ["optimizerLaunchLimits"],
    queryFn: getOptimizerLaunchLimits,
    enabled: open,
  });
  const sessions = useQuery({
    queryKey: ["agentSessions"],
    queryFn: listAgentSessions,
    enabled: open,
  });
  const claims = useQueries({
    queries: areas.map((area) => ({
      queryKey: ["agentAreaClaims", area],
      queryFn: () => listAgentClaims(`scope#${area}`),
      enabled: open,
    })),
  });
  const busyAreas = areas.flatMap((area, index) =>
    (claims[index]?.data ?? []).map((claim) => ({ area, claim })),
  );

  const maxConcurrent = limits.data?.max_concurrent_sessions;
  const activeOptimizers = (sessions.data ?? []).filter(
    (item) => item.mode === "optimization" && item.status === "ACTIVE",
  ).length;
  const disabled = limits.data?.enabled === false;
  const atCapacity = maxConcurrent !== undefined && activeOptimizers >= maxConcurrent;
  const blocker = disabled
    ? "El optimizador está deshabilitado en la configuración."
    : atCapacity
      ? `Ya hay ${activeOptimizers} de ${maxConcurrent} sesiones corriendo. Espera a que una termine o cancélala para lanzar otra.`
      : "";

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
    onError: (failure) => setError(errorMessage(failure, "No se pudo crear la sesión.")),
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
    onError: (failure) => setError(errorMessage(failure, "No se pudo iniciar el optimizador.")),
  });

  const allSelected = areas.length === Object.keys(AREA_LABEL).length;
  const budgetCeiling = limits.data?.budget_ceiling ?? null;

  return (
    <SideDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Lanzar optimizador"
      description={
        draft
          ? "Confirma lo que investigará el agente y cuánto puede gastar."
          : "Define la meta, el alcance y el costo antes de lanzar."
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
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[11px] text-text-secondary">
              {areas.length === 0 && !blocker ? "Elige al menos un área." : ""}
            </span>
            <button
              type="button"
              disabled={!areas.length || create.isPending || objective.isLoading || !!blocker}
              onClick={() => create.mutate()}
              className="rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {create.isPending ? "Preparando…" : "Revisar y confirmar"}
            </button>
          </div>
        )
      }
    >
      {!draft ? (
        <div className="space-y-5">
          {objective.data && (
            <section
              aria-label="Meta de la investigación"
              data-testid="launch-objective"
              className="rounded-lg border border-primary/30 bg-primary/5 p-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Meta de esta investigación
              </p>
              <p className="mt-1 text-[13px] font-medium text-text-primary">
                {objectiveGoal(objective.data)}
              </p>
              <p className="mt-1 text-[11px] text-text-secondary">
                Objetivo v{objective.data.version}. Se ajusta en Configuración → Asistente y
                optimizador.
              </p>
            </section>
          )}

          <fieldset className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <legend className="text-[12px] font-medium text-text-secondary">
                ¿Qué debe investigar?
              </legend>
              <button
                type="button"
                onClick={() => setAreas(allSelected ? [] : Object.keys(AREA_LABEL))}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {allSelected ? "Limpiar" : "Seleccionar todas"}
              </button>
            </div>
            {Object.entries(AREA_LABEL).map(([value, label]) => (
              <label
                key={value}
                className="flex items-start gap-2.5 rounded-lg border border-border p-2.5 text-[13px] text-text-primary has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  aria-labelledby={`optimizer-area-${value}`}
                  aria-describedby={`optimizer-area-${value}-help`}
                  checked={areas.includes(value)}
                  onChange={(event) =>
                    setAreas((current) =>
                      event.target.checked
                        ? [...current, value]
                        : current.filter((item) => item !== value),
                    )
                  }
                />
                <span>
                  <span id={`optimizer-area-${value}`} className="block font-medium">
                    {label}
                  </span>
                  <span
                    id={`optimizer-area-${value}-help`}
                    className="block text-[11px] font-normal text-text-secondary"
                  >
                    {AREA_DESCRIPTION[value]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {busyAreas.length > 0 && (
            <div
              role="status"
              data-testid="launch-overlap"
              className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  Otra sesión ya está investigando parte de este alcance.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {busyAreas.map(({ area, claim }) => (
                    <li key={`${area}:${claim.session_id}`}>
                      {AREA_LABEL[area] ?? area} · activa desde{" "}
                      {SESSION_DATE.format(new Date(claim.claimed_at))}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Puedes lanzar igual, pero las dos sesiones pueden proponer cambios sobre lo mismo.
                </p>
              </div>
            </div>
          )}

          <label className="block text-[12px] text-text-secondary" htmlFor="optimizer-notes">
            Notas iniciales (opcional)
            <textarea
              id="optimizer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={8_000}
              className="mt-1 min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary"
              placeholder="Ej: la precisión cae en alertas de montos altos; empieza por ahí."
            />
            <span className="mt-1 block text-[11px]">
              El agente las lee como contexto para priorizar hipótesis; no amplían ni restringen el
              alcance. No incluyas datos personales de clientes.
            </span>
          </label>

          <section
            aria-label="Costo máximo de la sesión"
            data-testid="launch-budget"
            className="rounded-lg border border-border bg-card p-3 text-[12px]"
          >
            <p className="font-medium text-text-primary">Costo máximo de la sesión</p>
            {budgetCeiling ? (
              <>
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  {Object.entries(budgetCeiling).map(([resource, amount]) => (
                    <div key={resource}>
                      <dt className="text-text-secondary">
                        {BUDGET_RESOURCE_LABEL[resource] ?? resource}
                      </dt>
                      <dd className="font-medium tabular-nums text-text-primary">
                        {budgetLabel(resource, amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] text-text-secondary">
                  Son topes, no una estimación: si se agotan, el agente se detiene y te pide aprobar
                  más.
                </p>
              </>
            ) : (
              <p className="mt-1 text-[11px] text-text-secondary">
                El servidor asigna el tope al preparar la sesión; lo verás en el siguiente paso.
              </p>
            )}
          </section>

          {blocker && (
            <p
              role="alert"
              data-testid="launch-blocker"
              className="rounded-lg bg-warning/10 p-3 text-[12px] text-warning"
            >
              {blocker}
            </p>
          )}

          <p className="text-[12px] text-text-secondary">
            El optimizador propone experimentos y borradores. No activa cambios ni publica modelos:
            eso siempre lo decides tú.
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-[13px]">
          <section className="space-y-1">
            <p className="font-semibold text-text-primary">Qué va a investigar</p>
            <p className="text-text-secondary">
              {(draft.scope?.areas ?? []).map((area) => AREA_LABEL[area] ?? area).join(" · ")}
            </p>
            {notes.trim() && (
              <p className="rounded-lg bg-surface p-2 text-[12px] text-text-secondary">
                “{notes.trim()}”
              </p>
            )}
          </section>
          {objective.data && (
            <section className="space-y-1">
              <p className="font-semibold text-text-primary">
                Meta · objetivo v{objective.data.version}
              </p>
              <p className="text-text-secondary">{objectiveGoal(objective.data)}</p>
            </section>
          )}
          <section className="space-y-1">
            <p className="font-semibold text-text-primary">Presupuesto asignado</p>
            <p className="text-text-secondary">
              El servidor fija estos límites; son de solo lectura. Si se agotan, el agente se
              detiene y te pide aprobar más.
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
          </section>
          <p className="text-[12px] text-text-secondary">
            Al confirmar, el agente trabaja por su cuenta. Puedes pausarlo o cancelarlo desde el
            Optimizador, y te avisará cuando necesite una decisión.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger/10 p-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </SideDrawer>
  );
}
