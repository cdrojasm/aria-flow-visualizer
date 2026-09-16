import { apiFetch } from "./client";

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

export function storeAccessToken(token: string) {
  localStorage.setItem("aria.auth.accessToken", token);
}

export function clearAccessToken() {
  localStorage.removeItem("aria.auth.accessToken");
}
