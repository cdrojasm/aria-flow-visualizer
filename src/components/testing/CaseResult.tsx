import type { ReactNode } from "react";

import type { StepStatus, WorkflowStepResponse } from "@/lib/api/testing.functions";

import { exhaustedAdversarialReviews, latestOutput, sortByStart } from "./caseExecutions";
import { IS_FRAUD_TO_ANALYST, stepLabel } from "./caseStatus";

const TONE_STYLE = {
  primary: { box: "border-l-primary bg-primary/5", title: "text-primary" },
  neutral: { box: "border-l-text-secondary bg-surface", title: "text-text-secondary" },
  live: { box: "border-l-warning bg-warning/5", title: "text-warning" },
} as const;

function ResultBox({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONE_STYLE;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`border-l-[3px] rounded-lg px-4 py-3 space-y-1 ${TONE_STYLE[tone].box}`}>
      <p className={`text-[14px] font-semibold ${TONE_STYLE[tone].title}`}>{title}</p>
      {children}
    </div>
  );
}

export function CaseResult({
  status,
  steps,
  executionCount,
  silentFailureStep,
}: {
  status: StepStatus;
  steps: WorkflowStepResponse[];
  executionCount: number;
  silentFailureStep: string | null;
}) {
  const deterministic = latestOutput(steps, "deterministic");
  if (status === "SUCCEEDED" && deterministic?.matched) {
    return (
      <ResultBox
        tone="primary"
        title={`Descartado por la regla determinística “${deterministic.rule_id}”`}
      >
        <p className="text-[12px] text-text-primary">
          Variable evaluada: <b>{String(deterministic.variable)}</b> · Decisión:{" "}
          <b>{String(deterministic.decision)}</b> · Acción ARIC:{" "}
          <b>{String(deterministic.aric_action)}</b>. No se llamó al LLM.
        </p>
      </ResultBox>
    );
  }

  // Un fallo en un paso ya se ve en el recorrido; solo se explica el que ocurrió fuera de un paso.
  if (status === "FAILED") {
    if (!silentFailureStep) return null;
    const retries = executionCount > 1 ? ` después de ${executionCount} ejecuciones` : "";
    return (
      <ResultBox tone="neutral" title={`Falló en ${stepLabel(silentFailureStep)}${retries}`}>
        <p className="text-[12px] text-text-primary">
          {exhaustedAdversarialReviews(steps)
            ? "Se agotaron las revisiones del adversarial; el caso se escaló al analista."
            : "El sistema no registró el error en ningún paso."}
        </p>
      </ResultBox>
    );
  }

  if (status !== "SUCCEEDED") {
    const current = sortByStart(steps).at(-1);
    return <ResultBox tone="live" title={`En proceso: ${stepLabel(current?.step_name ?? null)}`} />;
  }

  const classification = latestOutput(steps, "classification");
  if (!classification) return <ResultBox tone="primary" title="Completado" />;
  const predicted = String(classification.is_fraud ?? "—");
  const expected = classification.expected_classification;
  const matches = typeof expected === "string" ? IS_FRAUD_TO_ANALYST[predicted] === expected : null;
  return (
    <ResultBox tone="primary" title={`Clasificado como “${predicted}”`}>
      <p className="text-[12px] text-text-primary">
        {expected != null && (
          <>
            Esperado según el analista: <b>{String(expected)}</b>{" "}
            {matches !== null && (
              <span className={`font-semibold ${matches ? "text-primary" : "text-text-secondary"}`}>
                {matches ? "✓ Coincide" : "✕ No coincide"}
              </span>
            )}
          </>
        )}
        {classification.ground_truth_tipo != null && (
          <>
            {" "}
            · Desenlace real: <b>{String(classification.ground_truth_tipo)}</b>
          </>
        )}
      </p>
    </ResultBox>
  );
}
