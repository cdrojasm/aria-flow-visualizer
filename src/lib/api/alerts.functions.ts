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
