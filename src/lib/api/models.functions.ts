import type { FeatureConfiguration } from "./feature-recipes.functions";
import { apiFetch } from "./client";

// Client functions wrapping the backend's model-training CRUD/versioning
// API (../backend, base path /api/v0/models — see backend CLAUDE.md's
// "Alert / workflow domain state" for the shape this mirrors,
// src/application/ports/model_port.py for the source of truth).

export type ModelStatus = "DRAFT" | "TRAINING" | "READY" | "FAILED";

export type FieldTransformKind =
  "numeric" | "categorical" | "date_derived" | "rule_multihot" | "drop";

export type FieldTransform = {
  field: string;
  kind: FieldTransformKind;
  reference_field: string | null;
  top_n: number;
};

export type HistoricalFeature = {
  name: string;
  field: string;
  reference_field: string;
  time_field: string;
  value_field: string;
  operation: "count" | "sum" | "median" | "mean" | "max" | "distinct" | "recency";
  window_hours: number;
  filter_field: "tipo_transaccion" | "integrationpoint" | "canal" | null;
  filter_value: string | null;
  compare_field: string | null;
};
export type TrainingConfig = {
  n_estimators: number;
  max_depth: number;
  learning_rate: number;
  subsample: number;
  colsample_bytree: number;
  reg_lambda: number;
  min_child_weight: number;
  scale_pos_weight: number | null;
  early_stopping_rounds: number | null;
  split_strategy: "temporal" | "stratified";
  time_field: string;
  timezone: string;
};
export type ThresholdMetrics = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  alerts: number;
};
export type TrainingReport = {
  schema_version: number;
  evaluation_partition: string;
  threshold: number;
  split_strategy: string;
  timezone: string;
  duration_seconds: number;
  best_iteration: number;
  feature_count: number;
  partitions: Record<string, { rows: number; positive: number }>;
  thresholds: ThresholdMetrics[];
  learning_curve: { iteration: number; training: number; validation: number }[];
  roc_curve: { fpr: number; tpr: number }[];
  precision_recall_curve: { recall: number; precision: number }[];
  calibration_curve: { predicted: number; observed: number }[];
  feature_importance: { feature: string; importance: number }[];
  dataset_sha256: string;
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
  feature_configuration?: FeatureConfiguration | null;
  historical_features?: HistoricalFeature[];
  training_config?: TrainingConfig;
  training_report?: TrainingReport | null;
};

export type CreateModelPayload = {
  tag: string;
  description: string;
  dataset_name: string;
  target_field: string;
  positive_labels: string[];
  feature_transforms: FieldTransform[];
  feature_configuration?: FeatureConfiguration | null;
  historical_features?: HistoricalFeature[];
  training_config?: TrainingConfig;
};

export type ModelScoreResponse = {
  model_id: string;
  model_tag: string;
  score: number;
  score_raw: number;
  threshold: number;
  predicted_positive: boolean;
  top_features: { feature: string; contribution: number; value: string }[];
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

export function scoreModel({
  data,
}: {
  data: { id: string; row: Record<string, unknown> };
}): Promise<ModelScoreResponse> {
  return apiFetch(`/api/v0/models/${encodeURIComponent(data.id)}/score`, {
    method: "POST",
    body: JSON.stringify({ row: data.row }),
  });
}
