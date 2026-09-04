import { apiFetch } from "./client";

// Minimal client for the backend's generic /async-operations polling API
// (../backend, src/infrastructure/entrypoint/api/routers/async_operations_router.py)
// - used to poll progress of any long-running job dispatched via that
// abstraction, model training (models.functions.ts) included.

export type AsyncOperationStatus = "PENDING" | "DISPATCHED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type AsyncOperationResponse = {
  id: string;
  operation_type: string;
  status: AsyncOperationStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  dispatched_at: string | null;
  execution_backend: string | null;
  external_id: string | null;
};

export function getAsyncOperation({
  data,
}: {
  data: { id: string };
}): Promise<AsyncOperationResponse> {
  return apiFetch(`/api/v0/async-operations/${encodeURIComponent(data.id)}`);
}

export function listAsyncOperations({
  data,
}: {
  data?: { status?: AsyncOperationStatus };
} = {}): Promise<AsyncOperationResponse[]> {
  const query = data?.status ? `?status=${encodeURIComponent(data.status)}` : "";
  return apiFetch(`/api/v0/async-operations${query}`);
}
