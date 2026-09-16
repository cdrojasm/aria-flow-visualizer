import { useQuery, useQueryClient } from "@tanstack/react-query";

import { INITIAL_VECTOR_STORE_VERSIONS, type VectorStoreVersion } from "@/data/vectorStoreVersions";

const QUERY_KEY = ["vectorStoreVersions"];

// Same "no real backend yet" pattern as useVariableCatalog - single cached
// source of truth so the Biblioteca "Repositorio de Conocimiento" tab (which
// creates versions) and every agent's vector-store version <select> (which
// only reads them) stay in sync without prop-drilling.
export function useVectorStoreVersions() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => Promise.resolve(INITIAL_VECTOR_STORE_VERSIONS),
    staleTime: Infinity,
  });
  const versions = query.data ?? [];
  const latest = versions[versions.length - 1] as VectorStoreVersion | undefined;
  return { versions, latest, query };
}

export function useCreateVectorStoreVersion() {
  const queryClient = useQueryClient();
  return (label: string, snapshot: Omit<VectorStoreVersion, "id" | "label" | "createdAt">) => {
    queryClient.setQueryData<VectorStoreVersion[]>(
      QUERY_KEY,
      (prev = INITIAL_VECTOR_STORE_VERSIONS) => [
        ...prev,
        { id: `vsv-${Date.now()}`, label, createdAt: new Date().toISOString(), ...snapshot },
      ],
    );
  };
}
