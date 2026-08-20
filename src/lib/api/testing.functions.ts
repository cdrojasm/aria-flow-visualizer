import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Server functions wrapping the backend's batch-test-run API
// (../backend, base path /api/v0 — see its CLAUDE.md for the hexagonal
// layout, not relevant here since we only call the HTTP surface).

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = getServerConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type TestRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type StepStatus = "PENDING" | "DISPATCHED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type DatasetRecord = { name: string; row_count: number };

export type TestRunResponse = {
  id: string;
  name: string;
  dataset_name: string;
  status: TestRunStatus;
  total: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

// Arbitrary JSON — step input/output payloads are opaque blobs from the
// backend, shaped differently per step. A recursive union (rather than
// Record<string, unknown>) is what TanStack Start's serializability check
// on createServerFn return types actually accepts.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type TestCaseSummary = {
  workflow_execution_id: string;
  alert_id: string;
  status: StepStatus;
  current_step: string | null;
  duration_seconds: number | null;
};

export type DurationStats = {
  count: number;
  min_seconds: number;
  max_seconds: number;
  avg_seconds: number;
  p95_seconds: number;
};

export type ClassMetrics = {
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

export type ClassificationMetrics = {
  per_class: Record<string, ClassMetrics>;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  // expected label -> predicted label -> count.
  confusion_matrix: Record<string, Record<string, number>>;
  total: number;
};

export type TestRunDetailResponse = {
  id: string;
  name: string;
  dataset_name: string;
  config: {
    prompt_overrides: Record<string, string>;
    model_overrides: Record<string, string>;
    max_feedback_iterations: number;
  };
  status: TestRunStatus;
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  pending: number;
  input_tokens: number;
  output_tokens: number;
  cases: TestCaseSummary[];
  // Worker duration (started_at -> finished_at) stats, seconds. Per pipeline
  // stage (keyed by step_name) plus one overall block across each case's
  // total created_at -> finished_at duration.
  step_duration_stats: Record<string, DurationStats>;
  total_duration_stats: DurationStats | null;
  // Two independent scorings of the model's is_fraud calls, built from each
  // case's final classification attempt - null until at least one case has
  // one. See backend classification_metrics.py for the label mappings.
  analyst_agreement_metrics: ClassificationMetrics | null;
  ground_truth_metrics: ClassificationMetrics | null;
};

export type WorkflowStepResponse = {
  id: string;
  step_name: string;
  status: StepStatus;
  attempt: number;
  input: Json | null;
  output: Json | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type TestCaseDetailResponse = {
  workflow_execution_id: string;
  alert_id: string;
  status: StepStatus;
  input_tokens: number;
  output_tokens: number;
  steps: WorkflowStepResponse[];
};

export const getDatasets = createServerFn({ method: "GET" }).handler(() =>
  apiFetch<DatasetRecord[]>("/api/v0/datasets"),
);

export const listTestRuns = createServerFn({ method: "GET" })
  .inputValidator(z.object({ order: z.enum(["asc", "desc"]).default("desc") }).optional())
  .handler(({ data }) =>
    apiFetch<TestRunResponse[]>(`/api/v0/test-runs?order=${data?.order ?? "desc"}`),
  );

export const deleteTestRuns = createServerFn({ method: "POST" })
  .inputValidator(z.object({ test_run_ids: z.array(z.string()).min(1) }))
  .handler(({ data }) =>
    apiFetch<{ deleted_test_runs: number; deleted_cases: number }>("/api/v0/test-runs", {
      method: "DELETE",
      body: JSON.stringify(data),
    }),
  );

export const getTestRun = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(({ data }) => apiFetch<TestRunDetailResponse>(`/api/v0/test-runs/${data.id}`));

export const getTestCase = createServerFn({ method: "GET" })
  .inputValidator(z.object({ runId: z.string().min(1), workflowExecutionId: z.string().min(1) }))
  .handler(({ data }) =>
    apiFetch<TestCaseDetailResponse>(
      `/api/v0/test-runs/${data.runId}/cases/${data.workflowExecutionId}`,
    ),
  );

export const startTestRun = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      dataset_name: z.string().min(1),
      config: z
        .object({
          prompt_overrides: z.record(z.string()).default({}),
          model_overrides: z.record(z.string()).default({}),
          // How many classification<->adversarial feedback loops a case
          // gets before escalating to an analyst. Backend default is 2.
          max_feedback_iterations: z.number().int().min(0).optional(),
        })
        .optional(),
      // Omit both = every row. sample_size alone = stratified by the
      // dataset's own no-risk/risk-suspected/risk proportions. Both =
      // stratified by these exact percentages instead.
      sample_size: z.number().int().positive().optional(),
      sample_distribution: z.record(z.number()).optional(),
    }),
  )
  .handler(({ data }) =>
    apiFetch<{ test_run_id: string; dispatched_count: number }>("/api/v0/test-runs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  );
