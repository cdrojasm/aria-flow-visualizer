import { accessToken, apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's full datasets API (../backend,
// base path /api/v0/datasets — see backend's
// src/infrastructure/entrypoint/api/routers/datasets_router.py for the
// source of truth). testing.functions.ts already has a slim subset
// (getDatasets/uploadDataset/getDatasetSummary/deleteDataset) for the
// Testing page's dataset picker — this file is the complete surface,
// consumed by the dedicated /datasets section.

export type DatasetStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
export type DatasetOrigin = "UPLOADED" | "EMPTY" | "EXTRACTED" | "ALERT_CURATED" | "PARTITIONED";

export type DatasetRecord = { name: string; row_count: number };

export type FieldDistribution = { value: string; count: number; percentage: number };

export type FraudMaturationProfile = {
  sample_size: number;
  avg_days: number | null;
  min_days: number | null;
  max_days: number | null;
  p50_days: number | null;
  p75_days: number | null;
  p90_days: number | null;
  p95_days: number | null;
  p98_days: number | null;
  p99_days: number | null;
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

type PartitionName = "training" | "validation" | "calibration" | "test";
export type DatasetSplitSourceContext = {
  kind?: "uploaded" | "catalog" | "mature_sample";
  origin?: DatasetOrigin;
  source_dataset_names?: string[];
  mature_snapshot_id?: string;
  mature_content_hash?: string;
  source_partition?: string;
  period_start?: string;
  period_end?: string;
  maturing_days?: number;
  excluded_partitions?: string[];
  sampler_partition_counts?: Record<string, number>;
};
export type DatasetSplitSchemaContext = {
  active_version?: number | null;
  validated_versions?: number[];
  context?: "mature_sample" | "alert_field_mapping" | "column_names";
  missing_mandatory_fields?: string[];
  compatible?: boolean;
};
type DatasetSplitContext = {
  strata_distribution?: Record<string, Record<PartitionName, number>>;
  source_context?: DatasetSplitSourceContext;
  schema_context?: DatasetSplitSchemaContext;
  warnings?: string[];
};

export type DatasetSplitMetadata = DatasetSplitContext & {
  source_name: string;
  source_content_sha256: string;
  proportions: Record<"training" | "validation" | "calibration" | "test", number>;
  seed: number;
  stratify_fields: string[];
  partition_field: string;
  snapshot_id: string;
  partition_counts: Record<"training" | "validation" | "calibration" | "test", number>;
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
  split_metadata: DatasetSplitMetadata | null;
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
export type DatasetSplitPreview = DatasetSplitContext & {
  source_dataset_name: string;
  source_content_sha256: string;
  source_row_count: number;
  partition_counts: Record<"training" | "validation" | "calibration" | "test", number>;
  proportions: Record<"training" | "validation" | "calibration" | "test", number>;
  seed: number;
  stratify_fields: string[];
  available_fields: string[];
};
export type DatasetSplitRequest = {
  target_name: string;
  proportions: Record<"training" | "validation" | "calibration" | "test", number>;
  seed: number;
  stratify_fields: string[];
};
export type DatasetSplitResponse = Omit<
  DatasetSplitPreview,
  "source_dataset_name" | "source_row_count" | "available_fields"
> & {
  dataset_name: string;
  snapshot_id: string;
  partition_field: string;
};
type DatasetUploadSession = {
  upload_id: string;
  name: string;
  part_size_bytes: number;
  total_parts: number;
  expires_at: string;
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
  const file = data.get("file");
  if (!(file instanceof File)) throw new Error("Selecciona un archivo CSV válido");

  const session = await apiFetch<DatasetUploadSession>("/api/v0/datasets/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, total_size_bytes: file.size }),
  });
  let completionRequested = false;
  onProgress?.(0, file.size);
  try {
    for (let partNumber = 1; partNumber <= session.total_parts; partNumber += 1) {
      const start = (partNumber - 1) * session.part_size_bytes;
      const end = Math.min(start + session.part_size_bytes, file.size);
      const part = file.slice(start, end, "application/octet-stream");
      await apiFetch<void>(
        `/api/v0/datasets/uploads/${encodeURIComponent(session.upload_id)}/parts/${partNumber}`,
        { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: part },
      );
      onProgress?.(end, file.size);
    }
    completionRequested = true;
    return await apiFetch<DatasetOperationResponse>(
      `/api/v0/datasets/uploads/${encodeURIComponent(session.upload_id)}/complete`,
      { method: "POST" },
    );
  } catch (error) {
    if (!completionRequested) {
      try {
        await apiFetch<void>(`/api/v0/datasets/uploads/${encodeURIComponent(session.upload_id)}`, {
          method: "DELETE",
        });
      } catch {
        // Keep the original part-transfer failure; the session also expires server-side.
      }
    }
    throw error;
  }
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

export function previewDatasetSplit({
  data,
}: {
  data: {
    source_name: string;
    proportions: DatasetSplitRequest["proportions"];
    seed: number;
    stratify_fields: string[];
  };
}): Promise<DatasetSplitPreview> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.source_name)}/splits/preview`, {
    method: "POST",
    body: JSON.stringify({
      proportions: data.proportions,
      seed: data.seed,
      stratify_fields: data.stratify_fields,
    }),
  });
}

export function prepareDatasetSplit({
  data,
}: {
  data: DatasetSplitRequest & { source_name: string };
}): Promise<DatasetSplitResponse> {
  return apiFetch(`/api/v0/datasets/${encodeURIComponent(data.source_name)}/splits`, {
    method: "POST",
    body: JSON.stringify({
      target_name: data.target_name,
      proportions: data.proportions,
      seed: data.seed,
      stratify_fields: data.stratify_fields,
    }),
  });
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
