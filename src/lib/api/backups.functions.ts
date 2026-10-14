import { apiFetch } from "./client";

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
