import { z } from "zod";

import { apiFetch, API_BASE } from "./client";

// Client functions wrapping the backend's analyst-capacity import API
// (../backend, base path /api/v0/analyst-capacity — see backend/CLAUDE.md).
// Upload dispatches an async Celery parse of a two-sheet workbook
// ("Perfiles" + "Asignación"); poll getAnalystCapacityImport until status
// leaves PENDING. Nothing here is persisted server-side — the result only
// ever feeds the frontend draft (src/data/configs.ts's AnalystCapacity).

export type AnalystCapacityImportStatus = "PENDING" | "READY" | "FAILED";

export type AnalystCapacityImportProfile = {
  id: string;
  name: string;
  description: string;
  hourly: number[];
};

export type UploadAnalystCapacityImportResponse = {
  task_id: string;
  status: AnalystCapacityImportStatus;
};

export type AnalystCapacityImportResponse = {
  task_id: string;
  status: AnalystCapacityImportStatus;
  profiles: AnalystCapacityImportProfile[];
  day_overrides: Record<string, string>;
  error: string | null;
};

// FormData payload (the uploaded .xlsx file) - bypasses apiFetch's forced
// JSON Content-Type so the browser's multipart boundary reaches the
// backend intact (same pattern as testing.functions.ts's uploadDataset).
export async function uploadAnalystCapacityImport({
  data,
}: {
  data: FormData;
}): Promise<UploadAnalystCapacityImportResponse> {
  const res = await fetch(`${API_BASE}/api/v0/analyst-capacity/imports`, {
    method: "POST",
    body: data,
  });
  if (!res.ok) {
    throw new Error(`/api/v0/analyst-capacity/imports -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<UploadAnalystCapacityImportResponse>;
}

export function getAnalystCapacityImport({
  data,
}: {
  data: { taskId: string };
}): Promise<AnalystCapacityImportResponse> {
  return apiFetch(`/api/v0/analyst-capacity/imports/${encodeURIComponent(data.taskId)}`);
}
