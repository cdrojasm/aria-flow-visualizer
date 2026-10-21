import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Rocket, Square } from "lucide-react";
import { AgentReleasePanel } from "./AgentReleasePanel";
import {
  controlOptimizerSession,
  createOptimizerSession,
  getActiveAgentObjective,
  listAgentAudit,
  listAgentExperiments,
  getAgentSessionBudget,
  listAgentClaims,
  listAgentHypotheses,
  listAgentIterations,
  listAgentMessages,
  listAgentPackages,
  sendAgentMessage,
  startOptimizerSession,
  type AgentSession,
} from "@/lib/api/agent.functions";

const AREAS = [
  ["library", "Biblioteca"],
  ["configuration", "Configuración"],
  ["vector_store", "Vector store"],
  ["model", "Modelos"],
] as const;

const ACTIVE = new Set(["ACTIVE", "RUNNING"]);
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "STOPPED"]);

function newMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `aria-${Date.now()}`;
}

function budgetLabel(resource: string, amount: number) {
  if (resource === "usd_micros") return `$${(amount / 1_000_000).toFixed(2)} USD`;
  if (resource === "seconds") return `${Math.ceil(amount / 60)} min`;
  return amount.toLocaleString("es-CO");
}

export function AgentOptimizerPanel({
  canLaunch,
  role,
  sessions,
}: {
  canLaunch: boolean;
  role: string | undefined;
  sessions: AgentSession[];
}) {
  const queryClient = useQueryClient();
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [draftSession, setDraftSession] = useState<AgentSession | null>(null);
  const [composer, setComposer] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [auditCursor, setAuditCursor] = useState<string | undefined>();
  const objectiveQuery = useQuery({
    queryKey: ["agentActiveObjective"],
    queryFn: getActiveAgentObjective,
    enabled: canLaunch,
  });
  const optimizationSessions = sessions.filter((session) => session.mode === "optimization");
  const session =
    optimizationSessions.find((item) => item.session_id === selectedSessionId) ??
    optimizationSessions[0];
  const sessionId = session?.session_id ?? "";
  const iterationsQuery = useQuery({
    queryKey: ["agentIterations", sessionId],
    queryFn: () => listAgentIterations(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 3_000,
  });
  const experimentsQuery = useQuery({
    queryKey: ["agentExperiments", sessionId],
    queryFn: () => listAgentExperiments(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const auditQuery = useQuery({
    queryKey: ["agentAudit", sessionId, auditCursor],
    queryFn: () => listAgentAudit(sessionId, 50, auditCursor),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const hypothesesQuery = useQuery({
    queryKey: ["agentHypotheses", sessionId],
    queryFn: () => listAgentHypotheses(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const packagesQuery = useQuery({
    queryKey: ["agentPackages", sessionId],
    queryFn: () => listAgentPackages(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const messagesQuery = useQuery({
    queryKey: ["agentMessages", sessionId],
    queryFn: () => listAgentMessages(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 3_000,
  });
  const budgetQuery = useQuery({
    queryKey: ["agentBudget", sessionId],
    queryFn: () => getAgentSessionBudget(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const scope = (session?.scope as { areas?: string[] } | undefined)?.areas ?? [];
  const claimsQuery = useQuery({
    queryKey: ["agentClaims", scope],
    queryFn: () => Promise.all(scope.map((area) => listAgentClaims(`scope#${area}`))),
    enabled: scope.length > 0,
    refetchInterval: 10_000,
  });
  const conflictingAreas = useMemo(() => {
    const claims = claimsQuery.data?.flat() ?? [];
    return claims.filter((claim) => claim.session_id !== sessionId);
  }, [claimsQuery.data, sessionId]);

  const createMutation = useMutation({
    mutationFn: () => createOptimizerSession(areas),
    onSuccess: (created) => {
      setDraftSession(created);
      setNotice("");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo crear la sesión."),
  });
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!draftSession) throw new Error("No hay sesión en revisión.");
      if (notes.trim()) {
        await sendAgentMessage(draftSession.session_id, newMessageId(), notes.trim());
      }
      return startOptimizerSession(draftSession.session_id);
    },
    onSuccess: async (started) => {
      setDraftSession(null);
      setNotes("");
      setSelectedSessionId(started.session_id);
      queryClient.setQueryData<AgentSession[]>(["agentSessions"], (current = []) => [
        started,
        ...current.filter((item) => item.session_id !== started.session_id),
      ]);
      await queryClient.invalidateQueries({ queryKey: ["agentSessions"] });
      setNotice("");
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo iniciar el optimizador."),
  });
  const controlMutation = useMutation({
    mutationFn: (action: "pause" | "resume" | "cancel") =>
      controlOptimizerSession(sessionId, action),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["agentSessions"] }),
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo cambiar el estado."),
  });
  const messageMutation = useMutation({
    mutationFn: () => sendAgentMessage(sessionId, newMessageId(), composer.trim()),
    onSuccess: async () => {
      setComposer("");
      await queryClient.invalidateQueries({ queryKey: ["agentMessages", sessionId] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo enviar el mensaje."),
  });

  const formatState = (status: string) =>
    ({
      ACTIVE: "Ejecutando",
      RUNNING: "Ejecutando",
      PAUSED: "En pausa",
      WAITING_USER: "Esperando respuesta",
      WAITING_APPROVAL: "Requiere aprobación",
      COMPLETED: "Completado",
      FAILED: "Fallido",
      CANCELLED: "Cancelado",
      STOPPED: "Detenido",
      DRAFT: "Borrador",
    })[status] ?? status;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <AgentReleasePanel role={role} />
      {canLaunch && (
        <section className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">Lanzar optimizador</h2>
          {!draftSession ? (
            <>
              <fieldset className="mt-3 space-y-2">
                <legend className="text-xs text-text-secondary">Alcance de la investigación</legend>
                {AREAS.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-xs text-text-primary">
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
              <label className="mt-3 block text-xs text-text-secondary" htmlFor="optimizer-notes">
                Notas iniciales
              </label>
              <textarea
                id="optimizer-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={8_000}
                className="mt-1 min-h-16 w-full rounded border border-border bg-background p-2 text-xs"
                placeholder="¿Qué quieres investigar?"
              />
              <p className="mt-2 text-[11px] text-text-secondary">
                El optimizador puede proponer experimentos y borradores. No activa cambios ni
                publica modelos.
              </p>
              <button
                type="button"
                disabled={!areas.length || createMutation.isPending || objectiveQuery.isLoading}
                onClick={() => createMutation.mutate()}
                className="mt-3 inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Rocket className="h-3.5 w-3.5" />
                {createMutation.isPending ? "Preparando…" : "Revisar objetivo y presupuesto"}
              </button>
              {objectiveQuery.data && (
                <div className="mt-3 rounded border border-border bg-card p-2 text-[11px] text-text-secondary">
                  Objetivo activo v{objectiveQuery.data.version}:{" "}
                  {objectiveQuery.data.success_label}; piso de precisión{" "}
                  {(objectiveQuery.data.precision_floor * 100).toFixed(1)}%.
                </div>
              )}
            </>
          ) : (
            <div className="mt-3 rounded border border-primary/30 bg-card p-3 text-xs">
              <p className="font-semibold">
                Revisión previa · objetivo v{objectiveQuery.data?.version ?? "—"}
              </p>
              <p className="mt-1 text-text-secondary">
                Presupuesto asignado por el servidor. Los límites son de solo lectura.
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(draftSession.budget_limits).map(([resource, amount]) => (
                  <div key={resource}>
                    <dt className="text-text-secondary">{resource}</dt>
                    <dd className="font-medium">{budgetLabel(resource, amount)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={startMutation.isPending}
                  onClick={() => startMutation.mutate()}
                  className="rounded bg-primary px-3 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {startMutation.isPending ? "Iniciando…" : "Confirmar e iniciar"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraftSession(null)}
                  className="rounded border border-border px-3 py-2"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      <section className="border-b border-border px-4 py-3">
        <div
          role="tablist"
          aria-label="Historial de sesiones del optimizador"
          className="flex gap-2 overflow-x-auto"
        >
          {optimizationSessions.map((item) => (
            <button
              key={item.session_id}
              type="button"
              role="tab"
              aria-label={`Optimizador ${item.session_id} · ${formatState(item.status)}`}
              aria-selected={item.session_id === sessionId}
              onClick={() => setSelectedSessionId(item.session_id)}
              className={`shrink-0 rounded border px-2 py-2 text-xs ${item.session_id === sessionId ? "border-primary bg-primary/5 text-primary" : "border-border text-text-secondary"}`}
            >
              Optimizador · {new Date(item.created_at).toLocaleDateString("es-CO")} ·{" "}
              {formatState(item.status)}
            </button>
          ))}
        </div>
      </section>
      {!session ? (
        <p className="p-5 text-center text-sm text-text-secondary">
          Aún no hay sesiones del optimizador.
        </p>
      ) : (
        <>
          <section className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{formatState(session.status)}</p>
              <div className="flex gap-1">
                {(session.status === "PAUSED" || session.status === "WAITING_USER") && (
                  <button
                    type="button"
                    aria-label="Reanudar optimizador"
                    onClick={() => controlMutation.mutate("resume")}
                    className="rounded border border-border p-2"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                )}
                {ACTIVE.has(session.status) && (
                  <button
                    type="button"
                    aria-label="Pausar optimizador"
                    onClick={() => controlMutation.mutate("pause")}
                    className="rounded border border-border p-2"
                  >
                    <Pause className="h-3.5 w-3.5" />
                  </button>
                )}
                {!TERMINAL.has(session.status) && session.status !== "DRAFT" && (
                  <button
                    type="button"
                    aria-label="Cancelar optimizador"
                    onClick={() => controlMutation.mutate("cancel")}
                    className="rounded border border-border p-2"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {conflictingAreas.length > 0 && (
              <div
                role="status"
                className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-800"
              >
                <p>Hay otra sesión activa investigando un área de este alcance:</p>
                <ul className="mt-1 space-y-1">
                  {conflictingAreas.map((claim) => (
                    <li key={`${claim.entity_key}:${claim.session_id}`}>
                      {claim.session_id} · activa desde{" "}
                      {new Date(claim.claimed_at).toLocaleString("es-CO")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
              {Object.entries(session.budget_limits).map(([resource, limit]) => {
                const spent = budgetQuery.data?.spent[resource] ?? 0;
                return (
                  <div key={resource} className="rounded border border-border p-2">
                    <p className="text-text-secondary">Gastado</p>
                    <p>{budgetLabel(resource, spent)}</p>
                    <p className="mt-1 text-text-secondary">Restante</p>
                    <p>{budgetLabel(resource, Math.max(0, limit - spent))}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-text-secondary">
              Historial · creada {new Date(session.created_at).toLocaleString("es-CO")} · última
              actualización {new Date(session.updated_at).toLocaleString("es-CO")}
            </p>
            <p className="mt-1 text-[11px] text-text-secondary" aria-label="Estado del lease">
              Lease: {session.lease?.status ?? "NONE"}
              {session.lease?.expires_at &&
                ` · vence ${new Date(session.lease.expires_at).toLocaleString("es-CO")}`}
              {session.lease?.heartbeat_at &&
                ` · heartbeat ${new Date(session.lease.heartbeat_at).toLocaleString("es-CO")}`}
            </p>
            {iterationsQuery.data?.at(-1)?.reason && (
              <p className="mt-2 text-xs text-text-secondary">
                Motivo actual: {iterationsQuery.data.at(-1)?.reason}
              </p>
            )}
            <div className="mt-2 text-[11px] text-text-secondary">
              {(packagesQuery.data ?? []).length === 0 ? (
                <p>Experimentos acumulados: 0</p>
              ) : (
                <ul aria-label="Estado de verificación de experimentos">
                  {packagesQuery.data?.map((item) => (
                    <li key={item.package_id}>
                      Experimento {item.iteration_number}: {item.status}
                      {item.sealed_at &&
                        ` · registrado ${new Date(item.sealed_at).toLocaleDateString("es-CO")}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          <section
            className="border-b border-border p-4"
            aria-label="Comparación baseline y experimentos"
          >
            <h3 className="text-xs font-semibold">Baseline y experimentos</h3>
            {(experimentsQuery.data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-text-secondary">
                Aún no hay evaluaciones de experimentos.
              </p>
            ) : (
              <ul className="mt-2 space-y-3 text-xs">
                {experimentsQuery.data?.map((experiment) => (
                  <li key={experiment.experiment_id} className="rounded border border-border p-2">
                    <p className="font-semibold">
                      Experimento {experiment.iteration_number} · {experiment.status}
                    </p>
                    <p className="mt-1 text-text-secondary">
                      Baseline:{" "}
                      {experiment.baseline_components
                        .map((pin) => `${pin.component} ${pin.version}`)
                        .join(", ") || "—"}
                    </p>
                    <p className="text-text-secondary">
                      Candidato:{" "}
                      {experiment.components
                        .map((pin) => `${pin.component} ${pin.version}`)
                        .join(", ") || "—"}
                    </p>
                    <p className="text-text-secondary">
                      Evaluación: {String(experiment.global_evaluation.status ?? "pendiente")}
                    </p>
                    <pre className="mt-1 overflow-auto whitespace-pre-wrap text-[10px]">
                      {JSON.stringify(
                        {
                          sample: experiment.global_evaluation.sample,
                          metrics: experiment.global_evaluation.metrics,
                          delta: experiment.global_evaluation.delta,
                          uncertainty: experiment.global_evaluation.uncertainty,
                          segments: experiment.global_evaluation.segments,
                          constraints: experiment.global_evaluation.constraints,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="p-4" aria-label="Auditoría de sesión">
            <h3 className="text-xs font-semibold">Auditoría</h3>
            {(auditQuery.data?.items ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-text-secondary">
                No hay eventos registrados para esta página.
              </p>
            ) : (
              <ol className="mt-2 space-y-1 text-xs">
                {auditQuery.data?.items.map((event) => (
                  <li key={event.event_id} className="rounded border border-border px-2 py-1">
                    {new Date(event.occurred_at).toLocaleString("es-CO")} · {event.category} ·{" "}
                    {event.status}
                    {event.reason_code && ` · ${event.reason_code}`}
                    {event.duration_ms != null && ` · ${event.duration_ms} ms`}
                    {event.cost_micros != null &&
                      ` · $${(event.cost_micros / 1_000_000).toFixed(4)}`}
                    {event.specialist && ` · ${event.specialist}`}
                    {event.tool && ` · ${event.tool}`}
                  </li>
                ))}
              </ol>
            )}
            {auditQuery.data?.next_cursor && (
              <button
                type="button"
                className="mt-2 rounded border border-border px-2 py-1 text-xs"
                onClick={() => setAuditCursor(auditQuery.data?.next_cursor ?? undefined)}
              >
                Cargar eventos anteriores
              </button>
            )}
          </section>
          <section className="border-b border-border p-4">
            <h3 className="text-xs font-semibold">Hipótesis y progreso</h3>
            {(iterationsQuery.data?.at(-1)?.specialists.length ?? 0) > 0 && (
              <p className="mt-2 text-xs text-text-secondary">
                Especialista actual: {iterationsQuery.data?.at(-1)?.specialists.join(", ")}
              </p>
            )}
            {(hypothesesQuery.data ?? []).slice(0, 3).map((hypothesis) => (
              <p key={hypothesis.hypothesis_id} className="mt-2 text-xs">
                {hypothesis.statement}{" "}
                <span className="text-text-secondary">· {hypothesis.status}</span>
              </p>
            ))}
            <ol className="mt-3 space-y-2">
              {(iterationsQuery.data ?? []).map((iteration) => (
                <li key={iteration.number} className="rounded border border-border p-2 text-[11px]">
                  <span className="font-semibold">
                    Iteración {iteration.number} · {iteration.status}
                  </span>
                  {iteration.hypothesis && <p className="mt-1">{iteration.hypothesis}</p>}
                  {iteration.specialists.length > 0 && (
                    <p className="text-text-secondary">
                      Especialista: {iteration.specialists.join(", ")}
                    </p>
                  )}
                  {iteration.reason && <p className="text-text-secondary">{iteration.reason}</p>}
                </li>
              ))}
            </ol>
          </section>
          <section className="min-h-40 flex-1 p-4" aria-label="Conversación del optimizador">
            <h3 className="text-xs font-semibold">Conversación</h3>
            <div className="mt-2 space-y-2">
              {(messagesQuery.data ?? []).slice(-12).map((message) => (
                <article
                  key={message.message_id}
                  className="rounded border border-border p-2 text-xs"
                >
                  <p className="mb-1 font-semibold">
                    {message.role === "user" ? "Tú" : "ARIA · Optimizador"}
                  </p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </article>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                messageMutation.mutate();
              }}
            >
              <input
                aria-label="Mensaje para el optimizador"
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-2 text-xs"
                placeholder="Añade contexto…"
              />
              <button
                type="submit"
                disabled={!composer.trim() || messageMutation.isPending}
                className="rounded bg-primary px-3 text-xs font-semibold text-white disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </section>
        </>
      )}
      {notice && (
        <p role="alert" className="m-3 rounded bg-danger/10 p-2 text-xs text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
