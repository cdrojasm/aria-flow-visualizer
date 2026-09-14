import { apiFetch, API_BASE } from "./client";

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
};

export type DatasetRowsResponse = { rows: Record<string, unknown>[]; total: number };

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
}: {
  data: FormData;
}): Promise<{ name: string; status: DatasetStatus }> {
  // Multipart body: must NOT go through apiFetch, which forces a JSON
  // Content-Type — the browser needs to set its own multipart boundary.
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

export function createEmptyDataset({
  data,
}: {
  data: { name: string; fields: string[] };
}): Promise<{ name: string; status: DatasetStatus }> {
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
}): Promise<{ name: string; status: DatasetStatus }> {
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
