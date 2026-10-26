import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { SectionTabs } from "@/components/ui/section-tabs";
import { AgentReleasePanel } from "@/components/agent/AgentReleasePanel";
import {
  controlOptimizerSession,
  getAgentSessionBudget,
  getAgentSessionOverview,
  listAgentClaims,
  listAgentEvents,
  listAgentExperiments,
  listAgentFailureCatalog,
  listAgentFindings,
  listAgentHypotheses,
  listAgentInsights,
  listAgentIterations,
  listAgentSessions,
  type AgentEvent,
  type AgentSession,
  type AgentSessionOverview,
} from "@/lib/api/agent.functions";
import { BlockApprovalDrawer } from "./BlockApprovalDrawer";
import { ExperimentsPanel } from "./ExperimentsPanel";
import { HypothesisBoard } from "./HypothesisBoard";
import { LearningsPanel } from "./LearningsPanel";
import { OptimizerCycleDiagram } from "./OptimizerCycleDiagram";
import { OptimizerLaunchDrawer } from "./OptimizerLaunchDrawer";
import { SessionConversation } from "./SessionConversation";
import { SessionTimeline } from "./SessionTimeline";
import { SessionVerdictCard } from "./SessionVerdictCard";
import {
  BUDGET_RESOURCE_LABEL,
  ITERATION_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  SPECIALIST_LABEL,
  TONE_CLASS,
  VERDICT_META,
  budgetLabel,
} from "./labels";

type CenterTab =
  "summary" | "timeline" | "hypotheses" | "experiments" | "learnings" | "conversation" | "releases";

const TABS: { key: CenterTab; label: string }[] = [
  { key: "summary", label: "Resumen" },
  { key: "timeline", label: "Línea de tiempo" },
  { key: "hypotheses", label: "Hipótesis" },
  { key: "experiments", label: "Experimentos" },
  { key: "learnings", label: "Aprendizajes" },
  { key: "conversation", label: "Conversación" },
  { key: "releases", label: "Releases" },
];

const TAB_STORAGE_KEY = "aria.optimizer.tab";

function readTab(): CenterTab {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (TABS.some((tab) => tab.key === stored)) return stored as CenterTab;
  } catch {
    /* storage blocked: fall back to the summary */
  }
  return "summary";
}

async function loadAllEvents(sessionId: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  let after = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await listAgentEvents(sessionId, after, 200);
    events.push(...result.items);
    if (result.items.length < 200) break;
    after = result.last_seq;
  }
  return events;
}

