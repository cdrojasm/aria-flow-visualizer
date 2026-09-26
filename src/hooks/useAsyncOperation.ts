import { useQuery } from "@tanstack/react-query";

import { getAsyncOperation } from "@/lib/api/asyncOperations.functions";

const DONE = new Set(["SUCCEEDED", "FAILED"]);

export function useAsyncOperation(operationId: string | null) {
  return useQuery({
    queryKey: ["asyncOperation", operationId],
    queryFn: () => getAsyncOperation({ data: { id: operationId! } }),
    enabled: !!operationId,
    refetchInterval: (query) =>
      DONE.has(query.state.data?.status ?? "") ? false : 2000,
  });
}
