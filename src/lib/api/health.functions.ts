import { API_BASE } from "./client";

// Wraps GET /health (backend/src/infrastructure/entrypoint/api/routers/health_router.py).
// Never throws — a down/unreachable API is a valid, expected UI state, not an error path.
export async function checkApiHealth(): Promise<{ healthy: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return { healthy: res.ok };
  } catch {
    return { healthy: false };
  }
}
