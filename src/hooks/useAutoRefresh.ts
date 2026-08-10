import { useCallback, useEffect, useState } from "react";

export function useAutoRefresh(intervalMs = 15000) {
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const refresh = useCallback(() => setLastRefresh(new Date()), []);

  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, refresh]);

  return { lastRefresh, refresh };
}
