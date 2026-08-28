import { apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's batch-test-run API
// (../backend, base path /api/v0 — see its CLAUDE.md for the hexagonal
// layout, not relevant here since we only call the HTTP surface).

export type TestRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type StepStatus = "PENDING" | "DISPATCHED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type DatasetRecord = { name: string; row_count: number };

export type DatasetStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type FieldDistribution = { value: string; count: number; percentage: number };

export type DatasetSummaryResponse = {
  dataset_name: string;
  status: DatasetStatus;
  total_rows: number;
  field_distributions: Record<string, FieldDistribution[]>;
  uploaded_at: string | null;
  updated_at: string | null;
  error: string | null;
};

// null = this run tested whatever configuration was active at dispatch
// time (the only behavior before configuration_ref existed).
export type ConfigurationRef = { configuration_id: string; version: number };

export type TestRunConfig = {
  prompt_overrides: Record<string, string>;
  model_overrides: Record<string, string>;
  max_feedback_iterations: number;
  configuration_ref: ConfigurationRef | null;
};

export type TestRunResponse = {
  id: string;
  name: string;
  dataset_name: string;
  status: TestRunStatus;
  total: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  config: TestRunConfig;
};

// Arbitrary JSON — step input/output payloads are opaque blobs from the
// backend, shaped differently per step.
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
  config: TestRunConfig;
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

export function getDatasets(): Promise<DatasetRecord[]> {
  return apiFetch("/api/v0/datasets");
}

// FormData payload (the uploaded CSV file) - bypasses apiFetch's forced
// JSON Content-Type so the browser's multipart boundary reaches the
// backend intact.
export async function uploadDataset({
  data,
}: {
  data: FormData;
}): Promise<{ name: string; status: DatasetStatus }> {
  const res = await fetch(`${API_BASE}/api/v0/datasets`, { method: "POST", body: data });
  if (!res.ok) {
    throw new Error(`/api/v0/datasets -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ name: string; status: DatasetStatus }>;
}

export function getDatasetSummary({
  data,
}: {
  data: { name: string };
}): Promise<DatasetSummaryResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/summary`);
}

export function deleteDataset({
  data,
}: {
  data: { name: string };
}): Promise<{ name: string; deleted: boolean }> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}`, { method: "DELETE" });
}

export function listTestRuns({
  data,
}: {
  data?: { order: "asc" | "desc" };
} = {}): Promise<TestRunResponse[]> {
  return apiFetch(`/api/v0/test-runs?order=${data?.order ?? "desc"}`);
}

export function deleteTestRuns({
  data,
}: {
  data: { test_run_ids: string[] };
}): Promise<{ deleted_test_runs: number; deleted_cases: number }> {
  return apiFetch("/api/v0/test-runs", { method: "DELETE", body: JSON.stringify(data) });
}

export function getTestRun({ data }: { data: { id: string } }): Promise<TestRunDetailResponse> {
  return apiFetch(`/api/v0/test-runs/${data.id}`);
}

export function getTestCase({
  data,
}: {
  data: { runId: string; workflowExecutionId: string };
}): Promise<TestCaseDetailResponse> {
  return apiFetch(`/api/v0/test-runs/${data.runId}/cases/${data.workflowExecutionId}`);
}

export type StartTestRunRequest = {
  name: string;
  dataset_name: string;
  config?: {
    prompt_overrides?: Record<string, string>;
    model_overrides?: Record<string, string>;
    // How many classification<->adversarial feedback loops a case gets
    // before escalating to an analyst. Backend default is 2.
    max_feedback_iterations?: number;
    // Pins this run to one specific (possibly inactive) ConfigurationRecord
    // instead of whatever is active at dispatch time - lets multiple test
    // runs each target a different configuration concurrently.
    configuration_ref?: { configuration_id: string; version: number } | null;
  };
  // Omit both = every row. sample_size alone = stratified by the dataset's
  // own no-risk/risk-suspected/risk proportions. Both = stratified by these
  // exact percentages instead.
  sample_size?: number;
  sample_distribution?: Record<string, number>;
};

export function startTestRun({
  data,
}: {
  data: StartTestRunRequest;
}): Promise<{ test_run_id: string; dispatched_count: number }> {
  return apiFetch("/api/v0/test-runs", { method: "POST", body: JSON.stringify(data) });
}
