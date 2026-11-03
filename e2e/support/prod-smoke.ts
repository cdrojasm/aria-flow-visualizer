import { expect, type APIRequestContext, type APIResponse, type PlaywrightWorkerArgs } from "@playwright/test";

export const API = "/api/v0";
export const PREFIX = "SMOKE-";
export const RUN_ID = `${PREFIX}${Date.now().toString(36).toUpperCase()}`;
// Dataset names must be identifier-like, so they use a lowercase/underscore variant.
export const DS_PREFIX = "smoke_";
export const DS_RUN = `${DS_PREFIX}${Date.now().toString(36)}`;

export const flag = (name: string) => process.env[name] === "1";

export const creds = (key: string) => {
  const email = process.env[`E2E_${key}_EMAIL`];
  const password = process.env[`E2E_${key}_PASSWORD`];
  return email && password ? { email, password } : undefined;
};

/** First role (in order of preference) that has credentials configured. */
export const pick = (...keys: string[]) => keys.find((k) => creds(k));

export const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function ok<T = unknown>(response: APIResponse, label: string): Promise<T> {
  const body = await response.text();
  expect(response.status() < 300, `${label}: ${response.status()} ${body.slice(0, 600)}`).toBeTruthy();
  return (body ? JSON.parse(body) : undefined) as T;
}

export async function login(api: APIRequestContext, key: string): Promise<string> {
  const body = await ok<{ access_token: string }>(
    await api.post(`${API}/auth/login`, { data: creds(key)! }),
    `login ${key}`,
  );
  return body.access_token;
}

export async function poll<T>(
  label: string,
  fn: () => Promise<T | undefined>,
  { timeoutMs = 90_000, everyMs = 2_000 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timeout esperando: ${label}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

/** An authenticated API client that remembers cleanups and always runs them (LIFO). */
export class Session {
  private cleanups: Array<{ label: string; fn: () => Promise<void> }> = [];
  constructor(
    readonly api: APIRequestContext,
    readonly token: string,
    readonly role: string,
  ) {}

  static async open(playwright: PlaywrightWorkerArgs["playwright"], baseURL: string | undefined, role: string) {
    const api = await playwright.request.newContext({ baseURL });
    return new Session(api, await login(api, role), role);
  }

  get auth() {
    return bearer(this.token);
  }
  get = (path: string) => this.api.get(`${API}${path}`, this.auth);
  post = (path: string, data?: unknown) => this.api.post(`${API}${path}`, { ...this.auth, data });
  put = (path: string, data?: unknown) => this.api.put(`${API}${path}`, { ...this.auth, data });
  patch = (path: string, data?: unknown) => this.api.patch(`${API}${path}`, { ...this.auth, data });
  del = (path: string, data?: unknown) => this.api.delete(`${API}${path}`, { ...this.auth, data });

  json = async <T = unknown>(path: string, label = `GET ${path}`) => ok<T>(await this.get(path), label);

  /** Register a DELETE to run at the end; 404 counts as already gone. */
  deleteLater(label: string, path: string) {
    this.cleanups.push({
      label,
      fn: async () => {
        const r = await this.del(path);
        if (![200, 202, 204, 404].includes(r.status())) throw new Error(`${r.status()} ${await r.text()}`);
      },
    });
  }
  later(label: string, fn: () => Promise<void>) {
    this.cleanups.push({ label, fn });
  }

  /** Runs cleanups; throws one error listing what must be removed by hand. */
  async close() {
    const errors: string[] = [];
    for (const { label, fn } of this.cleanups.reverse()) {
      try {
        await fn();
      } catch (e) {
        errors.push(`${label}: ${String(e).slice(0, 300)}`);
      }
    }
    await this.api.dispose();
    if (errors.length) throw new Error(`LIMPIEZA INCOMPLETA (${this.role}), borrar a mano:\n${errors.join("\n")}`);
  }
}

/** Minimal valid feature-recipe definition (schema v1), reused by template/preview calls. */
export const FEATURE_CONFIG = { schema_version: 1, mappings: {}, recipes: [{ id: "amount", name: "amount_numeric", source: "current", path: "transaction.amount", output_type: "number", steps: [] }] };
