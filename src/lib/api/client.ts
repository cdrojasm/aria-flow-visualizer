// Client-side fetch to the backend API (../backend). Docker deploy: nginx
// proxies /api and /health to the api container, so a relative path
// resolves same-origin with no CORS involved. Override via VITE_API_URL
// (public, see .env - never put secrets there, they ship to the browser)
// for deploys where the API isn't reachable at the same origin (e.g.
// GitHub Pages).
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const ACCESS_TOKEN_KEY = "aria.auth.accessToken";

// Fired when the session ends without the user clicking "Cerrar sesión"
// (token expired or revoked -> the API answers 401). useRole listens to it
// so every mounted layout drops to /login at once.
export const SESSION_ENDED_EVENT = "aria:session-ended";

export function accessToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401 && token) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
  }
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
