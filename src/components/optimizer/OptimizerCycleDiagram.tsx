import type { AgentEvent, AgentSessionOverview } from "@/lib/api/agent.functions";

const STAGES = [
  { key: "context", title: "Contexto", detail: "Tu pista y la memoria" },
  { key: "hypothesis", title: "Hipótesis", detail: "Qué probar" },
  { key: "specialist", title: "Especialista", detail: "Propone el cambio" },
  { key: "verification", title: "Verificación", detail: "Reglas deterministas" },
  { key: "experiment", title: "Experimento", detail: "Contra la muestra madura" },
  { key: "decision", title: "Decisión", detail: "Seguir, parar o pedirte algo" },
  { key: "learning", title: "Aprendizaje", detail: "Memoria con evidencia" },
] as const;

const STAGE_BY_KIND: Record<string, (typeof STAGES)[number]["key"]> = {
  iteration: "hypothesis",
  hypothesis: "hypothesis",
  specialist: "specialist",
  verification: "verification",
  experiment: "experiment",
  decision: "decision",
  blocked: "decision",
};

/** Live while the session has events: the stage of the latest event is highlighted. */
export function OptimizerCycleDiagram({
  latest,
  overview,
}: {
  latest: AgentEvent | undefined;
  overview: AgentSessionOverview | undefined;
}) {
  const current = latest
    ? latest.summary.startsWith("Aprendizaje")
      ? "learning"
      : (STAGE_BY_KIND[latest.kind] ?? null)
    : null;
  const counts: Record<string, number | undefined> = {
    hypothesis: sum(overview?.hypotheses),
    experiment: sum(overview?.experiments),
    decision: sum(overview?.iterations),
  };
  return (
    <section aria-label="Ciclo del optimizador" data-testid="optimizer-cycle">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((stage) => {
          const active = stage.key === current;
          return (
            <li
              key={stage.key}
              aria-current={active ? "step" : undefined}
              data-stage={stage.key}
              className={`rounded-lg border px-3 py-2 text-center text-[11px] font-medium ${
                active
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-border bg-surface text-text-primary"
              }`}
            >
              <div>{stage.title}</div>
              <div className="mt-0.5 text-[10px] font-normal text-text-secondary">
                {stage.detail}
              </div>
              {counts[stage.key] !== undefined && (
                <div className="mt-1 text-[13px] font-semibold tabular-nums text-primary">
                  {counts[stage.key]}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
        Cada vuelta formula una hipótesis, la prueba con un especialista, la verifica, la evalúa
        contra la muestra madura y decide. No hay aprobación entre experimentos: solo se detiene a
        pedirte algo cuando le falta contexto o se agota un límite.
      </p>
    </section>
  );
}

function sum(values: Record<string, number> | undefined) {
  if (!values) return undefined;
  return Object.values(values).reduce((total, value) => total + value, 0);
}
