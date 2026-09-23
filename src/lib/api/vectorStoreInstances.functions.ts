import { apiFetch } from "./client";

export type VectorStoreInstanceResponse = {
  id: string; version: number; name: string; description: string; created_at: string; created_by: string; updated_at: string | null; updated_by: string | null;
  // null until the first /promote call - see promoteVectorStoreInstance.
  // A search/tool-loop/analyst-playbook match only ever considers this
  // promoted generation, never the DynamoDB asset manifest above.
  promoted_version: number | null; promoted_at: string | null; promoted_by: string | null;
};
export type VectorStoreDocumentRelation = { relation_id: string; asset_type: "taxonomy" | "modus_operandi" | "yellow_flag" | "red_flag" | "similar_case"; asset_id: string; asset_version: number };

export function listVectorStoreInstances(): Promise<VectorStoreInstanceResponse[]> { return apiFetch("/api/v0/vector-store-instances"); }
export function createVectorStoreInstance(data: { name: string; description: string }): Promise<VectorStoreInstanceResponse> { return apiFetch("/api/v0/vector-store-instances", { method: "POST", body: JSON.stringify(data) }); }
// Loads this instance's current asset manifest into OpenSearch as a new
// generation, then deletes the previous one (no partial/in-place update -
// see the router's docstring). Nothing else in this UI can make a vector
// store usable by an agent's tool picker or an Analista playbook without
// this call having run at least once.
export function promoteVectorStoreInstance(instanceId: string): Promise<VectorStoreInstanceResponse> { return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/promote`, { method: "POST" }); }
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
