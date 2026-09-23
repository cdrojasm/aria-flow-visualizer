import { apiFetch } from "./client";

export type VectorStoreInstanceResponse = { id: string; version: number; name: string; description: string; created_at: string; created_by: string; updated_at: string | null; updated_by: string | null };
export type VectorStoreDocumentRelation = { relation_id: string; asset_type: "taxonomy" | "modus_operandi" | "yellow_flag" | "red_flag" | "similar_case"; asset_id: string; asset_version: number };

export function listVectorStoreInstances(): Promise<VectorStoreInstanceResponse[]> { return apiFetch("/api/v0/vector-store-instances"); }
export function createVectorStoreInstance(data: { name: string; description: string }): Promise<VectorStoreInstanceResponse> { return apiFetch("/api/v0/vector-store-instances", { method: "POST", body: JSON.stringify(data) }); }
export function listVectorStoreDocuments(instanceId: string): Promise<VectorStoreDocumentRelation[]> { return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`); }
export function addVectorStoreDocument(data: { instanceId: string; assetType: VectorStoreDocumentRelation["asset_type"]; assetId: string; assetVersion?: number }): Promise<VectorStoreDocumentRelation[]> {
  const { instanceId, assetType, assetId, assetVersion = 1 } = data;
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`, { method: "POST", body: JSON.stringify({ asset_type: assetType, asset_id: assetId, asset_version: assetVersion }) });
}
export type VectorStoreImpactPreview = { instance_id: string; will_add: Array<{ asset_type: VectorStoreDocumentRelation["asset_type"]; asset_id: string; origin: string }> };
export function previewVectorStoreDocument(data: { instanceId: string; assetType: VectorStoreDocumentRelation["asset_type"]; assetId: string }): Promise<VectorStoreImpactPreview> {
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(data.instanceId)}/documents/preflight`, { method: "POST", body: JSON.stringify({ asset_type: data.assetType, asset_id: data.assetId }) });
}
export function removeVectorStoreDocument(instanceId: string, relationId: string): Promise<void> { return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents/${encodeURIComponent(relationId)}`, { method: "DELETE" }); }
