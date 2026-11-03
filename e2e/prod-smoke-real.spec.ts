import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

/**
 * Smoke test for a deployed environment (OKD/prod) that we can only reach over HTTP.
 *
 * - Only uses the public URL (ARIA_E2E_BASE_URL) and per-role credentials. No docker,
 *   no DB access, no worker/CLI commands.
 * - Phase 1 (UI): every role with credentials logs in, sees its navigation, visits each
 *   allowed page and must not trigger 5xx/401 API calls or uncaught page errors.
 * - Phase 2 (API as a writer role): creates a chain of library objects + watchlist + tag
 *   + channel, reads them back, edits one, checks a read-only role is refused.
 * - Cleanup always runs (afterAll) and also sweeps leftovers from aborted runs by prefix.
 *   Everything created is named `SMOKE-<runId>`; nothing else is ever touched.
 *
 * Env: ARIA_E2E_BASE_URL, E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD for any of
 * MANAGER, CHANNEL_MANAGER, RELEASE_MANAGER, DATA_ANALYST, FRAUD_ANALYST, OPS_ANALYST,
 * FRAUD_REVIEWER. Roles without credentials are skipped.
 */

import { FEATURE_CONFIG } from "./support/prod-smoke";
test.setTimeout(180_000);

const PREFIX = "SMOKE-";
const RUN_ID = `${PREFIX}${Date.now().toString(36).toUpperCase()}`;
const API = "/api/v0";

type RoleCase = { key: string; label: string; allowedLinks: string[]; firstRoute: string };

// Keep aligned with auth-real.spec.ts / ROLE_NAV.
const ROLES: RoleCase[] = [
  { key: "MANAGER", label: "Manager", firstRoute: "/dashboard", allowedLinks: ["Dashboard", "En proceso", "Configuración", "Respaldos"] },
  { key: "CHANNEL_MANAGER", label: "Channel Manager", firstRoute: "/dashboard", allowedLinks: ["Dashboard", "Testing", "Biblioteca", "Configuración", "Modelos"] },
  { key: "RELEASE_MANAGER", label: "Release Manager", firstRoute: "/dashboard", allowedLinks: ["Dashboard", "En proceso", "Testing", "Configuración"] },
  { key: "DATA_ANALYST", label: "Data Analyst", firstRoute: "/monitor", allowedLinks: ["Monitor del Agente", "Testing", "Biblioteca", "Modelos"] },
  { key: "FRAUD_ANALYST", label: "Fraud Analyst", firstRoute: "/cola", allowedLinks: ["En proceso"] },
  { key: "OPS_ANALYST", label: "Ops Analyst", firstRoute: "/dashboard", allowedLinks: ["Dashboard", "En proceso", "Monitor del Agente"] },
  { key: "FRAUD_REVIEWER", label: "Fraud Reviewer", firstRoute: "/historico-fraude", allowedLinks: ["Histórico de Gestión de Fraude"] },
];

// Mirror of ROLE_PERMISSIONS (backend/src/application/ports/local_auth_port.py).
const PERMISSIONS: Record<string, string[]> = {
  MANAGER: ["dashboard", "in_progress", "fraud_history", "fraud_review", "monitor", "configuration", "library", "alert_schema"],
  RELEASE_MANAGER: ["dashboard", "in_progress", "fraud_history", "monitor", "configuration", "testing", "alert_schema"],
  CHANNEL_MANAGER: ["dashboard", "in_progress", "fraud_history", "monitor", "configuration", "testing", "library", "models"],
  DATA_ANALYST: ["monitor", "library", "testing", "models"],
  FRAUD_ANALYST: ["in_progress"],
  OPS_ANALYST: ["dashboard", "in_progress", "monitor"],
  FRAUD_REVIEWER: ["fraud_history", "fraud_review"],
};
const SWEEP_KEYS = ["MANAGER", "CHANNEL_MANAGER", "DATA_ANALYST"]; // can delete library objects

const creds = (key: string) => {
  const email = process.env[`E2E_${key}_EMAIL`];
  const password = process.env[`E2E_${key}_PASSWORD`];
  return email && password ? { email, password } : undefined;
};

const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

