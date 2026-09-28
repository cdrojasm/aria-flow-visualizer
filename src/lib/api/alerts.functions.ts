import { apiFetch } from "./client";
import type { DatasetStatus } from "./datasets.functions";

// Client functions wrapping the backend's alerts API (../backend, base
// path /api/v0/alerts — see src/infrastructure/entrypoint/api/routers/
// alerts_router.py for the source of truth).

export type CurateAlertToDatasetResponse = {
  dataset_name: string;
  total_rows: number;
  status: DatasetStatus;
  feedback_id: string;
  configuration_id: string;
  version: number;
};

export function curateAlertToDataset({
  data,
}: {
  data: { alertId: string; datasetName: string; justification: string };
}): Promise<CurateAlertToDatasetResponse> {
  return apiFetch(`/api/v0/alerts/${encodeURIComponent(data.alertId)}/curate-to-dataset`, {
    method: "POST",
    body: JSON.stringify({
      dataset_name: data.datasetName,
      justification: data.justification,
    }),
  });
}

// Dispatches a single, user-authored event payload straight into the real
// 7-step pipeline (no dataset/sampling involved) - the "alerta preformada
// por formulario" test strategy. Tracked as a normal AsyncOperationRecord,
// same polling contract as any other long-running job (see
// asyncOperations.functions.ts / useAsyncOperation.ts) - there's no
// dedicated "test alert" result page, this is fire-and-forget-then-poll.
export type AlertTestResponse = {
  alert_id: string;
  async_operation_id: string;
  workflow_execution_id: string;
  status: string;
};

export function startAlertTest({
  data,
}: {
  data: { event: Record<string, unknown>; created_by?: string | null };
}): Promise<AlertTestResponse> {
  return apiFetch("/api/v0/alerts/test", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
