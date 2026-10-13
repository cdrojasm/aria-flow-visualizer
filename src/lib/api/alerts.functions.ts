import { accessToken, apiFetch, API_BASE } from "./client";
import type { DatasetStatus } from "./datasets.functions";
import { metricsSearchParams, type MetricsQuery } from "./metrics.functions";

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

// --- Fraud history (A3) + fraud_label review (C5) ---------------------------
// Mirrors schemas.py's "Fraud history (A3) + fraud_label review (C5)"
// section field for field. mark = what ARIA/analyst/voicebot decided;
// fraud_label = the real outcome the fraud team confirms or corrects
// (starts equal to mark). "pending" = not decided yet (escalated, bidi,
// unresolved voicebot) - excluded from false positives / undetected fraud.

export type ApiMark = "fraud" | "no_fraud" | "pending";
export type ApiFraudLabel = "fraud" | "no_fraud";

// AlertHistoryItemSchema
export type ApiAlertHistoryItem = {
  alert_id: string;
  event_id: string;
  event_type: string;
  status: string;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  // false = no metrics event touched this alert yet; the fields below are
  // then derived from its payload (mark/fraud_label "pending").
  has_snapshot: boolean;
  origin: string | null;
  segment: string | null;
  channel: string | null;
  subchannel: string | null;
  amount: number | null;
  amount_tier: string;
  schema_version: number | null;
  configuration_id: string | null;
  resolution_method: "aria" | "analyst" | "voicebot" | "bidi" | null;
  mark: ApiMark;
  fraud_label: ApiMark;
  marked_at: string | null;
  fraud_reviewed_at: string | null;
  fraud_review_count: number;
  resolution_time_seconds: number | null;
};

// AlertHistoryPageResponse
export type ApiAlertHistoryPage = {
  items: ApiAlertHistoryItem[];
  // Opaque - pass back as ?cursor= for the next page; null = no more. A
  // page can be short (even empty) and still carry a cursor.
  next_cursor: string | null;
};

// FraudLabelReviewSchema - one append-only audit row.
export type ApiFraudLabelReview = {
  id: string;
  alert_id: string;
  from_label: ApiMark;
  to_label: ApiFraudLabel;
  reviewed_by: string;
  reviewed_at: string;
  channel: "ui" | "csv";
  note: string;
};

// FraudReviewResponse
export type ApiFraudReviewResponse = {
  review: ApiFraudLabelReview;
  mark: ApiMark;
  fraud_label: ApiMark;
  marked_at: string | null;
  fraud_reviewed_at: string | null;
  fraud_review_count: number;
};

export type ApiFraudReviewImportStatus = "PENDING" | "READY" | "FAILED";

// FraudLabelReviewRowResultSchema
export type ApiFraudReviewImportRow = {
  row: number;
  alert_id: string;
  fraud_label: string;
  status: "applied" | "invalid" | "not_found" | "error";
  error: string | null;
};

// UploadFraudLabelReviewImportResponse
export type ApiUploadFraudReviewImportResponse = {
  task_id: string;
  status: ApiFraudReviewImportStatus;
};

// FraudLabelReviewImportResponse
export type ApiFraudReviewImport = {
  task_id: string;
  status: ApiFraudReviewImportStatus;
  total: number;
  applied: number;
  failed: number;
  rows: ApiFraudReviewImportRow[];
  error: string | null;
};

// GET /alerts/history (permission fraud_history): newest first, paged by
// arrival day. Same range/filters as /metrics/*.
export function listAlertHistory({
  data,
}: {
  data: MetricsQuery & { limit?: number; cursor?: string | null };
}): Promise<ApiAlertHistoryPage> {
  const params = metricsSearchParams(data);
  if (data.limit) params.set("limit", String(data.limit));
  if (data.cursor) params.set("cursor", data.cursor);
  return apiFetch(`/api/v0/alerts/history?${params.toString()}`);
}

// POST /alerts/{id}/fraud-review (permission fraud_review). The reviewer
// is taken from the session, not the body. Same value = a confirmation
// (still audited, fills fraud_reviewed_at).
export function reviewFraudLabel({
  data,
}: {
  data: { alertId: string; fraudLabel: ApiFraudLabel; note: string };
}): Promise<ApiFraudReviewResponse> {
  return apiFetch(`/api/v0/alerts/${encodeURIComponent(data.alertId)}/fraud-review`, {
    method: "POST",
    body: JSON.stringify({ fraud_label: data.fraudLabel, note: data.note }),
  });
}

// GET /alerts/{id}/fraud-reviews (permission fraud_history): audit trail,
// oldest first.
export function listFraudLabelReviews({
  data,
}: {
  data: { alertId: string };
}): Promise<ApiFraudLabelReview[]> {
  return apiFetch(`/api/v0/alerts/${encodeURIComponent(data.alertId)}/fraud-reviews`);
}

// POST /alerts/fraud-review-imports (permission fraud_review): multipart
// CSV with columns alert_id,fraud_label,note -> 202 {task_id}. Bypasses
// apiFetch's forced JSON Content-Type so the browser sets the multipart
// boundary, but still sends the session token (the endpoint needs it).
export async function uploadFraudReviewImport({
  data,
}: {
  data: { file: File };
}): Promise<ApiUploadFraudReviewImportResponse> {
  const body = new FormData();
  body.append("file", data.file);
  const token = accessToken();
  const path = "/api/v0/alerts/fraud-review-imports";
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<ApiUploadFraudReviewImportResponse>;
}

// GET /alerts/fraud-review-imports/{task_id}: poll until status != PENDING.
export function getFraudReviewImport({
  data,
}: {
  data: { taskId: string };
}): Promise<ApiFraudReviewImport> {
  return apiFetch(`/api/v0/alerts/fraud-review-imports/${encodeURIComponent(data.taskId)}`);
}

// One UI "page" of history: follows next_cursor until at least `minItems`
// rows arrived or the cursor runs out. Very selective filters can make the
// backend return short or even empty pages that still carry a cursor (it
// pages by arrival day); `maxRequests` bounds a single click.
export async function collectAlertHistoryPage(
  query: MetricsQuery,
  cursor: string | null,
  { minItems = 50, maxRequests = 10, fetchPage = listAlertHistory } = {},
): Promise<ApiAlertHistoryPage> {
  const items: ApiAlertHistoryItem[] = [];
  let next: string | null = cursor;
  let requests = 0;
  do {
    const page = await fetchPage({ data: { ...query, limit: minItems, cursor: next } });
    items.push(...page.items);
    next = page.next_cursor;
    requests += 1;
  } while (next && items.length < minItems && requests < maxRequests);
  return { items, next_cursor: next };
}
