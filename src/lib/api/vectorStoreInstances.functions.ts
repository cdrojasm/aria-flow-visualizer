import { apiFetch } from "./client";

export type VectorStoreInstanceResponse = {
  id: string; version: number; name: string; description: string; created_at: string; created_by: string; updated_at: string | null; updated_by: string | null;
  latest_generation: number | null;
  production_generations: number[];
};
export type VectorStoreDocumentRelation = { relation_id: string; asset_type: "taxonomy" | "modus_operandi" | "yellow_flag" | "red_flag" | "similar_case"; asset_id: string; asset_version: number };
export type VectorStoreSearchPipeline = "embedding_heavy" | "balanced" | "keyword_heavy";
export type VectorStoreSearchDocumentType = "taxonomia" | "modus_operandi" | "similar_case" | "red_flag" | "yellow_flag";
export type VectorStoreSearchResult = {
  id: string;
  type: VectorStoreSearchDocumentType;
  text: string;
  score: number;
  vector_store_id: string;
  vector_store_version: number;
};

export function listVectorStoreInstances(): Promise<VectorStoreInstanceResponse[]> { return apiFetch("/api/v0/vector-store-instances"); }
export function createVectorStoreInstance(data: { name: string; description: string }): Promise<VectorStoreInstanceResponse> { return apiFetch("/api/v0/vector-store-instances", { method: "POST", body: JSON.stringify(data) }); }
export type VectorStoreGenerationResponse = {
  instance_id: string; generation: number;
  status: "building" | "ready" | "failed" | "retired";
  built_by: string; created_at: string; ready_at: string | null;
  retired_at: string | null; fingerprint: string; document_count: number;
  matches_manifest?: boolean | null;
  error: string | null; migrated: boolean; in_production: boolean; pinned_by: string[];
};
export function buildVectorStoreGeneration(instanceId: string): Promise<VectorStoreGenerationResponse & { built: boolean }> {
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/generations`, { method: "POST" });
}
export function listVectorStoreGenerations(instanceId: string): Promise<VectorStoreGenerationResponse[]> {
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/generations`);
}
export function listVectorStoreDocuments(instanceId: string): Promise<VectorStoreDocumentRelation[]> { return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`); }
export function queryVectorStoreInstance(input: {
  instanceId: string;
  query: string;
  documentType: VectorStoreSearchDocumentType;
  pipeline: VectorStoreSearchPipeline;
  topK?: number;
  generation?: number;
}): Promise<VectorStoreSearchResult[]> {
  const params = new URLSearchParams({
    query: input.query,
    document_type: input.documentType,
    pipeline: input.pipeline,
    top_k: String(input.topK ?? 5),
  });
  if (input.generation != null) params.set("generation", String(input.generation));
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(input.instanceId)}/query?${params}`);
}
export function addVectorStoreDocument(data: { instanceId: string; assetType: VectorStoreDocumentRelation["asset_type"]; assetId: string; assetVersion?: number }): Promise<VectorStoreDocumentRelation[]> {
  const { instanceId, assetType, assetId, assetVersion = 1 } = data;
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents`, { method: "POST", body: JSON.stringify({ asset_type: assetType, asset_id: assetId, asset_version: assetVersion }) });
}
export type VectorStoreImpactPreview = { instance_id: string; will_add: Array<{ asset_type: VectorStoreDocumentRelation["asset_type"]; asset_id: string; origin: string }> };
export function previewVectorStoreDocument(data: { instanceId: string; assetType: VectorStoreDocumentRelation["asset_type"]; assetId: string }): Promise<VectorStoreImpactPreview> {
  return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(data.instanceId)}/documents/preflight`, { method: "POST", body: JSON.stringify({ asset_type: data.assetType, asset_id: data.assetId }) });
}
export function removeVectorStoreDocument(instanceId: string, relationId: string): Promise<void> { return apiFetch(`/api/v0/vector-store-instances/${encodeURIComponent(instanceId)}/documents/${encodeURIComponent(relationId)}`, { method: "DELETE" }); }
