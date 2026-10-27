import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GitMerge, Trophy } from "lucide-react";
import {
  listExperimentEvents,
  type AgentEvent,
  type AgentFailureInfo,
  type AgentInsight,
  type OptimizationRun,
  type RunCandidate,
} from "@/lib/api/agent.functions";
import { ExperimentsPanel } from "./ExperimentsPanel";
import { AREA_LABEL, EVENT_KIND_LABEL, OUTCOME_TONE, TONE_CLASS, type Tone } from "./labels";

const STRATEGY: Record<string, { label: string; tone: Tone }> = {
  explore: { label: "Explorar", tone: "info" },
  combine: { label: "Combinar ganadores", tone: "warn" },
  promote: { label: "Promover el ganador", tone: "ok" },
};

const VERDICT: Record<string, { label: string; tone: Tone }> = {
  VALIDATED: { label: "Validada", tone: "ok" },
  REFUTED: { label: "Refutada", tone: "bad" },
  NONCONCLUSIVE: { label: "Inconclusa", tone: "warn" },
  ACTIVE: { label: "En prueba o en cola", tone: "info" },
};

const DECISION: Record<string, string> = {
  keep: "Conservar",
  discard: "Descartar",
  retry: "Repetir",
};

const COMPONENT_LABEL: Record<string, string> = {
  model: "Modelo",
  configuration: "Configuración",
  library: "Biblioteca",
  vector_store: "Vector store",
};

// Precision is null when nothing was predicted positive: show it as undefined.
const pct = (value: number | null | undefined) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;

