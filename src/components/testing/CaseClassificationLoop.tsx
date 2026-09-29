import type { WorkflowStepResponse } from "@/lib/api/testing.functions";

import { asObject, sortByStart, stepDurationSeconds } from "./caseExecutions";
import { IS_FRAUD_TO_ANALYST, stepLabel } from "./caseStatus";
import { formatDuration } from "./formatDuration";

const LOOP_STEPS = new Set(["classification", "adversarial"]);

export function CaseClassificationLoop({ steps }: { steps: WorkflowStepResponse[] }) {
  const loop = sortByStart(steps).filter((step) => LOOP_STEPS.has(step.step_name));
  if (loop.length === 0) return null;

  return (
    <div className="border border-border rounded-lg px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h4 className="text-[13px] font-semibold text-text-primary">Intentos del clasificador</h4>
        <span className="text-[11px] text-text-secondary">
          El adversarial revisa cada clasificación y puede devolverla
        </span>
      </div>
      <ol>
        {loop.map((step) => (
          <li
            key={step.id}
            className="grid grid-cols-[130px_minmax(0,1fr)_auto] gap-3 items-start py-2 border-t border-border first:border-t-0"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary pt-0.5">
              {stepLabel(step.step_name)}
              {step.step_name === "classification" && ` ${step.attempt}`}
            </span>
            <LoopOutcome step={step} />
            <span className="text-[11px] text-text-secondary tabular-nums">
              {formatDuration(stepDurationSeconds(step))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LoopOutcome({ step }: { step: WorkflowStepResponse }) {
  const output = asObject(step.output);
  if (step.status === "FAILED") {
    return <span className="text-[12px] text-text-secondary">Falló: {step.error}</span>;
  }
  if (!output) return <span className="text-[12px] text-text-secondary">Sin resultado</span>;

  if (step.step_name === "adversarial") {
    const feedback = typeof output.feedback === "string" && output.feedback;
    return output.requires_classification_feedback ? (
      <span className="text-[12px] text-text-primary">
        <span className="font-semibold text-text-secondary">Devuelve al clasificador</span>
        {feedback && ` · ${feedback}`}
      </span>
    ) : (
      <span className="text-[12px] font-semibold text-primary">Aprueba la clasificación</span>
    );
  }

  const predicted = String(output.is_fraud ?? "—");
  const expected = output.expected_classification;
  const matches = typeof expected === "string" ? IS_FRAUD_TO_ANALYST[predicted] === expected : null;
  return (
    <span className="text-[12px] text-text-primary">
      Predijo <b>{predicted}</b>
      {expected != null && (
        <>
          {" "}
          · Esperado <b>{String(expected)}</b>
          {matches !== null && (
            <span
              className={`ml-1 font-semibold ${matches ? "text-primary" : "text-text-secondary"}`}
            >
              {matches ? "✓" : "✕"}
            </span>
          )}
        </>
      )}
    </span>
  );
}
