import { accessToken, apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's full datasets API (../backend,
// base path /api/v0/datasets — see backend's
// src/infrastructure/entrypoint/api/routers/datasets_router.py for the
// source of truth). testing.functions.ts already has a slim subset
// (getDatasets/uploadDataset/getDatasetSummary/deleteDataset) for the
// Testing page's dataset picker — this file is the complete surface,
// consumed by the dedicated /datasets section.

export type DatasetStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
export type DatasetOrigin = "UPLOADED" | "EMPTY" | "EXTRACTED" | "ALERT_CURATED";

export type DatasetRecord = { name: string; row_count: number };

export type FieldDistribution = { value: string; count: number; percentage: number };

export type FraudMaturationProfile = {
  sample_size: number;
  avg_days: number | null;
  min_days: number | null;
  max_days: number | null;
  p95_days: number | null;
};

// Only present when getDatasetSummary is called with all 5 mark-field
// params below - see backend's analyze_fraud_marking.py.
export type FraudMarkingAnalysisResponse = {
  dataset_name: string;
  evaluated_rows: number;
  skipped_rows: number;
  false_positives: number;
  false_negatives: number;
  properly_marked: number;
  maturation: FraudMaturationProfile;
};

export type DatasetSummaryResponse = {
  dataset_name: string;
  status: DatasetStatus;
  total_rows: number;
  field_distributions: Record<string, FieldDistribution[]>;
  available_fields: string[];
  uploaded_at: string | null;
  updated_at: string | null;
  error: string | null;
  origin: DatasetOrigin;
  source_dataset_names: string[];
  extraction_filter: Record<string, string> | null;
  fraud_marking_analysis: FraudMarkingAnalysisResponse | null;
};

export type FraudMarkingAnalysisQueuedResponse = {
  dataset_name: string;
  status: "PENDING";
  async_operation_id: string;
};

export type DatasetRowsResponse = { rows: Record<string, unknown>[]; total: number };
export type DatasetOperationResponse = {
  name: string;
  status: DatasetStatus;
  async_operation_id: string | null;
};

export type DeleteDatasetOperationResponse = {
  name: string;
  deleted: boolean;
  async_operation_id: string | null;
};

export type AlertFieldMappingResponse = {
  dataset_name: string;
  mappings: Record<string, string>;
  updated_at: string | null;
};

export function getDatasets(): Promise<DatasetRecord[]> {
  return apiFetch("/api/v0/datasets");
}

export async function uploadDataset({
  data,
  onProgress,
}: {
  data: FormData;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<DatasetOperationResponse> {
  // XMLHttpRequest exposes upload.onprogress; fetch deliberately does not
  // expose multipart upload progress in browsers. Do not set Content-Type -
  // the browser supplies the required multipart boundary.
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE}/api/v0/datasets`);
    const token = accessToken();
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onerror = () => reject(new Error("No se pudo conectar al subir el dataset"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as DatasetOperationResponse);
      } else {
        reject(new Error(`/api/v0/datasets -> ${request.status}: ${request.responseText}`));
      }
    };
    request.send(data);
  });
}

type DatasetSummaryRequest = { name: string };
type FraudMarkingAnalysisRequest = DatasetSummaryRequest & {
  first_mark_field: string;
  second_mark_field: string;
  first_mark_time_field: string;
  second_mark_time_field: string;
  positive_values: string[];
};

export function getDatasetSummary({
  data,
}: {
  data: FraudMarkingAnalysisRequest;
}): Promise<DatasetSummaryResponse | FraudMarkingAnalysisQueuedResponse>;
export function getDatasetSummary({
  data,
}: {
  data: DatasetSummaryRequest;
}): Promise<DatasetSummaryResponse>;
export function getDatasetSummary({
  data,
}: {
  data: DatasetSummaryRequest & {
    // All 5 optional and all-or-nothing (backend 400s on a partial set) -
    // when provided, the response's fraud_marking_analysis is populated.
    // positive_values: every mark value that means "flagged as fraud" -
    // a row moving between two of these (e.g. "risk-suspected" -> "risk")
    // is not counted as a false positive/negative, just an escalation
    // within the positive class.
    first_mark_field?: string;
    second_mark_field?: string;
    first_mark_time_field?: string;
    second_mark_time_field?: string;
    positive_values?: string[];
  };
}): Promise<DatasetSummaryResponse | FraudMarkingAnalysisQueuedResponse> {
  const params = new URLSearchParams();
  if (data.first_mark_field) params.set("first_mark_field", data.first_mark_field);
  if (data.second_mark_field) params.set("second_mark_field", data.second_mark_field);
  if (data.first_mark_time_field) params.set("first_mark_time_field", data.first_mark_time_field);
  if (data.second_mark_time_field) {
    params.set("second_mark_time_field", data.second_mark_time_field);
  }
  // Repeated query param, not comma-joined - matches the backend's
  // list[str] Query param and keeps a comma inside a mark value safe.
  for (const value of data.positive_values ?? []) {
    if (value) params.append("positive_values", value);
  }
  const qs = params.toString();
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/summary${qs ? `?${qs}` : ""}`);
}

export function deleteDataset({
  data,
}: {
  data: { name: string };
}): Promise<DeleteDatasetOperationResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}`, { method: "DELETE" });
}

export function createEmptyDataset({
  data,
}: {
  data: { name: string; fields: string[] };
}): Promise<DatasetOperationResponse> {
  return apiFetch("/api/v0/datasets/empty", { method: "POST", body: JSON.stringify(data) });
}

export function extractDataset({
  data,
}: {
  data: {
    source_names: string[];
    filters: Record<string, string>;
    percentage: number;
    target_name: string;
  };
}): Promise<{ name: string; status: DatasetStatus }> {
  return apiFetch("/api/v0/datasets/extract", { method: "POST", body: JSON.stringify(data) });
}

export function appendDatasetRows({
  data,
}: {
  data: { name: string; rows: Record<string, unknown>[] };
}): Promise<{ name: string; total_rows: number; status: DatasetStatus }> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/rows`, {
    method: "POST",
    body: JSON.stringify({ rows: data.rows }),
  });
}

export function getDatasetRows({
  data,
}: {
  data: { name: string; offset?: number; limit?: number };
}): Promise<DatasetRowsResponse> {
  const params = new URLSearchParams();
  if (data.offset !== undefined) params.set("offset", String(data.offset));
  if (data.limit !== undefined) params.set("limit", String(data.limit));
  const qs = params.toString();
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/rows${qs ? `?${qs}` : ""}`);
}

export function analyzeDatasetOnDemand({
  data,
}: {
  data: { name: string };
}): Promise<DatasetOperationResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/analyze`, {
    method: "POST",
  });
}

export function getAlertFieldMapping({
  data,
}: {
  data: { name: string };
}): Promise<AlertFieldMappingResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/alert-field-mapping`);
}

export function saveAlertFieldMapping({
  data,
}: {
  data: { name: string; mappings: Record<string, string> };
}): Promise<AlertFieldMappingResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/alert-field-mapping`, {
    method: "PUT",
    body: JSON.stringify({ mappings: data.mappings }),
  });
}

// Not JSON (CSV attachment) - bypasses apiFetch, triggers a browser
// download directly instead of returning parsed content.
export async function downloadDatasetTemplate(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v0/datasets/${encodeURIComponent(name)}/template`);
  if (!res.ok) {
    throw new Error(`/api/v0/datasets/${name}/template -> ${res.status}: ${await res.text()}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `${name}_template.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
