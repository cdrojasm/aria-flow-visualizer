import { Check, Loader2, X } from "lucide-react";
import type { WorkflowStepResponse } from "@/lib/api/testing.functions";

import { stepDurationSeconds } from "./caseExecutions";
import { stepLabel } from "./caseStatus";
import { Hint } from "./Hint";
import { formatDuration } from "./formatDuration";
import {
  isPipelineStep,
  PIPELINE_STEP_DESCRIPTIONS,
  PIPELINE_STEP_ORDER,
  PIPELINE_STEP_SHORT_LABELS,
} from "./pipelineSteps";

type NodeState = "done" | "failed" | "live" | "skipped";

const STATE_LABEL: Record<NodeState, string> = {
  done: "Completada",
  failed: "Falló",
  live: "En curso",
  skipped: "No se ejecutó en esta ejecución",
};

const NODE_STYLE: Record<NodeState, { dot: string; line: string }> = {
  done: { dot: "bg-primary text-white", line: "before:bg-primary" },
  failed: { dot: "bg-text-secondary text-white", line: "before:bg-primary" },
  live: { dot: "bg-warning text-white", line: "before:bg-primary" },
  skipped: {
    dot: "bg-card border-2 border-dashed border-border text-text-secondary",
    line: "before:bg-border",
  },
};

function nodeState(step: WorkflowStepResponse | undefined, failedHere: boolean): NodeState {
  if (!step) return "skipped";
  if (failedHere) return "failed";
  if (step.status === "SUCCEEDED") return "done";
  if (step.status === "FAILED") return "failed";
  return "live";
}

export function CasePipeline({
  executions,
  executionIndex,
  activeStepName,
  onSelectStep,
  silentFailureStep,
}: {
  executions: WorkflowStepResponse[][];
  executionIndex: number;
  activeStepName: string | undefined;
  onSelectStep: (stepName: string) => void;
  silentFailureStep: string | null;
}) {
  const isLastExecution = executionIndex >= executions.length - 1;
  const execution = executions[Math.min(executionIndex, executions.length - 1)] ?? [];
  const byName = new Map(execution.map((step) => [step.step_name, step]));
  const extraSteps = execution
    .map((step) => step.step_name)
    .filter((name, index, names) => !isPipelineStep(name) && names.indexOf(name) === index);
  const stageNames = [...PIPELINE_STEP_ORDER, ...extraSteps];

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex flex-1 min-w-0 items-start overflow-x-auto pb-0.5">
          {stageNames.map((name, index) => {
            const step = byName.get(name);
            const state = nodeState(step, isLastExecution && name === silentFailureStep);
            const active = name === activeStepName;
            return (
              <Hint
                key={name}
                content={`${stepLabel(name)}: ${STATE_LABEL[state].toLowerCase()}${step ? ` · ${formatDuration(stepDurationSeconds(step))}` : ""}. ${PIPELINE_STEP_DESCRIPTIONS[name] ?? ""}`}
              >
                <button
                  type="button"
                  aria-disabled={!step}
                  aria-pressed={active}
                  onClick={() => step && onSelectStep(name)}
                  className={`relative flex-[1_0_64px] grid justify-items-center gap-1.5 py-1 aria-disabled:cursor-default before:content-[''] before:absolute before:top-[17px] before:right-1/2 before:w-full before:h-0.5 first:before:hidden ${NODE_STYLE[state].line} ${active ? "after:content-[''] after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary" : ""}`}
                >
                  <span
                    className={`relative z-10 h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold ${NODE_STYLE[state].dot}`}
                  >
                    {state === "done" && <Check className="h-3.5 w-3.5" />}
                    {state === "failed" && <X className="h-3.5 w-3.5" />}
                    {state === "live" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {state === "skipped" && index + 1}
                  </span>
                  <span
                    className={`max-w-full text-[10.5px] text-center leading-tight whitespace-nowrap truncate ${active ? "font-bold text-primary" : step ? "text-text-primary" : "text-text-secondary"}`}
                  >
                    {PIPELINE_STEP_SHORT_LABELS[name] ?? stepLabel(name)}
                  </span>
                  <span className="text-[10px] text-text-secondary tabular-nums">
                    {step ? formatDuration(stepDurationSeconds(step)) : "—"}
                  </span>
                </button>
              </Hint>
            );
          })}
        </div>
      </div>
    </div>
  );
}
