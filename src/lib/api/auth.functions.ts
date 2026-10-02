import { ACCESS_TOKEN_KEY, apiFetch } from "./client";

export type Role =
  | "manager"
  | "channel_manager"
  | "release_manager"
  | "data_analyst"
  | "fraud_analyst"
  | "ops_analyst";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  permissions: string[];
};

type LoginResponse = AuthUser & { access_token: string; token_type: "bearer"; expires_in: number };

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch("/api/v0/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(): Promise<AuthUser> {
  return apiFetch("/api/v0/auth/me");
}

// Revokes the current access token server-side, so a copy of it stops
// working before its exp.
export async function logoutSession(): Promise<void> {
  return apiFetch("/api/v0/auth/logout", { method: "POST" });
}

export function storeAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

// Unsaved work tied to whoever was signed in. Cleared on logout so the next
// person on a shared workstation doesn't inherit it. Pure UI preferences
// (active tab, hidden columns) are kept.
const USER_DRAFT_KEYS = [
  "aria.configuracion.editorState.v4",
  "aria.model-training.draft.v1",
  "aria.new-test-run.config-selection.v1",
];

export function clearUserDrafts() {
  USER_DRAFT_KEYS.forEach((key) => localStorage.removeItem(key));
}
