import type { WorkflowStepResponse } from "@/lib/api/testing.functions";

import { stepLabel } from "./caseStatus";
import { Hint } from "./Hint";

function executionSummary(execution: WorkflowStepResponse[]): string {
  const failed = execution.find((step) => step.status === "FAILED");
  if (failed) return `falló en ${stepLabel(failed.step_name)}`;
  return `terminó en ${stepLabel(execution.at(-1)?.step_name ?? null)}`;
}

type ExecutionState = "failed" | "succeeded" | "inProgress";

function executionState(
  execution: WorkflowStepResponse[],
  hasFollowingExecution: boolean,
): ExecutionState {
  // Si existe otro intento después de este, este intento terminó en reintento/fallo,
  // incluso cuando el backend no dejó un step explícitamente en FAILED.
  if (hasFollowingExecution || execution.some((step) => step.status === "FAILED")) return "failed";
  if (execution.length > 0 && execution.every((step) => step.status === "SUCCEEDED")) {
    return "succeeded";
  }
  return "inProgress";
}

function executionButtonClass(state: ExecutionState, active: boolean): string {
  if (state === "failed") {
    return `bg-danger border-danger text-white hover:bg-danger/90 ${active ? "ring-2 ring-danger/25 ring-offset-1" : ""}`;
  }

  if (state === "succeeded") {
    return `bg-primary border-primary text-white hover:bg-primary/90 ${active ? "ring-2 ring-primary/25 ring-offset-1" : ""}`;
  }

  return active
    ? "bg-primary border-primary text-white"
    : "bg-card border-border text-text-secondary hover:border-primary hover:text-primary";
}

export function ExecutionMarkers({
  executions,
  selectedIndex,
  onSelect,
}: {
  executions: WorkflowStepResponse[][];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const retries = executions.length - 1;
  const retryNote =
    retries > 0
      ? ` El sistema reintentó el caso ${retries} ${retries === 1 ? "vez" : "veces"}; cada ejecución empieza en el pre-proceso.`
      : "";

  return (
    <div
      className="relative flex items-center justify-center"
      role="group"
      aria-label="Ejecuciones del caso"
    >
      <span className="absolute bottom-full mb-1 whitespace-nowrap text-[10px] leading-none text-text-secondary">
        N° de Intentos
      </span>

      <div className="flex items-center justify-center gap-1">
        {executions.map((execution, index) => {
          const active = index === selectedIndex;
          const state = executionState(execution, index < executions.length - 1);

          return (
            <Hint
              key={index}
              content={`Ejecución ${index + 1} de ${executions.length} · ${executionSummary(execution)}.${retryNote}`}
            >
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Ver ejecución ${index + 1}`}
                onClick={() => onSelect(index)}
                className={`h-6 min-w-6 px-1 rounded-md border text-[11px] font-semibold tabular-nums transition-colors ${executionButtonClass(state, active)}`}
              >
                {index + 1}
              </button>
            </Hint>
          );
        })}
      </div>
    </div>
  );
}
