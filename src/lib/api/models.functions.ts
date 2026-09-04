import { apiFetch } from "./client";

// Client functions wrapping the backend's model-training CRUD/versioning
// API (../backend, base path /api/v0/models — see backend CLAUDE.md's
// "Alert / workflow domain state" for the shape this mirrors,
// src/application/ports/model_port.py for the source of truth).

export type ModelStatus = "DRAFT" | "TRAINING" | "READY" | "FAILED";

export type FieldTransformKind =
  | "numeric"
  | "categorical"
  | "date_derived"
  | "rule_multihot"
  | "drop";

export type FieldTransform = {
  field: string;
  kind: FieldTransformKind;
  reference_field: string | null;
  top_n: number;
};

export type ModelResponse = {
  id: string;
  tag: string;
  description: string;
  status: ModelStatus;
  dataset_name: string;
  target_field: string;
  positive_labels: string[];
  feature_transforms: FieldTransform[];
  active: boolean;
  metrics: Record<string, number> | null;
  storage_ref: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  error: string | null;
};

export type CreateModelPayload = {
  tag: string;
  description: string;
  dataset_name: string;
  target_field: string;
  positive_labels: string[];
  feature_transforms: FieldTransform[];
};

export function getModels(): Promise<ModelResponse[]> {
  return apiFetch("/api/v0/models");
}

export function getModel({ data }: { data: { id: string } }): Promise<ModelResponse> {
  return apiFetch(`/api/v0/models/${encodeURIComponent(data.id)}`);
}

export function createModel({ data }: { data: CreateModelPayload }): Promise<ModelResponse> {
  return apiFetch("/api/v0/models", { method: "POST", body: JSON.stringify(data) });
}

export function deleteModel({
  data,
}: {
  data: { id: string };
}): Promise<{ id: string; deleted: boolean }> {
  return apiFetch(`/api/v0/models/${encodeURIComponent(data.id)}`, { method: "DELETE" });
}

export function trainModel({
  data,
}: {
  data: { id: string };
}): Promise<{ async_operation_id: string; model_id: string }> {
  return apiFetch(`/api/v0/models/${encodeURIComponent(data.id)}/train`, { method: "POST" });
}

export function activateModel({ data }: { data: { id: string } }): Promise<ModelResponse> {
  return apiFetch(`/api/v0/models/${encodeURIComponent(data.id)}/activate`, { method: "POST" });
}
