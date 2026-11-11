import { StepLlmBadge } from "@/components/llm/StepLlmBadge";
import { useState } from "react";

import type { TestCaseDetailResponse, WorkflowStepResponse } from "@/lib/api/testing.functions";

import { AlertFullData } from "./AlertFullData";
import { asObject, latestOutput } from "./caseExecutions";
import { CopyButton } from "./CopyButton";
import { JsonTree } from "./JsonTree";

type StepTab = "output" | "error" | "reasoning" | "input" | "alert" | "case";
const TAB_LABELS: Record<StepTab, string> = {
  output: "Salida",
  error: "Error",
  reasoning: "Razonamiento",
  input: "Entrada",
  alert: "Datos de alerta completos",
  case: "JSON completo",
};

function availableTabs(step: WorkflowStepResponse): StepTab[] {
  const tabs: StepTab[] = [];
  if (step.output != null) tabs.push("output");
  if (step.error) tabs.push("error");
  if (typeof asObject(step.output)?.cot === "string") tabs.push("reasoning");
  tabs.push("input", "alert", "case");
  return tabs;
}

function copyTextFor(tab: StepTab, step: WorkflowStepResponse, caseDetail: TestCaseDetailResponse) {
  if (tab === "error") return step.error ?? "";
  if (tab === "reasoning") return String(asObject(step.output)?.cot ?? "");
  const value =
    tab === "alert"
      ? latestOutput(caseDetail.steps, "pre_process")
      : tab === "case"
        ? caseDetail
        : tab === "input"
          ? step.input
          : step.output;
  return JSON.stringify(value, null, 2) ?? "";
}

export function CaseStepData({
  step,
  caseDetail,
}: {
  step: WorkflowStepResponse;
  caseDetail: TestCaseDetailResponse;
}) {
  const tabs = availableTabs(step);
  const [selectedTab, setSelectedTab] = useState<StepTab>(step.error ? "error" : tabs[0]);
  const tab = tabs.includes(selectedTab) ? selectedTab : tabs[0];
  const output = asObject(step.output);
  const hasTokens = output && ("input_tokens" in output || "output_tokens" in output);

  return (
    <div className="min-w-0 bg-surface rounded-md px-3 pt-1 pb-2.5 space-y-2">
      <div className="flex items-end justify-between gap-3 border-b border-border">
        <div role="tablist" className="flex gap-1 flex-wrap">
          {tabs.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setSelectedTab(key)}
              className={`px-2.5 py-1.5 text-[12px] -mb-px border-b-2 transition-colors ${tab === key ? "border-primary text-primary font-semibold" : "border-transparent text-text-secondary hover:text-text-primary"}`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="pb-1.5 flex items-center gap-3 text-[11px] text-text-secondary">
          {step.attempt > 1 && <span>Intento {step.attempt}</span>}
          <StepLlmBadge output={step.output} />
          {hasTokens && (
            <span>
              Tokens{" "}
              <b className="text-text-primary tabular-nums">
                {String(output.input_tokens ?? 0)} / {String(output.output_tokens ?? 0)}
              </b>
            </span>
          )}
          <CopyButton
            text={copyTextFor(tab, step, caseDetail)}
            label={
              tab === "alert"
                ? "Copiar datos de la alerta (JSON)"
                : "Copiar contenido de la pestaña"
            }
          />
        </div>
      </div>

      <div className="bg-card rounded-md p-3 max-h-[45vh] overflow-auto">
        {tab === "output" && <JsonTree value={step.output} />}
        {tab === "input" && <JsonTree value={step.input} />}
        {tab === "alert" && (
          <AlertFullData preProcess={latestOutput(caseDetail.steps, "pre_process")} />
        )}
        {tab === "case" && <JsonTree value={caseDetail} depth={1} />}
        {tab === "error" && (
          <p className="font-mono text-[12px] text-text-primary whitespace-pre-wrap break-words">
            {step.error}
          </p>
        )}
        {tab === "reasoning" && (
          <p className="text-[13px] whitespace-pre-wrap break-words">{String(output?.cot ?? "")}</p>
        )}
      </div>
    </div>
  );
}
