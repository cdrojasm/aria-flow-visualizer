// Client-side fetch to the backend API (../backend). Docker deploy: nginx
// proxies /api and /health to the api container, so a relative path
// resolves same-origin with no CORS involved. Override via VITE_API_URL
// (public, see .env - never put secrets there, they ship to the browser)
// for deploys where the API isn't reachable at the same origin (e.g.
// GitHub Pages).
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
