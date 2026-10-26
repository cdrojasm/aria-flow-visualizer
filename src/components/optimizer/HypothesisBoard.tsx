import { useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import type { AgentEvent, AgentHypothesis, AgentInsight } from "@/lib/api/agent.functions";
import { OUTCOME_TONE, TONE_CLASS, EVENT_KIND_LABEL, type Tone } from "./labels";

const COLUMNS: { status: string[]; title: string; tone: Tone }[] = [
  { status: ["ACTIVE"], title: "En prueba o en cola", tone: "info" },
  { status: ["VALIDATED"], title: "Validadas", tone: "ok" },
  { status: ["REFUTED"], title: "Refutadas", tone: "bad" },
  { status: ["NONCONCLUSIVE"], title: "Inconclusas", tone: "warn" },
];

/** Hypotheses by outcome, each with the chain that led to it and what it produced. */
export function HypothesisBoard({
  hypotheses,
  events,
  insights,
}: {
  hypotheses: AgentHypothesis[];
  events: AgentEvent[];
  insights: AgentInsight[];
}) {
  if (hypotheses.length === 0) {
    return (
      <p
        data-testid="hypotheses-empty"
        className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary"
      >
        El agente aún no formula hipótesis. Cuando lo haga verás aquí qué probó y con qué resultado.
      </p>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4" data-testid="hypothesis-board">
      {COLUMNS.map((column) => {
        const items = hypotheses.filter((item) => column.status.includes(item.status));
        return (
          <section
            key={column.title}
            aria-label={column.title}
            className="rounded-xl border border-border bg-card p-3"
          >
            <h3 className="mb-2 flex items-center justify-between text-[12px] font-semibold text-text-primary">
              {column.title}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] tabular-nums ${TONE_CLASS[column.tone]}`}
              >
                {items.length}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="text-[11px] text-text-secondary">Ninguna.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <HypothesisCard
                    key={item.hypothesis_id}
                    hypothesis={item}
                    events={events}
                    insight={insights.find((entry) => entry.insight_id === item.source_insight_id)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function HypothesisCard({
  hypothesis,
  events,
  insight,
}: {
  hypothesis: AgentHypothesis;
  events: AgentEvent[];
  insight: AgentInsight | undefined;
}) {
  const [open, setOpen] = useState(false);
  const trace = events
    .filter((event) => event.refs.hypothesis_id === hypothesis.hypothesis_id)
    .sort((left, right) => left.seq - right.seq);
  const fromMemory = Boolean(hypothesis.scope.memory);
  return (
    <li className="rounded-lg border border-border bg-surface p-2.5 text-[12px]">
      <p className="text-text-primary">{hypothesis.statement}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
        {insight && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
            <Brain className="h-3 w-3" aria-hidden="true" /> Nace de tu contexto
          </span>
        )}
        {fromMemory && (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-success">
            Respaldada por sesiones previas
          </span>
        )}
        {hypothesis.scope.area && (
          <span className="rounded-full border border-border px-2 py-0.5 text-text-secondary">
            Área {hypothesis.scope.area}
          </span>
        )}
      </div>
      {insight && (
        <p className="mt-1.5 text-[11px] italic text-text-secondary">«{insight.statement}»</p>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        Trazabilidad ({trace.length})
      </button>
      {open && (
        <ol className="mt-1.5 space-y-1 border-l border-border pl-3" aria-label="Trazabilidad">
          {insight && (
            <li className="text-[11px] text-text-secondary">Contexto → hipótesis creada</li>
          )}
          {trace.length === 0 ? (
            <li className="text-[11px] text-text-secondary">Aún sin eventos.</li>
          ) : (
            trace.map((event) => (
              <li key={event.seq} className="text-[11px]">
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
    </li>
  );
}
