import { API_BASE, accessToken, apiFetch } from "./client";
import type { ModelResponse } from "./models.functions";

export type BackupStatus = "queued" | "running" | "succeeded" | "failed";

export type BackupResponse = {
  backup_id: string;
  directory: string;
  requested_by: string;
  created_at: string;
  updated_at: string;
  status: BackupStatus;
  error: string | null;
  dynamodb_items: number | null;
  opensearch_documents: number | null;
  object_storage_objects: number | null;
};

export function listBackups(): Promise<BackupResponse[]> {
  return apiFetch("/api/v0/backups");
}

export function requestBackup(): Promise<BackupResponse> {
  return apiFetch("/api/v0/backups", { method: "POST" });
}

// Multipart upload: bypasses apiFetch's forced JSON Content-Type so the
// browser sets the multipart boundary. The auth header is added by hand.
export async function uploadModelBundle({
  data,
}: {
  data: { file: File; tag: string; description: string; datasetName: string; targetField: string };
}): Promise<ModelResponse> {
  const body = new FormData();
  body.append("file", data.file);
  body.append("tag", data.tag);
  body.append("description", data.description);
  body.append("dataset_name", data.datasetName);
  body.append("target_field", data.targetField);
  const path = "/api/v0/backups/models";
  const token = accessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const detail = await res.json().then(
      (json) => (typeof json?.detail === "string" ? json.detail : null),
      () => null,
    );
    throw new Error(detail ?? `${path} -> ${res.status}`);
  }
  return res.json() as Promise<ModelResponse>;
}

// Downloads the active configuration (or one version) as a JSON file.
export async function downloadConfiguration({
  data,
}: {
  data?: { configurationId?: string; version?: number };
} = {}): Promise<string> {
  const query = new URLSearchParams();
  if (data?.configurationId) query.set("configuration_id", data.configurationId);
  if (data?.version) query.set("version", String(data.version));
  const path = `/api/v0/backups/configuration${query.size ? `?${query}` : ""}`;
  const token = accessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok)
    throw new Error(res.status === 404 ? "No hay configuración activa" : `Error ${res.status}`);
  const filename =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
    "configuration.json";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}
