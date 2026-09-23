import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { VectorStoreVersion } from "@/data/vectorStoreVersions";
import {
  addVectorStoreDocument, createVectorStoreInstance, listVectorStoreDocuments,
  listVectorStoreInstances, removeVectorStoreDocument, type VectorStoreDocumentRelation,
  previewVectorStoreDocument, type VectorStoreInstanceResponse,
} from "@/lib/api/vectorStoreInstances.functions";

const QUERY_KEY = ["vectorStoreVersions"];
const documentsKey = (instanceId: string) => ["vectorStoreDocuments", instanceId];

function toVersion(response: VectorStoreInstanceResponse): VectorStoreVersion {
  return { id: response.id, version: response.version, name: response.name, description: response.description, createdAt: response.created_at, createdBy: response.created_by, updatedAt: response.updated_at, updatedBy: response.updated_by, documentKeys: [] };
}

export function useVectorStoreVersions() {
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: listVectorStoreInstances });
  const versions = (query.data ?? []).map(toVersion);
  return { versions, latest: versions.at(-1), query };
}

export function useVectorStoreDocuments(instanceId: string | undefined) {
  return useQuery({ queryKey: documentsKey(instanceId ?? ""), queryFn: () => listVectorStoreDocuments(instanceId!), enabled: !!instanceId });
}

export function useCreateVectorStoreVersion() {
  const queryClient = useQueryClient();
  return async (input: Pick<VectorStoreVersion, "name" | "description">) => {
    const created = await createVectorStoreInstance(input);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    return created.id;
  };
}

export function useAddVectorStoreDocument() {
  const queryClient = useQueryClient();
  return async (instanceId: string, assetType: VectorStoreDocumentRelation["asset_type"], assetId: string) => {
    await addVectorStoreDocument({ instanceId, assetType, assetId });
    await Promise.all([queryClient.invalidateQueries({ queryKey: documentsKey(instanceId) }), queryClient.invalidateQueries({ queryKey: QUERY_KEY })]);
  };
}

export function usePreviewVectorStoreDocument() {
  return (instanceId: string, assetType: VectorStoreDocumentRelation["asset_type"], assetId: string) =>
    previewVectorStoreDocument({ instanceId, assetType, assetId });
}

export function useRemoveVectorStoreDocument() {
  const queryClient = useQueryClient();
  return async (instanceId: string, relationId: string) => {
    await removeVectorStoreDocument(instanceId, relationId);
    await Promise.all([queryClient.invalidateQueries({ queryKey: documentsKey(instanceId) }), queryClient.invalidateQueries({ queryKey: QUERY_KEY })]);
  };
}