const SESSION_DATE = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export function OptimizerCenter({ role }: { role: string | undefined }) {
  const queryClient = useQueryClient();
  const canLaunch = role === "channel_manager";
  const [tab, setTab] = useState<CenterTab>(readTab);
  const [selectedId, setSelectedId] = useState("");
  const [launchOpen, setLaunchOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      /* storage blocked: the tab is simply not remembered */
    }
  }, [tab]);

  const sessionsQuery = useQuery({
    queryKey: ["agentSessions"],
    queryFn: listAgentSessions,
    refetchInterval: 5_000,
  });
  const sessions = useMemo(
    () => (sessionsQuery.data ?? []).filter((item) => item.mode === "optimization"),
    [sessionsQuery.data],
  );
  const session = sessions.find((item) => item.session_id === selectedId) ?? sessions[0];
  const sessionId = session?.session_id ?? "";
  const enabled = Boolean(sessionId);

  const overviewQuery = useQuery({
    queryKey: ["agentOverview", sessionId],
    queryFn: () => getAgentSessionOverview(sessionId),
    enabled,
    refetchInterval: 3_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["agentEvents", sessionId],
    queryFn: () => loadAllEvents(sessionId),
    enabled,
    refetchInterval: 3_000,
  });
  const iterationsQuery = useQuery({
    queryKey: ["agentIterations", sessionId],
    queryFn: () => listAgentIterations(sessionId),
    enabled,
    refetchInterval: 5_000,
  });
  const hypothesesQuery = useQuery({
    queryKey: ["agentHypotheses", sessionId],
    queryFn: () => listAgentHypotheses(sessionId),
    enabled,
    refetchInterval: 5_000,
  });
  const insightsQuery = useQuery({
    queryKey: ["agentInsights", sessionId],
    queryFn: () => listAgentInsights(sessionId),
    enabled,
    refetchInterval: 10_000,
  });
  const experimentsQuery = useQuery({
    queryKey: ["agentExperiments", sessionId],
    queryFn: () => listAgentExperiments(sessionId),
    enabled,
    refetchInterval: 5_000,
  });
  const findingsQuery = useQuery({
    queryKey: ["agentFindings", sessionId],
    queryFn: () => listAgentFindings(sessionId),
    enabled,
    refetchInterval: 10_000,
  });
  const budgetQuery = useQuery({
    queryKey: ["agentBudget", sessionId],
    queryFn: () => getAgentSessionBudget(sessionId),
    enabled,
    refetchInterval: 5_000,
  });
  const catalogQuery = useQuery({
    queryKey: ["agentFailureCatalog"],
    queryFn: listAgentFailureCatalog,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const scope = session?.scope?.areas ?? [];
  const claimsQuery = useQuery({
    queryKey: ["agentClaims", scope],
    queryFn: () => Promise.all(scope.map((area) => listAgentClaims(`scope#${area}`))),
    enabled: scope.length > 0,
    refetchInterval: 10_000,
  });
  const conflicts = (claimsQuery.data?.flat() ?? []).filter(
    (claim) => claim.session_id !== sessionId,
  );

  const control = useMutation({
    mutationFn: (action: "pause" | "resume" | "cancel") =>
      controlOptimizerSession(sessionId, action),
    onSuccess: async () => {
      setNotice("");
      await queryClient.invalidateQueries({ queryKey: ["agentSessions"] });
      await queryClient.invalidateQueries({ queryKey: ["agentOverview", sessionId] });
    },
    onError: (error) =>
      setNotice(error instanceof Error ? error.message : "No se pudo cambiar el estado."),
  });

  const refreshSession = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["agentSessions"] }),
      queryClient.invalidateQueries({ queryKey: ["agentOverview", sessionId] }),
      queryClient.invalidateQueries({ queryKey: ["agentEvents", sessionId] }),
    ]);
  };
  const handleStarted = async (started: AgentSession) => {
    setSelectedId(started.session_id);
    setTab("summary");
    queryClient.setQueryData<AgentSession[]>(["agentSessions"], (current = []) => [
      started,
      ...current.filter((item) => item.session_id !== started.session_id),
    ]);
    await queryClient.invalidateQueries({ queryKey: ["agentSessions"] });
  };

  const events = eventsQuery.data ?? [];
  const latest = events.at(-1);
  const overview = overviewQuery.data;

  return (
    <div className="space-y-4" data-testid="optimizer-center">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-bold text-text-primary">Optimizador</h2>
          <p className="mt-0.5 max-w-3xl text-[12px] text-text-secondary">
            Sigue qué hace el agente, por qué se detuvo y qué necesita de ti. Todo lo que ves se
            alimenta de su línea de tiempo y de sus registros, no de inferencias.
          </p>
        </div>
        {canLaunch && (
          <button
            type="button"
            onClick={() => setLaunchOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white hover:bg-primary/90"
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" /> Lanzar optimizador
          </button>
        )}
      </div>

      {sessionsQuery.isLoading ? (
        <p className="rounded-lg border border-border p-4 text-[13px] text-text-secondary">
          Cargando sesiones del optimizador…
        </p>
      ) : sessionsQuery.isError ? (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-[13px] text-danger">
          No se pudieron cargar las sesiones del optimizador.
        </p>
      ) : !session ? (
        <p
          data-testid="optimizer-empty"
          className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-text-secondary"
        >
          Aún no hay sesiones del optimizador.
          {canLaunch ? " Lanza la primera para ver aquí su progreso." : ""}
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Historial de sesiones del optimizador"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {sessions.map((item) => {
              const state =
                VERDICT_META[
                  item.session_id === sessionId && overview ? overview.verdict.state : "draft"
                ];
              return (
                <button
                  key={item.session_id}
                  type="button"
                  role="tab"
                  aria-selected={item.session_id === sessionId}
                  aria-label={`Optimizador ${item.session_id} · ${SESSION_STATUS_LABEL[item.status] ?? item.status}`}
                  onClick={() => setSelectedId(item.session_id)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-left text-[12px] ${
                    item.session_id === sessionId
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-text-secondary"
                  }`}
                >
                  <span className="block font-medium">
                    {SESSION_DATE.format(new Date(item.created_at))}
                  </span>
                  <span className="block text-[11px]">
                    {item.session_id === sessionId && overview ? state.label : (item.status ?? "")}
                  </span>
                </button>
              );
            })}
          </div>

          {overview ? (
            <SessionVerdictCard
              session={session}
              overview={overview}
              canApprove={canLaunch}
              busy={control.isPending}
              onControl={(action) => control.mutate(action)}
              onApprove={() => setApproveOpen(true)}
            />
          ) : overviewQuery.isError ? (
            <p role="alert" className="rounded-lg bg-danger/10 p-3 text-[13px] text-danger">
              No se pudo leer el estado de la sesión. Los datos de abajo pueden estar
              desactualizados.
            </p>
          ) : (
            <p className="rounded-lg border border-border p-4 text-[13px] text-text-secondary">
              Leyendo el estado de la sesión…
            </p>
          )}

          <SectionTabs
            label="Secciones del optimizador"
            items={TABS}
            value={tab}
            onValueChange={setTab}
            variant="pills"
          />

          {tab === "summary" && (
            <div className="space-y-4">
              <OptimizerCycleDiagram latest={latest} overview={overview} />
              {conflicts.length > 0 && (
                <div
                  role="status"
                  className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-[12px] text-warning"
                >
                  <p>Hay otra sesión activa investigando un área de este alcance:</p>
                  <ul className="mt-1 space-y-1">
                    {conflicts.map((claim) => (
                      <li key={`${claim.entity_key}:${claim.session_id}`}>
                        {claim.session_id} · activa desde{" "}
                        {SESSION_DATE.format(new Date(claim.claimed_at))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <BudgetMeters session={session} spent={budgetQuery.data?.spent ?? {}} />
              <Counters overview={overview} />
              <RecentIterations iterations={iterationsQuery.data ?? []} />
            </div>
          )}
          {tab === "timeline" && (
            <SessionTimeline events={events} loading={eventsQuery.isLoading} />
          )}
          {tab === "hypotheses" && (
            <HypothesisBoard
              hypotheses={hypothesesQuery.data ?? []}
              events={events}
              insights={insightsQuery.data ?? []}
            />
          )}
          {tab === "experiments" && (
            <ExperimentsPanel
              experiments={experimentsQuery.data ?? []}
              catalog={catalogQuery.data ?? []}
            />
          )}
          {tab === "learnings" && <LearningsPanel findings={findingsQuery.data ?? []} />}
          {tab === "conversation" && <SessionConversation sessionId={sessionId} />}

          {overview && (
            <BlockApprovalDrawer
              open={approveOpen}
              onOpenChange={setApproveOpen}
              session={session}
              overview={overview}
              spent={budgetQuery.data?.spent ?? {}}
              onResolved={refreshSession}
            />
          )}
        </>
      )}
      {tab === "releases" && <AgentReleasePanel role={role} />}

      <OptimizerLaunchDrawer
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        onStarted={handleStarted}
      />
      {notice && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-[12px] text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}

function BudgetMeters({
  session,
  spent,
}: {
  session: AgentSession;
  spent: Record<string, number>;
}) {
  return (
    <section aria-label="Presupuesto" className="grid gap-2 sm:grid-cols-3">
      {Object.entries(session.budget_limits).map(([resource, limit]) => {
        const used = spent[resource] ?? 0;
        const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
        return (
          <div key={resource} className="rounded-xl border border-border bg-card p-3 text-[12px]">
            <p className="text-text-secondary">{BUDGET_RESOURCE_LABEL[resource] ?? resource}</p>
            <p className="mt-0.5 font-medium text-text-primary tabular-nums">
              {budgetLabel(resource, used)} de {budgetLabel(resource, limit)}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
              <div
                role="progressbar"
                aria-label={`Uso de ${BUDGET_RESOURCE_LABEL[resource] ?? resource}`}
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className={`h-full ${ratio >= 0.9 ? "bg-danger" : "bg-primary"}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Counters({ overview }: { overview: AgentSessionOverview | undefined }) {
  if (!overview) return null;
  const total = (values: Record<string, number>) =>
    Object.values(values).reduce((sum, value) => sum + value, 0);
  const items = [
    ["Iteraciones", total(overview.iterations), overview.iterations.FAILED],
    ["Hipótesis", total(overview.hypotheses), overview.hypotheses.REFUTED],
    ["Experimentos", total(overview.experiments), overview.experiments.FAILED],
    ["Eventos", overview.events_total, undefined],
  ] as const;
  return (
    <section aria-label="Contadores" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, count, bad]) => (
        <div key={label} className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] text-text-secondary">{label}</p>
          <p className="text-[20px] font-bold tabular-nums text-text-primary">{count}</p>
          {bad ? (
            <p
              className={`mt-0.5 inline-block rounded-full border px-2 text-[10px] ${TONE_CLASS.bad}`}
            >
              {bad} con problema
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function RecentIterations({
  iterations,
}: {
  iterations: Awaited<ReturnType<typeof listAgentIterations>>;
}) {
  if (iterations.length === 0) return null;
  return (
    <section aria-label="Iteraciones recientes" className="space-y-1.5">
      <h3 className="text-[12px] font-semibold text-text-primary">Últimas iteraciones</h3>
      <ol className="space-y-1.5">
        {[...iterations]
          .reverse()
          .slice(0, 5)
          .map((iteration) => (
            <li
              key={iteration.number}
              className="rounded-lg border border-border bg-card px-3 py-2 text-[12px]"
            >
              <span className="font-semibold text-text-primary">
                Iteración {iteration.number} ·{" "}
                {ITERATION_STATUS_LABEL[iteration.status] ?? iteration.status}
              </span>
              {iteration.hypothesis && (
                <span className="ml-2 text-text-secondary">{iteration.hypothesis}</span>
              )}
              {iteration.specialists.length > 0 && (
                <span className="ml-2 text-text-secondary">
                  · {iteration.specialists.map((name) => SPECIALIST_LABEL[name] ?? name).join(", ")}
                </span>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}