/** The whole optimization run as one structure: base, winners, candidates. */
export function RunTree({
  run,
  runningCandidateIds,
  insights,
  catalog,
}: {
  run: OptimizationRun;
  runningCandidateIds: Set<string>;
  insights: AgentInsight[];
  catalog: AgentFailureInfo[];
}) {
  const strategy = STRATEGY[run.strategy.action ?? "explore"] ?? STRATEGY.explore;
  const byId = new Map(run.candidates.map((item) => [item.hypothesis.hypothesis_id, item]));
  const settings = run.optimizer_settings;
  return (
    <div className="space-y-4" data-testid="run-tree">
      <section
        aria-label="Estrategia de la corrida"
        className={`rounded-xl border p-4 ${TONE_CLASS[strategy.tone]}`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Estrategia</p>
        <h3 className="text-[15px] font-bold text-text-primary">{strategy.label}</h3>
        {run.strategy.rationale && (
          <p className="mt-0.5 text-[13px] text-text-secondary">{run.strategy.rationale}</p>
        )}
      </section>

      <section
        aria-label="Configuración base del optimizador"
        className="grid gap-2 rounded-xl border border-border bg-card p-4 text-[12px] sm:grid-cols-4"
      >
        <div>
          <p className="text-text-secondary">Objetivo</p>
          <p className="font-medium text-text-primary">
            {run.objective_id ? `${run.objective_id} v${run.objective_version}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Experimentos en paralelo</p>
          <p className="font-medium text-text-primary tabular-nums">
            hasta {settings.max_parallel_experiments ?? "—"} por sesión
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Alcance</p>
          <p className="font-medium text-text-primary">
            {run.scope_areas.map((area) => AREA_LABEL[area] ?? area).join(", ") || "—"}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Insights</p>
          <p className="font-medium text-text-primary tabular-nums">
            {run.insight_ids.length} generales · {run.memory_insight_ids.length} de memoria
          </p>
        </div>
      </section>

      <section aria-label="Ganadores" className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <Trophy className="h-4 w-4 text-warning" aria-hidden="true" /> Ganadores
        </h3>
        {run.winners.length === 0 ? (
          <p className="mt-2 text-[12px] text-text-secondary" data-testid="winners-empty">
            Aún ningún candidato mejora el objetivo frente a la línea base.
          </p>
        ) : (
          <table className="mt-2 w-full text-[12px]" data-testid="winners-table">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="py-1 pr-3 font-medium">#</th>
                <th className="py-1 pr-3 font-medium">Candidato</th>
                <th className="py-1 pr-3 font-medium">Cambia</th>
                <th className="py-1 pr-3 font-medium">Recall</th>
                <th className="py-1 font-medium">Mejora</th>
              </tr>
            </thead>
            <tbody>
              {run.winners.map((winner, index) => (
                <tr key={winner.candidate_id} className="border-t border-border">
                  <td className="py-1 pr-3 tabular-nums">{index + 1}</td>
                  <td className="py-1 pr-3 text-text-primary">
                    {byId.get(winner.candidate_id)?.hypothesis.statement ?? winner.candidate_id}
                  </td>
                  <td className="py-1 pr-3">
                    {winner.component
                      .split("+")
                      .map((item) => COMPONENT_LABEL[item] ?? item)
                      .join(" + ")}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{pct(winner.recall)}</td>
                  <td className="py-1 tabular-nums text-success">
                    +{(winner.recall_delta * 100).toFixed(1)} pts
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {run.winning_components.length > 0 && (
          <p className="mt-2 text-[11px] text-text-secondary" data-testid="winning-configuration">
            Configuración ganadora:{" "}
            {run.winning_components
              .filter(
                (pin) =>
                  !run.baseline_components.some(
                    (base) => base.content_sha256 === pin.content_sha256,
                  ),
              )
              .map((pin) => `${COMPONENT_LABEL[pin.component] ?? pin.component} v${pin.version}`)
              .join(", ") || "igual a la línea base"}
          </p>
        )}
      </section>

      <section aria-label="Candidatos" className="space-y-3">
        <h3 className="text-[13px] font-semibold text-text-primary">
          Candidatos ({run.candidates.length})
          {runningCandidateIds.size > 0 && (
            <span
              className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] ${TONE_CLASS.info}`}
              data-testid="parallel-running"
            >
              {runningCandidateIds.size} en paralelo
            </span>
          )}
        </h3>
        {run.candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary">
            La corrida aún no tiene candidatos.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="candidates-list">
            {run.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.hypothesis.hypothesis_id}
                runId={run.run_id}
                candidate={candidate}
                running={runningCandidateIds.has(candidate.hypothesis.hypothesis_id)}
                dependencies={candidate.hypothesis.depends_on.map(
                  (id) => byId.get(id)?.hypothesis.statement ?? id,
                )}
                insights={insights.filter(
                  (item) =>
                    candidate.hypothesis.insight_ids.includes(item.insight_id) ||
                    item.insight_id === candidate.hypothesis.source_insight_id,
                )}
                catalog={catalog}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CandidateCard({
  runId,
  candidate,
  running,
  dependencies,
  insights,
  catalog,
}: {
  runId: string;
  candidate: RunCandidate;
  running: boolean;
  dependencies: string[];
  insights: AgentInsight[];
  catalog: AgentFailureInfo[];
}) {
  const { hypothesis, experiments } = candidate;
  const conclusion = hypothesis.conclusion;
  const status = VERDICT[conclusion.verdict ?? hypothesis.status] ?? VERDICT.ACTIVE;
  const combination = hypothesis.scope.area === "combination";
  return (
    <li
      className="rounded-xl border border-border bg-card p-4"
      data-testid="candidate-card"
      data-status={hypothesis.status}
      data-area={hypothesis.scope.area ?? ""}
    >
      <div className="flex flex-wrap items-center gap-2">
        {combination && <GitMerge className="h-4 w-4 text-primary" aria-hidden="true" />}
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[status.tone]}`}
        >
          {running ? "En ejecución" : status.label}
        </span>
        <span className="text-[11px] text-text-secondary">
          {combination
            ? "Combinación"
            : (AREA_LABEL[hypothesis.scope.area] ?? hypothesis.scope.area ?? "Pipeline")}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-text-primary">{hypothesis.statement}</p>
      {dependencies.length > 0 && (
        <p className="mt-1 text-[11px] text-text-secondary">Combina: {dependencies.join(" · ")}</p>
      )}
      {insights.length > 0 && (
        <ul className="mt-1.5 space-y-0.5" aria-label="Insights del candidato">
          {insights.map((insight) => (
            <li key={insight.insight_id} className="text-[11px] italic text-text-secondary">
              «{insight.statement}»
            </li>
          ))}
        </ul>
      )}
      {conclusion.verdict && (
        <section
          aria-label="Conclusión"
          className={`mt-3 rounded-lg border p-3 text-[12px] ${TONE_CLASS[status.tone]}`}
        >
          <p className="font-semibold text-text-primary">
            Conclusión · {DECISION[conclusion.decision ?? ""] ?? "—"}
          </p>
          {conclusion.summary && <p className="text-text-secondary">{conclusion.summary}</p>}
          {conclusion.recommendation && (
            <p className="mt-0.5 font-medium text-text-primary">{conclusion.recommendation}</p>
          )}
          {conclusion.evidence && Object.keys(conclusion.evidence).length > 0 && (
            <p className="mt-1 text-[11px] text-text-secondary tabular-nums">
              Recall {pct(conclusion.evidence.recall)} · precisión{" "}
              {pct(conclusion.evidence.precision)}
              {conclusion.evidence.sample_count !== undefined &&
                ` · ${conclusion.evidence.sample_count} casos`}
            </p>
          )}
        </section>
      )}
      {experiments.length > 0 && (
        <div className="mt-3 space-y-2">
          <ExperimentsPanel experiments={experiments} catalog={catalog} />
          {experiments.map((experiment) => (
            <ExperimentEvents
              key={experiment.experiment_id}
              runId={runId}
              experimentId={experiment.experiment_id}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function ExperimentEvents({ runId, experimentId }: { runId: string; experimentId: string }) {
  const [open, setOpen] = useState(false);
  const events = useQuery({
    queryKey: ["experimentEvents", runId, experimentId],
    queryFn: () => listExperimentEvents(runId, experimentId),
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });
  const items: AgentEvent[] = events.data?.items ?? [];
  return (
    <div className="text-[11px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 font-medium text-primary"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        Eventos del experimento
      </button>
      {open && (
        <ol
          className="mt-1 space-y-1 border-l border-border pl-3"
          aria-label="Eventos del experimento"
        >
          {events.isLoading ? (
            <li className="text-text-secondary">Cargando…</li>
          ) : items.length === 0 ? (
            <li className="text-text-secondary">Sin eventos propios todavía.</li>
          ) : (
            items.map((event) => (
              <li key={event.seq}>
                <span
                  className={`mr-1 rounded-full border px-1.5 py-0.5 text-[9px] ${TONE_CLASS[OUTCOME_TONE[event.outcome]]}`}
                >
                  {EVENT_KIND_LABEL[event.kind] ?? event.kind}
                </span>
                {event.summary}
              </li>
            ))
          )}
        </ol>
      )}
    </div>
  );
}
