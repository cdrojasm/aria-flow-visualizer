import { apiFetch } from "./client";
import type { DatasetStatus } from "./datasets.functions";

// Client functions wrapping the backend's alert-action API
// (../backend, base path /api/v0).

export function curateAlertToDataset({
  data,
}: {
  data: {
    alertId: string;
    datasetName: string;
    justification: string;
    // Manual override of the configuration/version to attribute this
    // curation's Feedback record to. Omitted entirely (not sent as
    // undefined) when the analyst leaves "Detectar automáticamente"
    // selected - the backend then tries to infer it from the alert's
    // origin test run, and 400s with a Spanish message asking for a
    // manual pick if it can't.
    configurationId?: string;
    version?: number;
  };
}): Promise<{
  dataset_name: string;
  total_rows: number;
  status: DatasetStatus;
  feedback_id: string;
  configuration_id: string;
  version: number;
}> {
  const body: {
    dataset_name: string;
    justification: string;
    configuration_id?: string;
    version?: number;
  } = {
    dataset_name: data.datasetName,
    justification: data.justification,
  };
  if (data.configurationId !== undefined) body.configuration_id = data.configurationId;
  if (data.version !== undefined) body.version = data.version;

  return apiFetch(`/api/v0/alerts/${encodeURIComponent(data.alertId)}/curate-to-dataset`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