async function ok<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.status() === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function login(api: APIRequestContext, key: string): Promise<string> {
  const c = creds(key)!;
  const body = await ok<{ access_token: string }>(
    await api.post(`${API}/auth/login`, { data: c }),
    `login ${key}`,
  );
  return body.access_token;
}

// ---------------------------------------------------------------- health
test("SMOKE health: la app y la API responden por el mismo origen", async ({ request, page }) => {
  const health = await request.get("/health");
  expect(health.ok(), `/health ${health.status()}`).toBeTruthy();
  const response = await page.goto("/login");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByLabel("Correo")).toBeVisible();
  // Login rejects bad credentials with 401 (not 5xx).
  const bad = await request.post(`${API}/auth/login`, {
    data: { email: "smoke-nobody@example.com", password: "wrong-password-smoke" },
  });
  expect(bad.status()).toBe(401);
});

// ---------------------------------------------------------------- phase 1: UI per role
for (const role of ROLES) {
  test(`SMOKE UI ${role.key}: login, navegación y páginas sin errores`, async ({ page }) => {
    const c = creds(role.key);
    test.skip(!c, `Sin credenciales E2E_${role.key}_EMAIL/PASSWORD`);

    const apiProblems: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("response", (r) => {
      const url = r.url();
      if (url.includes("/api/") && (r.status() >= 500 || r.status() === 401)) {
        // 401 is expected only for the (not-yet-logged-in) login probe.
        if (!url.endsWith("/auth/login")) apiProblems.push(`${r.status()} ${r.request().method()} ${url}`);
      }
    });

    await page.goto("/login");
    await page.getByLabel("Correo").fill(c!.email);
    await page.getByLabel("Contraseña").fill(c!.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(new RegExp(`${role.firstRoute}$`), { timeout: 30_000 });
    await expect(page.getByText(role.label, { exact: true })).toBeVisible();

    // Visit each allowed page; hrefs are read from the sidebar so routes stay in sync.
    const hrefs: string[] = [];
    for (const label of role.allowedLinks) {
      const link = page.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      hrefs.push((await link.getAttribute("href"))!);
    }
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[/$]/g, "\\$&")}`));
      await expect(page.locator("aside").first()).toBeVisible();
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
      // A rendered route error boundary / crash screen is a failure.
      await expect(page.getByText(/something went wrong|Application error|Unexpected Application Error/i)).toHaveCount(0);
    }

    expect(pageErrors, `errores JS no capturados:\n${pageErrors.join("\n")}`).toEqual([]);
    expect(apiProblems, `llamadas API con 5xx/401:\n${apiProblems.join("\n")}`).toEqual([]);

    // A role must not reach pages outside its navigation.
    const restricted = role.key === "MANAGER" ? "/testing" : "/backups";
    await page.goto(restricted);
    await expect(page).toHaveURL(new RegExp(`(${role.firstRoute}|/login)(\\?.*)?$`));
  });
}

// ---------------------------------------------------------------- phase 2: actions per role
const day = 24 * 3600 * 1000;
const range = () => {
  const to = new Date();
  return `from=${encodeURIComponent(new Date(to.getTime() - 7 * day).toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
};
const dateRange = () => {
  const to = new Date();
  return `from_date=${new Date(to.getTime() - day).toISOString().slice(0, 10)}&to_date=${to.toISOString().slice(0, 10)}`;
};

// Read endpoints gated server-side by one permission: must be 2xx with it, 403 without it.
const GATED_READS: Array<{ permission: string; path: () => string }> = [
  { permission: "dashboard", path: () => `/metrics/overview?${range()}` },
  { permission: "monitor", path: () => `/metrics/agent?${range()}` },
  { permission: "monitor", path: () => `/audit-logs?${dateRange()}&limit=5` },
  { permission: "fraud_history", path: () => "/alerts/history" },
];
// Reads without a server gate, only meaningful (and asserted 2xx) for roles with the permission.
const OPEN_READS: Array<{ permission: string; path: string }> = [
  { permission: "in_progress", path: "/analyst-queue" },
  { permission: "in_progress", path: "/analyst-queue/in-process" },
  { permission: "configuration", path: "/configurations" },
  { permission: "configuration", path: "/configurations/active" },
  { permission: "testing", path: "/scenarios" },
  { permission: "testing", path: "/test-runs" },
  { permission: "models", path: "/models" },
  { permission: "models", path: "/models/feature-templates" },
  { permission: "library", path: "/library/taxonomies?active_only=false" },
  { permission: "library", path: "/library/modus-operandi" },
  { permission: "library", path: "/library/flags" },
  { permission: "library", path: "/library/similar-cases" },
  { permission: "library", path: "/library/channels" },
  { permission: "library", path: "/watchlists" },
  { permission: "library", path: "/tag-catalog?category=event_type" },
];

for (const role of ROLES) {
  test(`SMOKE API ${role.key}: acciones permitidas, denegadas y objetos de prueba`, async ({ playwright, baseURL }) => {
    test.skip(!creds(role.key), `Sin credenciales E2E_${role.key}_EMAIL/PASSWORD`);
    const perms = new Set(PERMISSIONS[role.key]);
    const api = await playwright.request.newContext({ baseURL });
    const cleanups: Array<() => Promise<void>> = [];
    const remove = (label: string, path: string, token: string) =>
      cleanups.push(async () => {
        const r = await api.delete(`${API}${path}`, bearer(token));
        if (![200, 204, 404].includes(r.status())) throw new Error(`${label} ${path}: ${r.status()} ${await r.text()}`);
      });
    try {
      const token = await login(api, role.key);
      const auth = bearer(token);
      const me = await ok<{ role: string }>(await api.get(`${API}/auth/me`, auth), "auth/me");
      expect(me.role).toBe(role.key.toLowerCase());

      // Allowed vs denied reads.
      for (const read of GATED_READS) {
        const r = await api.get(`${API}${read.path()}`, auth);
        if (perms.has(read.permission)) expect(r.status(), `${role.key} GET ${read.path()}: ${await r.text()}`).toBeLessThan(300);
        else expect(r.status(), `${role.key} sin '${read.permission}' debe recibir 403 en ${read.path()}`).toBe(403);
      }
      for (const read of OPEN_READS.filter((x) => perms.has(x.permission))) {
        const r = await api.get(`${API}${read.path}`, auth);
        expect(r.status(), `${role.key} GET ${read.path}: ${await r.text()}`).toBeLessThan(300);
      }

      // Library writes are server-gated: roles without 'library' must get 403.
      if (!perms.has("library")) {
        const denied = await api.post(`${API}/library/taxonomies`, {
          ...auth,
          data: { code: `${RUN_ID}-DENIED`.slice(0, 50), name: `${RUN_ID} denegada` },
        });
        expect(denied.status(), `${role.key} no debe poder crear taxonomías`).toBe(403);
      }

      // Library: full chain create -> read -> edit -> delete (taxonomy delete cascades).
      if (perms.has("library")) {
        const tag = `${RUN_ID}-${role.key}`;
        const taxonomy = await ok<{ id: string }>(
          await api.post(`${API}/library/taxonomies`, {
            ...auth,
            data: { code: tag.slice(0, 50), name: `${tag} taxonomía`, description: "Smoke test, se elimina.", examples: ["smoke"] },
          }),
          "crear taxonomía",
        );
        remove("taxonomía (cascada)", `/library/taxonomies/${taxonomy.id}`, token);
        const mo = await ok<{ id: string }>(
          await api.post(`${API}/library/modus-operandi`, {
            ...auth,
            data: { title: `${tag} modus operandi`, narrative: "Narrativa smoke.", taxonomy_library_id: taxonomy.id },
          }),
          "crear modus operandi",
        );
        await ok(
          await api.post(`${API}/library/similar-cases`, {
            ...auth,
            data: { text: `${tag} caso similar`, modus_operandi_library_id: mo.id, taxonomy_library_id: taxonomy.id },
          }),
          "crear caso similar",
        );
        await ok(
          await api.post(`${API}/library/flags`, {
            ...auth,
            data: { flag_type: "red", name: `${tag} flag`, description: "smoke", modus_operandi_library_ids: [mo.id] },
          }),
          "crear flag",
        );
        const taxonomies = await ok<Array<{ id: string }>>(await api.get(`${API}/library/taxonomies?active_only=false`, auth), "listar taxonomías");
        expect(taxonomies.some((t) => t.id === taxonomy.id)).toBeTruthy();
        const mos = await ok<Array<{ id: string }>>(await api.get(`${API}/library/modus-operandi`, auth), "listar MO");
        expect(mos.some((m) => m.id === mo.id)).toBeTruthy();
        const edited = await ok<{ name: string }>(
          await api.patch(`${API}/library/taxonomies/${taxonomy.id}`, { ...auth, data: { name: `${tag} taxonomía editada` } }),
          "editar taxonomía",
        );
        expect(edited.name).toBe(`${tag} taxonomía editada`);

        const watchlist = await ok<{ id: string }>(
          await api.post(`${API}/watchlists`, {
            ...auth,
            data: { name: `${tag} lista`, description: "smoke", list_type: "blacklist", elements: ["smoke-1", "smoke-2"] },
          }),
          "crear watchlist",
        );
        remove("watchlist", `/watchlists/${watchlist.id}`, token);
        await ok(await api.get(`${API}/watchlists/${watchlist.id}`, auth), "leer watchlist");

        const tagEntry = await ok<{ id: string; category: string }>(
          await api.post(`${API}/tag-catalog`, { ...auth, data: { category: "event_type", value: `${tag} tag` } }),
          "crear tag",
        );
        remove("tag", `/tag-catalog/${tagEntry.category}/${tagEntry.id}`, token);
        const channel = await ok<{ id: string }>(
          await api.post(`${API}/library/channels`, { ...auth, data: { code: tag.slice(0, 50), name: `${tag} canal`, description: "smoke" } }),
          "crear canal",
        );
        remove("canal", `/library/channels/${channel.id}`, token);
      }

      // Testing: scenario created but never started (no traffic), edited, then deleted.
      if (perms.has("testing")) {
        const scenario = await ok<{ id: string; name: string }>(
          await api.post(`${API}/scenarios`, {
            ...auth,
            data: {
              name: `${RUN_ID}-${role.key} escenario`,
              output_mode: "LIVE_PIPELINE",
              rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 60, events_per_minute: 1 }],
              field_specs: { smoke_field: { kind: "CONSTANT", value: "smoke" } },
            },
          }),
          "crear escenario",
        );
        remove("escenario", `/scenarios/${scenario.id}`, token);
        await ok(await api.get(`${API}/scenarios/${scenario.id}`, auth), "leer escenario");
        await ok(
          await api.put(`${API}/scenarios/${scenario.id}`, { ...auth, data: { name: `${RUN_ID}-${role.key} escenario editado` } }),
          "editar escenario",
        );
      }

      // Models: a feature template (metadata only; no training is launched).
      if (perms.has("models")) {
        const template = await ok<{ id: string }>(
          await api.post(`${API}/models/feature-templates`, {
            ...auth,
            data: { name: `${RUN_ID}-${role.key} plantilla`, description: "smoke", configuration: FEATURE_CONFIG },
          }),
          "crear plantilla de features",
        );
        remove("plantilla", `/models/feature-templates/${template.id}`, token);
      }

      // Fraud analyst: take -> release of a queued alert changes a real alert's reservation
      // for a moment, so it is opt-in (E2E_ALLOW_TAKE_RELEASE=1).
      if (role.key === "FRAUD_ANALYST" && process.env.E2E_ALLOW_TAKE_RELEASE === "1") {
        const queue = await ok<Array<{ alert_id: string }>>(await api.get(`${API}/analyst-queue`, auth), "cola");
        if (queue.length) {
          const id = queue[0].alert_id;
          await ok(await api.get(`${API}/analyst-queue/${id}`, auth), "detalle de alerta");
          await ok(await api.post(`${API}/analyst-queue/${id}/take`, auth), "tomar alerta");
          cleanups.push(async () => {
            await ok(await api.post(`${API}/analyst-queue/${id}/release`, auth), "liberar alerta");
          });
        }
      }

      // Fraud reviewer / manager: read an alert's fraud-review history (no label is changed).
      if (perms.has("fraud_review") && perms.has("fraud_history")) {
        const page = await ok<{ items?: Array<{ id?: string; alert_id?: string }> }>(await api.get(`${API}/alerts/history`, auth), "historial");
        const first = page.items?.[0];
        const id = first?.id ?? first?.alert_id;
        if (id) await ok(await api.get(`${API}/alerts/${id}/fraud-reviews`, auth), "revisiones de fraude");
      }

      // Logout invalidates nothing else but must succeed.
      // unshift: cleanups run in reverse, so logout must be the LAST one (it invalidates the token).
      cleanups.unshift(async () => {
        const r = await api.post(`${API}/auth/logout`, auth);
        if (r.status() !== 204) throw new Error(`logout ${role.key}: ${r.status()}`);
      });
    } finally {
      const errors: string[] = [];
      for (const fn of cleanups.reverse()) {
        try {
          await fn();
        } catch (e) {
          errors.push(String(e));
        }
      }
      await api.dispose();
      if (errors.length) throw new Error(`LIMPIEZA INCOMPLETA ${RUN_ID}-${role.key}, borrar a mano:\n${errors.join("\n")}`);
    }
  });
}

test("SMOKE UI: lo creado por un rol de biblioteca se ve en Biblioteca", async ({ playwright, baseURL, page }) => {
  const key = ["CHANNEL_MANAGER", "DATA_ANALYST"].find((k) => creds(k));
  test.skip(!key, "Sin rol con acceso UI a Biblioteca");
  const api = await playwright.request.newContext({ baseURL });
  const token = await login(api, key!);
  const name = `${RUN_ID}-UI taxonomía`;
  const taxonomy = await ok<{ id: string }>(
    await api.post(`${API}/library/taxonomies`, { ...bearer(token), data: { code: `${RUN_ID}-UI`.slice(0, 50), name, description: "smoke UI" } }),
    "crear taxonomía UI",
  );
  try {
    const c = creds(key!)!;
    await page.goto("/login");
    await page.getByLabel("Correo").fill(c.email);
    await page.getByLabel("Contraseña").fill(c.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.getByRole("link", { name: "Biblioteca", exact: true }).click();
    await expect(page).toHaveURL(/biblioteca/);
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await api.delete(`${API}/library/taxonomies/${taxonomy.id}`, bearer(token));
    await api.dispose();
  }
});

// ---------------------------------------------------------------- sweep
// Removes anything left by earlier aborted runs. Only names starting with SMOKE- are touched.
test.afterAll(async ({ playwright, baseURL }) => {
  const key = SWEEP_KEYS.find((k) => creds(k));
  if (!key) return;
  const api = await playwright.request.newContext({ baseURL });
  const errors: string[] = [];
  try {
    const auth = bearer(await login(api, key));
    const sweep = async (label: string, listPath: string, field: string, delPath: (x: Record<string, string>) => string) => {
      try {
        const r = await api.get(`${API}${listPath}`, auth);
        if (!r.ok()) return;
        for (const item of (await r.json()) as Array<Record<string, string>>) {
          if (String(item[field] ?? "").startsWith(PREFIX)) await api.delete(`${API}${delPath(item)}`, auth);
        }
      } catch (e) {
        errors.push(`${label}: ${String(e)}`);
      }
    };
    await sweep("taxonomías", "/library/taxonomies?active_only=false", "name", (x) => `/library/taxonomies/${x.id}`);
    await sweep("canales", "/library/channels", "name", (x) => `/library/channels/${x.id}`);
    await sweep("watchlists", "/watchlists", "name", (x) => `/watchlists/${x.id}`);
    await sweep("tags", "/tag-catalog?category=event_type", "value", (x) => `/tag-catalog/event_type/${x.id}`);
    await sweep("escenarios", "/scenarios", "name", (x) => `/scenarios/${x.id}`);
    await sweep("plantillas", "/models/feature-templates", "name", (x) => `/models/feature-templates/${x.id}`);

    // Final check: no SMOKE-<runId> taxonomy remains.
    const left = await api.get(`${API}/library/taxonomies?active_only=false`, auth);
    if (left.ok()) {
      const names = ((await left.json()) as Array<{ name: string }>).filter((x) => x.name.startsWith(RUN_ID));
      if (names.length) errors.push(`taxonomías restantes: ${names.map((n) => n.name).join(", ")}`);
    }
  } finally {
    await api.dispose();
  }
  if (errors.length) throw new Error(`BARRIDO INCOMPLETO, revisar a mano objetos ${PREFIX}*:\n${errors.join("\n")}`);
});
