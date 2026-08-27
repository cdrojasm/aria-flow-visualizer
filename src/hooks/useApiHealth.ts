import { useQuery } from "@tanstack/react-query";

import { checkApiHealth } from "@/lib/api/health.functions";

// healthy defaults true while the first check is in flight, to avoid a
// "down" flash on load; `checked` tells callers when that default no
// longer applies and the real status is known.
export function useApiHealth(intervalMs = 15000) {
  const { data, isFetched } = useQuery({
    queryKey: ["apiHealth"],
    queryFn: () => checkApiHealth(),
    refetchInterval: intervalMs,
    retry: false,
  });
  return { healthy: data?.healthy ?? true, checked: isFetched };
}
