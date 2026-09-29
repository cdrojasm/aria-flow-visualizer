import type { Json, WorkflowStepResponse } from "@/lib/api/testing.functions";

export function asObject(value: Json | null): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function stepDurationSeconds(step: WorkflowStepResponse): number | null {
  if (!step.started_at || !step.finished_at) return null;
  return (new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()) / 1000;
}

export function sortByStart(steps: WorkflowStepResponse[]): WorkflowStepResponse[] {
  return [...steps].sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""));
}

// Cada reintento automático del caso vuelve a empezar en pre_process.
export function groupExecutions(steps: WorkflowStepResponse[]): WorkflowStepResponse[][] {
  const executions: WorkflowStepResponse[][] = [];
  sortByStart(steps).forEach((step) => {
    if (step.step_name === "pre_process" || executions.length === 0) executions.push([]);
    executions[executions.length - 1].push(step);
  });
  return executions;
}

const ADVERSARIAL_STEPS = new Set(["adversarial", "detector_adversarial"]);

// Caso fallido sin paso en FAILED: el error ocurrió fuera de un paso registrado.
export function findSilentFailureStep(
  status: string,
  steps: WorkflowStepResponse[],
  currentStep: string | null,
): string | null {
  if (status !== "FAILED" || steps.some((step) => step.status === "FAILED")) return null;
  return currentStep ?? sortByStart(steps).at(-1)?.step_name ?? null;
}

export function exhaustedAdversarialReviews(steps: WorkflowStepResponse[]): boolean {
  const last = sortByStart(steps).at(-1);
  return (
    !!last &&
    ADVERSARIAL_STEPS.has(last.step_name) &&
    !!asObject(last.output)?.requires_classification_feedback
  );
}

export function latestOutput(
  steps: WorkflowStepResponse[],
  stepName: string,
): Record<string, Json> | null {
  const match = sortByStart(steps)
    .reverse()
    .find((step) => step.step_name === stepName && asObject(step.output));
  return match ? asObject(match.output) : null;
}

// Paso activo: el elegido si existe en la ejecución, si no el último que corrió.
export function resolveActiveStep(
  execution: WorkflowStepResponse[],
  selectedStepName: string | null,
): WorkflowStepResponse | undefined {
  const byName = new Map(execution.map((step) => [step.step_name, step]));
  return (selectedStepName ? byName.get(selectedStepName) : undefined) ?? execution.at(-1);
}
