import { createServerFn } from "@tanstack/react-start";

import { getServerConfig } from "../config.server";

// Wraps GET /health (backend/src/infrastructure/entrypoint/api/routers/health_router.py).
// Never throws — a down/unreachable API is a valid, expected UI state, not an error path.
export const checkApiHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { apiUrl } = getServerConfig();
  try {
    const res = await fetch(`${apiUrl}/health`);
    return { healthy: res.ok };
  } catch {
    return { healthy: false };
  }
});
