import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

// Server functions wrapping the backend's analyst-capacity import API
// (../backend, base path /api/v0/analyst-capacity — see backend/CLAUDE.md).
// Upload dispatches an async Celery parse of a two-sheet workbook
// ("Perfiles" + "Asignación"); poll getAnalystCapacityImport until status
// leaves PENDING. Nothing here is persisted server-side — the result only
// ever feeds the frontend draft (src/data/configs.ts's AnalystCapacity).

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl } = getServerConfig();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

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
export const uploadAnalystCapacityImport = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { apiUrl } = getServerConfig();
    const res = await fetch(`${apiUrl}/api/v0/analyst-capacity/imports`, {
      method: "POST",
      body: data,
    });
    if (!res.ok) {
      throw new Error(`/api/v0/analyst-capacity/imports -> ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<UploadAnalystCapacityImportResponse>;
  });

export const getAnalystCapacityImport = createServerFn({ method: "GET" })
  .inputValidator(z.object({ taskId: z.string().min(1) }))
  .handler(({ data }) =>
    apiFetch<AnalystCapacityImportResponse>(
      `/api/v0/analyst-capacity/imports/${encodeURIComponent(data.taskId)}`,
    ),
  );
