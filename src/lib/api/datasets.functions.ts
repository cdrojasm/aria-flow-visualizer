import { apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's dataset API
// (../backend, base path /api/v0 — see its CLAUDE.md for the hexagonal
// layout, not relevant here since we only call the HTTP surface).

export type DatasetRecord = { name: string; row_count: number };

export type DatasetStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type FieldDistribution = { value: string; count: number; percentage: number };

export type DatasetSummaryResponse = {
  dataset_name: string;
  status: DatasetStatus;
  total_rows: number;
  field_distributions: Record<string, FieldDistribution[]>;
  available_fields: string[];
  uploaded_at: string | null;
  updated_at: string | null;
  error: string | null;
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

export type AlertFieldMapping = {
  dataset_name: string;
  mappings: Record<string, string>;
  updated_at: string | null;
};

export function getAlertFieldMapping({
  data,
}: {
  data: { name: string };
}): Promise<AlertFieldMapping> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/alert-field-mapping`);
}

export function saveAlertFieldMapping({
  data,
}: {
  data: { name: string; mappings: Record<string, string> };
}): Promise<AlertFieldMapping> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.name)}/alert-field-mapping`, {
    method: "PUT",
    body: JSON.stringify({ mappings: data.mappings }),
  });
}
