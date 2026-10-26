import { ArrowRight } from "lucide-react";
import type { AlertStep } from "@/lib/api/operations.functions";
import { STEP_LABELS } from "@/lib/alertSteps";

const PHASES = [
  { title: "Preparar", steps: ["pre_process", "deterministic"] },
  { title: "Analizar", steps: ["profiling", "detector", "classification"] },
  { title: "Revisar", steps: ["detector_adversarial", "adversarial"] },
  { title: "Resolver", steps: ["analyst", "executor", "post_process"] },
] as const;

const ACTION_LABELS: Record<string, string> = {
  block: "ARIA bloquea",
  pass: "ARIA deja pasar",
  bidi: "Bidi",
  voicebot: "Voicebot",
  scale_to_analyst: "Analista",
  none: "Sin acción",
};

function Arrow() {
  return <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />;
}

export function AlertFlowDiagrams({
  steps,
  status,
  decision,
  executedAction,
  analystResolved,
}: {
  steps: AlertStep[];
  status: string;
  decision?: string;
  executedAction?: string;
  analystResolved: boolean;
}) {
  const completed = new Set(steps.map((step) => step.step_name));
  const resolutionOptions = [
    { action: "block", label: "Bloqueo" },
    { action: "pass", label: "Dejar pasar" },
    { action: "bidi", label: "Bidi" },
    { action: "voicebot", label: "Voicebot" },
    { action: "scale_to_analyst", label: "Analista" },
  ];
  const selected = resolutionOptions.some((option) => option.action === executedAction)
    ? executedAction
    : analystResolved || status === "ESCALATED"
      ? "scale_to_analyst"
      : resolutionOptions.some((option) => option.action === decision)
        ? decision
        : undefined;
  const selectedLabel = selected ? (ACTION_LABELS[selected] ?? selected) : undefined;

  return (
    <details className="max-w-[860px] rounded-xl border border-border bg-card group">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-text-primary marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
        <span className="flex items-center justify-between gap-3">
          <span>Ver diagramas del flujo y la resolución</span>
          <span className="text-[11px] font-normal text-text-secondary group-open:hidden">
            Resumen visual
          </span>
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4 space-y-5">
        <section aria-labelledby="alert-flow-title">
          <h3 id="alert-flow-title" className="mb-2 text-[11px] font-semibold text-text-secondary">
            Revisión de la alerta
          </h3>
          <ol
            aria-label="Etapas agrupadas de la revisión de alerta"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {PHASES.map((phase, index) => {
              const phaseSteps = phase.steps.filter((name) => completed.has(name));
              const humanResolution = phase.title === "Resolver" && analystResolved;
              const isCurrent = phaseSteps.length > 0 || humanResolution;
              const phaseDescription = phaseSteps.length
                ? phaseSteps.map((name) => STEP_LABELS[name] ?? name).join(" · ")
                : humanResolution
                  ? "Resuelto por analista"
                  : "Aún sin registrar";
              return (
                <li key={phase.title} className="relative min-w-0">
                  {index > 0 && (
                    <span aria-hidden="true" className="absolute -left-2 top-3 hidden sm:block">
                      <Arrow />
                    </span>
                  )}
                  <div
                    className={`h-full rounded-lg border px-3 py-2 ${isCurrent ? "border-primary/30 bg-primary/5" : "border-border bg-surface"}`}
                  >
                    <div className="flex items-center justify-between gap-1.5 text-[12px] font-semibold text-text-primary">
                      {phase.title}
                      {isCurrent && (
                        <span className="text-[9px] font-normal text-primary">
                          {phaseSteps.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">
                      {phaseDescription}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="resolution-flow-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3
              id="resolution-flow-title"
              className="text-[11px] font-semibold text-text-secondary"
            >
              Ruta de resolución
            </h3>
            {selectedLabel && (
              <p className="text-[10px] text-text-secondary">
                Registrada: <span className="font-semibold text-text-primary">{selectedLabel}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="Opciones de resolución">
            <span className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-text-primary">
              Agente
            </span>
            <Arrow />
            <div className="flex flex-wrap gap-1.5">
              {resolutionOptions.map((option) => {
                const active = selected === option.action;
                return (
                  <span
                    key={option.action}
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] ${
                      active
                        ? "border-primary bg-primary text-white font-semibold"
                        : "border-border bg-card text-text-secondary"
                    }`}
                  >
                    {option.label}
                  </span>
                );
              })}
            </div>
            <Arrow />
            <span className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-text-primary">
              Registro y métricas
            </span>
          </div>
        </section>
      </div>
    </details>
  );
}
