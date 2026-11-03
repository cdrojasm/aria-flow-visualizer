import type { StepStatus, TestCaseSummary } from "@/lib/api/testing.functions";

import { PIPELINE_STEP_LABELS } from "./pipelineSteps";

export const CASE_STATUS_META: Record<StepStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-warning/10 text-warning" },
  DISPATCHED: { label: "En cola", className: "bg-warning/10 text-warning" },
  RUNNING: { label: "En curso", className: "bg-warning/10 text-warning" },
  SUCCEEDED: { label: "Completado", className: "bg-primary/10 text-primary" },
  FAILED: { label: "Fallido", className: "bg-danger/10 text-danger" },
};

// Debe coincidir con _IS_FRAUD_TO_ANALYST de classification_metrics.py en el backend.
export const IS_FRAUD_TO_ANALYST: Record<string, string> = {
  fraud: "risk",
  unknown: "risk-suspected",
  not_fraud: "no-risk",
};

export function stepLabel(stepName: string | null): string {
  if (!stepName) return "—";
  return PIPELINE_STEP_LABELS[stepName] ?? stepName;
}

export const ALL_OUTCOMES = "all";

type Bucket = "succeeded" | "failed" | "inProgress";

const BUCKET_ORDER: Bucket[] = ["succeeded", "failed", "inProgress"];

// Tonos por grupo dentro del mismo estado, del más fuerte al más suave.
const BUCKET_TONES: Record<Bucket, { legend: string }[]> = {
  succeeded: [
    { legend: "border-l-primary text-primary" },
    { legend: "border-l-primary/65 text-primary" },
    { legend: "border-l-primary/40 text-primary" },
  ],
  failed: [
    { legend: "border-l-text-secondary text-text-secondary" },
    { legend: "border-l-text-secondary/65 text-text-secondary" },
    { legend: "border-l-text-secondary/40 text-text-secondary" },
  ],
  inProgress: [
    { legend: "border-l-warning text-warning" },
    { legend: "border-l-warning/65 text-warning" },
    { legend: "border-l-warning/40 text-warning" },
  ],
};

export type CaseOutcomeGroup = {
  key: string;
  label: string;
  count: number;
  legendClass: string;
};

function bucketOf(status: StepStatus): Bucket {
  if (status === "SUCCEEDED") return "succeeded";
  if (status === "FAILED") return "failed";
  return "inProgress";
}

export function caseOutcomeKey(testCase: TestCaseSummary): string {
  return `${testCase.status}|${testCase.current_step ?? ""}`;
}

function outcomeLabel(status: StepStatus, stepName: string | null): string {
  if (status === "SUCCEEDED") {
    return stepName === "deterministic"
      ? "Completado por regla determinística"
      : `Completado en ${stepLabel(stepName)}`;
  }
  if (status === "FAILED") {
    return stepName ? `Fallido en ${stepLabel(stepName)}` : "Fallido antes de iniciar";
  }
  return `${CASE_STATUS_META[status].label} · ${stepLabel(stepName)}`;
}

export function buildOutcomeGroups(cases: TestCaseSummary[]): CaseOutcomeGroup[] {
  const byKey = new Map<string, { status: StepStatus; step: string | null; count: number }>();
  cases.forEach((c) => {
    const key = caseOutcomeKey(c);
    const entry = byKey.get(key) ?? { status: c.status, step: c.current_step, count: 0 };
    entry.count += 1;
    byKey.set(key, entry);
  });
  const entries = [...byKey.entries()].sort(
    ([, a], [, b]) =>
      BUCKET_ORDER.indexOf(bucketOf(a.status)) - BUCKET_ORDER.indexOf(bucketOf(b.status)) ||
      b.count - a.count,
  );
  const toneIndex: Record<Bucket, number> = { succeeded: 0, failed: 0, inProgress: 0 };
  return entries.map(([key, { status, step, count }]) => {
    const bucket = bucketOf(status);
    const tones = BUCKET_TONES[bucket];
    const tone = tones[Math.min(toneIndex[bucket]++, tones.length - 1)];
    return {
      key,
      label: outcomeLabel(status, step),
      count,
      legendClass: tone.legend,
    };
  });
}
