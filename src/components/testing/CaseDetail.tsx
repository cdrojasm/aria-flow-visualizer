import { useState } from "react";

import type { TestCaseDetailResponse, TestCaseSummary } from "@/lib/api/testing.functions";

import { CaseAlertData } from "./CaseAlertData";
import { CaseClassificationLoop } from "./CaseClassificationLoop";
import { findSilentFailureStep, groupExecutions, resolveActiveStep } from "./caseExecutions";
import { CasePipeline } from "./CasePipeline";
import { CaseResult } from "./CaseResult";
import { CaseStepData } from "./CaseStepDetail";
import { ExecutionMarkers } from "./ExecutionMarkers";
import { Hint } from "./Hint";
import { EDGE_LINES } from "./surfaceStyles";

export function CaseDetail({
  summary,
  detail,
}: {
  summary: TestCaseSummary;
  detail: TestCaseDetailResponse;
}) {
  const executions = groupExecutions(detail.steps);
  const silentFailureStep = findSilentFailureStep(
    detail.status,
    detail.steps,
    summary.current_step,
  );
  const [executionIndex, setExecutionIndex] = useState(executions.length - 1);
  const [selectedStepName, setSelectedStepName] = useState<string | null>(null);
  const execution = executions[Math.min(executionIndex, executions.length - 1)] ?? [];
  const activeStep = resolveActiveStep(execution, selectedStepName);

  return (
    <div className="flex-1 flex flex-col gap-3.5">
      <div className={`flex-1 bg-card pt-1 pb-2 ${EDGE_LINES}`}>
        <div className="mb-3">
          <CaseTitle detail={detail} />
        </div>
        <div className="relative rounded-lg border border-border px-2 pt-5 pb-2">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-card px-2">
            <ExecutionMarkers
              executions={executions}
              selectedIndex={Math.min(executionIndex, executions.length - 1)}
              onSelect={(index) => {
                setExecutionIndex(index);
                setSelectedStepName(null);
              }}
            />
          </div>
          <CasePipeline
            executions={executions}
            executionIndex={executionIndex}
            activeStepName={activeStep?.step_name}
            onSelectStep={setSelectedStepName}
            silentFailureStep={silentFailureStep}
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-5 items-start mt-2">
          <CaseAlertData steps={detail.steps} alertId={detail.alert_id} />
          {activeStep && <CaseStepData key={activeStep.id} step={activeStep} caseDetail={detail} />}
        </div>
      </div>

      <CaseResult
        status={detail.status}
        steps={detail.steps}
        executionCount={executions.length}
        silentFailureStep={silentFailureStep}
      />
      <CaseClassificationLoop steps={detail.steps} />
    </div>
  );
}

function CaseTitle({ detail }: { detail: TestCaseDetailResponse }) {
  const hasTokens = detail.input_tokens + detail.output_tokens > 0;
  return (
    <h4 className="flex items-baseline gap-1.5 text-[13px] font-semibold text-text-primary">
      Pipeline
      <span className="text-[12px] font-normal text-text-secondary">
        (
        <Hint content="Tokens del LLM (Azure OpenAI) usados por este caso, entrada / salida. Miden el costo y tamaño del procesamiento.">
          <span>
            Tokens{" "}
            <b className="text-text-primary tabular-nums">
              {hasTokens
                ? `${detail.input_tokens.toLocaleString()} / ${detail.output_tokens.toLocaleString()}`
                : "0"}
            </b>
          </span>
        </Hint>
        )
      </span>
    </h4>
  );
}
