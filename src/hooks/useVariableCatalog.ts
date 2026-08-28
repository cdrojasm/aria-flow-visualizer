import { useQuery } from "@tanstack/react-query";

import { listVariables } from "@/lib/api/variable.functions";

// Single source of truth for the variable pool - replaces the old hardcoded
// ALL_VARIABLES const (data/configs.ts). Shared by VariablePicker
// (shared/FormControls.tsx) and SegmentProfilingSection.tsx so both read
// from the same cached query instead of each fetching independently.
export function useVariableCatalog() {
  const query = useQuery({
    queryKey: ["variableCatalog"],
    queryFn: () => listVariables({ data: { activeOnly: true } }),
  });
  return { variables: (query.data ?? []).map((v) => v.value), query };
}
