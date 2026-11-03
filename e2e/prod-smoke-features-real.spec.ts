import { expect, test, type Page, type PlaywrightWorkerArgs } from "@playwright/test";
import { API, DS_PREFIX, FEATURE_CONFIG, DS_RUN, PREFIX, RUN_ID, Session, creds, flag, login, ok, pick, poll } from "./support/prod-smoke";

/**
 * Feature coverage of a deployed environment, on top of prod-smoke-real.spec.ts (roles/library).
 * HTTP only; every created object is named with the SMOKE- (or smoke_) prefix and removed at the end.
 *
 * Costly or irreversible actions are opt-in (they never run by default):
 *   E2E_SKIP_LLM=1               skip assistant chat/drafts (consume LLM)
 *   E2E_ALLOW_OPTIMIZER_RUN=1    start (not just create/cancel) an optimizer session
 *   E2E_ALLOW_TRAINING=1         create, train, score and delete a small model
 *   E2E_ALLOW_RESIDUE=1          create a vector-store instance + generation (cannot be deleted by API)
 *   E2E_ALLOW_SETTINGS_WRITE=1   write operational settings back with identical values
 *   E2E_ALLOW_BACKUP=1           create a backup (cannot be deleted by API)
 */
test.setTimeout(240_000);

const ADMINS = ["CHANNEL_MANAGER", "MANAGER", "DATA_ANALYST"]; // library + config writers
const BUILDERS = ["CHANNEL_MANAGER", "DATA_ANALYST", "RELEASE_MANAGER"]; // testing permission
const ALL_ROLES = ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER", "DATA_ANALYST", "OPS_ANALYST", "FRAUD_ANALYST", "FRAUD_REVIEWER"];

async function withSession(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string | undefined,
  roles: string[],
  body: (s: Session) => Promise<void>,
) {
  const role = pick(...roles);
  test.skip(!role, `Sin credenciales para ninguno de: ${roles.join(", ")}`);
  const s = await Session.open(playwright, baseURL, role!);
  let failed = false;
  try {
    await body(s);
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    try {
      await s.close();
    } catch (e) {
      if (!failed) throw e;
      console.error(String(e));
    }
  }
}

/** Only MANAGER / RELEASE_MANAGER may read these settings; undefined when we have neither. */
async function assistantSettings(playwright: PlaywrightWorkerArgs["playwright"], baseURL: string | undefined) {
  const role = pick("MANAGER", "RELEASE_MANAGER");
  if (!role) return undefined;
  const s = await Session.open(playwright, baseURL, role);
  try {
    return await s.json<Record<string, unknown>>("/assistant-optimizer-settings");
  } finally {
    await s.api.dispose();
  }
}

async function uiLogin(page: Page, role: string) {
  const c = creds(role)!;
  await page.goto("/login");
  await page.getByLabel("Correo").fill(c.email);
  await page.getByLabel("Contraseña").fill(c.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

// ------------------------------------------------------------------ catalogs
test("FEATURE catálogos: marcación, método de resolución, variables y tags (crear/editar/borrar)", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const cases: Array<{ name: string; path: string; create: object; list: string }> = [
      { name: "marcación", path: "/marcacion-catalog", create: { value: `${RUN_ID} marcación`, risk_label: "risk-suspected" }, list: "/marcacion-catalog?active_only=false" },
      { name: "método de resolución", path: "/resolution-method-catalog", create: { value: `${RUN_ID} método`, resolution_tag: "handle_by_aria" }, list: "/resolution-method-catalog?active_only=false" },
      { name: "variable", path: "/variable-catalog", create: { value: `${RUN_ID} variable`, description: "smoke" }, list: "/variable-catalog?active_only=false" },
    ];
    for (const c of cases) {
      const entry = await ok<{ id: string }>(await s.post(c.path, c.create), `crear ${c.name}`);
      s.deleteLater(c.name, `${c.path}/${entry.id}`);
      const list = await s.json<Array<{ id: string }>>(c.list);
      expect(list.some((x) => x.id === entry.id), `${c.name} listado`).toBeTruthy();
      await ok(await s.patch(`${c.path}/${entry.id}`, { value: `${RUN_ID} ${c.name} editado` }), `editar ${c.name}`);
    }
    for (const category of ["integration_point", "triggered_rule", "event_type"]) {
      const tag = await ok<{ id: string }>(await s.post("/tag-catalog", { category, value: `${RUN_ID} ${category}` }), `crear tag ${category}`);
      s.deleteLater(`tag ${category}`, `/tag-catalog/${category}/${tag.id}`);
      const list = await s.json<Array<{ id: string }>>(`/tag-catalog?category=${category}`);
      expect(list.some((x) => x.id === tag.id)).toBeTruthy();
      await ok(await s.patch(`/tag-catalog/${category}/${tag.id}`, { value: `${RUN_ID} ${category} editado` }), `editar tag ${category}`);
    }
  });
});

// ------------------------------------------------------------------ watchlist elements
test("FEATURE watchlists: elementos, membresía y borrado", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const wl = await ok<{ id: string }>(
      await s.post("/watchlists", { name: `${RUN_ID} elementos`, description: "smoke", list_type: "blacklist", elements: [] }),
      "crear watchlist",
    );
    s.deleteLater("watchlist", `/watchlists/${wl.id}`);
    await ok(await s.post(`/watchlists/${wl.id}/elements`, { values: ["smoke-a", "smoke-b", "smoke-c"] }), "agregar elementos");
    const page = await s.json<{ items?: unknown[]; elements?: unknown[] }>(`/watchlists/${wl.id}/elements?limit=10`);
    expect(JSON.stringify(page)).toContain("smoke-a");
    const member = await ok<unknown>(await s.post("/watchlists/check-membership", { list_type: "blacklist", value: "smoke-a" }), "membresía");
    expect(member).toBeTruthy();
    await ok(await s.patch(`/watchlists/${wl.id}`, { active: false }), "desactivar watchlist");
    await ok(await s.del(`/watchlists/${wl.id}/elements`, { values: ["smoke-b"] }), "quitar elemento");
    const after = await s.json<unknown>(`/watchlists/${wl.id}/elements?limit=10`);
    expect(JSON.stringify(after)).not.toContain("smoke-b");
  });
});

// ------------------------------------------------------------------ datasets + scenarios
test("FEATURE datasets y escenarios: dataset vacío, filas, análisis, splits, simulación a dataset", async ({ playwright, baseURL, page }) => {
  await withSession(playwright, baseURL, BUILDERS, async (s) => {
    const name = `${DS_RUN}_ds`;
    const target = `${DS_RUN}_sim`;
    for (const ds of [name, target]) {
      await ok(await s.post("/datasets/empty", { name: ds, fields: ["event_id", "amount", "label"] }), `crear dataset ${ds}`);
      s.deleteLater(`dataset ${ds}`, `/datasets/${encodeURIComponent(ds)}`);
    }
    const ready = async (ds: string) =>
      poll(`dataset ${ds} READY`, async () => {
        const sum = await s.json<{ status: string; error?: string }>(`/datasets/${encodeURIComponent(ds)}/summary`);
        if (sum.status === "FAILED") throw new Error(`dataset ${ds} FAILED: ${sum.error}`);
        return sum.status === "READY" ? sum : undefined;
      });
    await ready(name);
    await ready(target);

    const rows = Array.from({ length: 20 }, (_, i) => ({ event_id: `smoke-${i}`, amount: String(10 + i), label: i % 5 === 0 ? "fraud" : "no_fraud" }));
    await ok(await s.post(`/datasets/${name}/rows`, { rows }), "agregar filas");
    const summary = await poll("filas contadas", async () => {
      const sm = await s.json<{ total_rows: number; status: string }>(`/datasets/${name}/summary`);
      return sm.status === "READY" && sm.total_rows >= 20 ? sm : undefined;
    });
    expect(summary.total_rows).toBe(20);
    const listed = await s.json<unknown>(`/datasets/${name}/rows?offset=0&limit=5`);
    expect(JSON.stringify(listed)).toContain("smoke-");
    expect((await s.get(`/datasets/${name}/template`)).status()).toBeLessThan(300);
    expect((await s.get("/datasets")).status()).toBeLessThan(300);
    expect([200, 202]).toContain((await s.post(`/datasets/${name}/analyze`)).status());
    await ok(await s.post(`/datasets/${name}/splits/preview`, { proportions: { training: 0.6, validation: 0.1, calibration: 0.1, test: 0.2 }, seed: 7 }), "previsualizar splits");
    expect([200, 404]).toContain((await s.get(`/datasets/${name}/alert-field-mapping`)).status());
    expect((await s.get("/async-operations")).status()).toBeLessThan(300);

    // Scenario that writes synthetic rows into a dataset of ours (no pipeline traffic).
    const scenario = await ok<{ id: string }>(
      await s.post("/scenarios", {
        name: `${RUN_ID} simulación`,
        output_mode: "DATASET",
        target_dataset_name: target,
        rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 120, events_per_minute: 120 }],
        field_specs: { event_id: { kind: "CONSTANT", value: "smoke-sim" }, amount: { kind: "UNIFORM", params: { low: 1, high: 100 } }, label: { kind: "CATEGORICAL", weights: { fraud: 1, no_fraud: 9 } } },
      }),
      "crear escenario",
    );
    s.deleteLater("escenario", `/scenarios/${scenario.id}`);
    s.later("detener escenario", async () => {
      await s.post(`/scenarios/${scenario.id}/stop`);
    });
    const preview = await ok<unknown[]>(await s.post(`/scenarios/${scenario.id}/preview?count=3`), "previsualizar escenario");
    expect(preview.length).toBeGreaterThan(0);

    await ok(await s.post(`/scenarios/${scenario.id}/start`), "iniciar escenario");
    await poll("eventos emitidos", async () => {
      const st = await s.json<{ status: string; events_emitted: number; error?: string }>(`/scenarios/${scenario.id}/status`);
      if (st.status === "FAILED") throw new Error(`escenario FAILED: ${st.error}`);
      return st.events_emitted > 0 ? st : undefined;
    }, { timeoutMs: 120_000, everyMs: 5_000 });
    await ok(await s.post(`/scenarios/${scenario.id}/pause`), "pausar escenario");
    await ok(await s.post(`/scenarios/${scenario.id}/stop`), "detener escenario");
    const simSummary = await s.json<{ total_rows: number }>(`/datasets/${target}/summary`);
    expect(simSummary.total_rows).toBeGreaterThan(0);

    // UI: the scenario detail and the testing home render without crashing.
    await uiLogin(page, s.role);
    for (const path of ["/testing", `/testing/scenarios/${scenario.id}`]) {
      await page.goto(path);
      await expect(page.locator("aside").first()).toBeVisible();
      await expect(page.getByText(/Unexpected Application Error|Application error/i)).toHaveCount(0);
    }
  });
});

// ------------------------------------------------------------------ models
test("FEATURE modelos: lecturas, plantillas y (opt-in) entrenar/puntuar/borrar", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ["CHANNEL_MANAGER", "DATA_ANALYST"], async (s) => {
    for (const p of ["/models", "/models/feature-templates", "/models/features/operations"]) {
      expect((await s.get(p)).status(), p).toBeLessThan(300);
    }
    const t = await ok<{ id: string }>(await s.post("/models/feature-templates", { name: `${RUN_ID} plantilla`, description: "smoke", configuration: FEATURE_CONFIG }), "crear plantilla");
    s.deleteLater("plantilla", `/models/feature-templates/${t.id}`);
    const templates = await s.json<Array<{ id: string }>>("/models/feature-templates");
    expect(templates.some((x) => x.id === t.id)).toBeTruthy();

    if (!flag("E2E_ALLOW_TRAINING")) return;
    const ds = `${DS_RUN}_model`;
    await ok(await s.post("/datasets/empty", { name: ds, fields: ["x1", "x2", "label"] }), "dataset de entrenamiento");
    s.deleteLater("dataset modelo", `/datasets/${ds}`);
    await poll("dataset READY", async () => ((await s.json<{ status: string }>(`/datasets/${ds}/summary`)).status === "READY" ? true : undefined));
    const rows = Array.from({ length: 200 }, (_, i) => ({ x1: String(i % 17), x2: String((i * 7) % 13), label: i % 4 === 0 ? "fraud" : "no_fraud" }));
    await ok(await s.post(`/datasets/${ds}/rows`, { rows }), "filas de entrenamiento");
    const model = await ok<{ id: string }>(
      await s.post("/models", {
        tag: `${RUN_ID}-model`.toLowerCase(),
        description: "smoke",
        dataset_name: ds,
        target_field: "label",
        positive_labels: ["fraud"],
        feature_transforms: [{ field: "x1", kind: "numeric" }, { field: "x2", kind: "numeric" }],
        training_config: { n_estimators: 5, max_depth: 2, split_strategy: "stratified" },
      }),
      "crear modelo",
    );
    s.deleteLater("modelo", `/models/${model.id}`);
    await ok(await s.post(`/models/${model.id}/train`), "entrenar");
    await poll("modelo READY", async () => {
      const m = await s.json<{ status: string; error?: string }>(`/models/${model.id}`);
      if (m.status === "FAILED") throw new Error(`modelo FAILED: ${m.error}`);
      return m.status === "READY" ? m : undefined;
    }, { timeoutMs: 200_000, everyMs: 5_000 });
    await ok(await s.post(`/models/${model.id}/score`, { row: { x1: "3", x2: "5" } }), "puntuar");
    // Never activate: that would change what production scores with.
  });
});

// ------------------------------------------------------------------ vector stores
test("FEATURE vector stores: lectura, búsqueda y (opt-in) instancia nueva", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const instances = await s.json<Array<{ id: string; latest_generation: number | null }>>("/vector-store-instances");
    expect((await s.get("/vector-store-instances/documents/search?query=smoke")).status()).toBeLessThan(300);
    const existing = instances.find((i) => i.latest_generation !== null) ?? instances[0];
    if (existing) {
      const docs = await s.json<Array<{ asset_type: string; asset_id: string }>>(`/vector-store-instances/${existing.id}/documents`);
      expect((await s.get(`/vector-store-instances/${existing.id}/generations`)).status()).toBeLessThan(300);
      if (existing.latest_generation !== null) {
        const q = await s.get(`/vector-store-instances/${existing.id}/query?query=transferencia&document_type=modus_operandi&pipeline=balanced&top_k=3`);
        expect(q.status(), await q.text()).toBeLessThan(300);
      }
      if (docs.length) {
        const d = docs[0];
        await ok(await s.post(`/vector-store-instances/${existing.id}/documents/preflight`, { asset_type: d.asset_type, asset_id: d.asset_id }), "preflight");
      }
    }
    if (!flag("E2E_ALLOW_RESIDUE")) return;
    // The API has no instance delete: this leaves one SMOKE- instance behind (documented).
    const inst = await ok<{ id: string }>(await s.post("/vector-store-instances", { name: `${RUN_ID} instancia`, description: "smoke, borrar manualmente" }), "crear instancia");
    await ok(await s.patch(`/vector-store-instances/${inst.id}`, { description: "smoke editada" }), "editar instancia");
    // A generation needs at least one asset: attach a throwaway taxonomy (deleted afterwards).
    const tax = await ok<{ id: string }>(
      await s.post("/library/taxonomies", { code: `${RUN_ID}-VS`.slice(0, 50), name: `${RUN_ID} taxonomía vector`, description: "smoke" }),
      "taxonomía para vector store",
    );
    s.deleteLater("taxonomía vector store", `/library/taxonomies/${tax.id}`);
    await ok(await s.post(`/vector-store-instances/${inst.id}/documents`, { asset_type: "taxonomy", asset_id: tax.id }), "agregar documento");
    const attached = await s.json<Array<{ relation_id: string; asset_id: string }>>(`/vector-store-instances/${inst.id}/documents`);
    const rel = attached.filter((d) => d.asset_id === tax.id);
    expect(rel.length, "el documento quedó asociado a la instancia").toBeGreaterThan(0);
    const built = await ok<{ generation: number }>(await s.post(`/vector-store-instances/${inst.id}/generations`), "construir generación");
    expect(built.generation).toBeGreaterThan(0);
    const hits = await s.get(`/vector-store-instances/${inst.id}/query?query=smoke&document_type=taxonomia&pipeline=keyword_heavy&top_k=3`);
    expect(hits.status(), await hits.text()).toBeLessThan(300);
    await ok(await s.del(`/vector-store-instances/${inst.id}/documents/${rel[0].relation_id}`), "quitar documento");
  });
});

// ------------------------------------------------------------------ assistant (chat + drafts)
test("FEATURE asistente: sesión, chat, borradores de taxonomía y canal con aprobación", async ({ playwright, baseURL }) => {
  test.skip(flag("E2E_SKIP_LLM"), "E2E_SKIP_LLM=1");
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const settings = await assistantSettings(playwright, baseURL);
    test.skip(settings?.assistant_enabled === false, "El asistente está deshabilitado en este entorno");

    const session = await ok<{ session_id: string }>(await s.post("/agent/sessions", { mode: "assistant", scope: ["library"] }), "crear sesión asistente");
    s.later("cancelar sesión asistente", async () => {
      await s.post(`/agent/sessions/${session.session_id}/cancel`);
    });
    const base = `/agent/sessions/${session.session_id}`;
    expect((await s.get("/agent/draft-actions")).status()).toBeLessThan(300);

    const send = async (content: string) => {
      const id = crypto.randomUUID();
      const turn = await ok<{ assistant_message: { content: string } }>(await s.post(`${base}/messages`, { client_message_id: id, content, page_path: "/biblioteca" }), "enviar mensaje");
      expect(turn.assistant_message.content.length).toBeGreaterThan(0);
      return id;
    };

    const code = `${RUN_ID}-A`.slice(0, 40);
    const id1 = await send(`Crea una taxonomía nueva con code exacto ${code}, name exacto ${RUN_ID} asistente y description: prueba automatizada de humo.`);
    const draft = await ok<{ package_id: string; content: { items: Array<Record<string, string>> }; verifications: Array<{ status: string }> }>(
      await s.post(`${base}/taxonomy-drafts`, { client_message_id: id1, operation: "create" }),
      "borrador de taxonomía",
    );
    expect(draft.verifications.every((v) => v.status === "PASS")).toBeTruthy();
    const item = draft.content.items[0];
    const confirmed = await ok<{ entity_id: string }>(
      await s.post(`${base}/taxonomy-drafts/${draft.package_id}/confirm`, { item_id: item.item_id ?? item.id }),
      "confirmar taxonomía",
    );
    s.deleteLater("taxonomía del asistente", `/library/taxonomies/${confirmed.entity_id}`);
    const taxonomies = await s.json<Array<{ id: string }>>("/library/taxonomies?active_only=false");
    expect(taxonomies.some((t) => t.id === confirmed.entity_id)).toBeTruthy();

    const chCode = `${RUN_ID}-C`.slice(0, 40);
    const id2 = await send(`Crea un canal de negocio nuevo con code exacto ${chCode}, name exacto ${RUN_ID} canal asistente y description: prueba de humo.`);
    const chDraft = await ok<{ package_id: string; content: { items: Array<Record<string, string>> } }>(
      await s.post(`${base}/resource-drafts`, { client_message_id: id2, resource: "channel" }),
      "borrador de canal",
    );
    const chItem = chDraft.content.items[0];
    const chConfirmed = await ok<{ entity_id: string }>(
      await s.post(`${base}/resource-drafts/${chDraft.package_id}/confirm`, { item_id: chItem.item_id ?? chItem.id }),
      "confirmar canal",
    );
    s.deleteLater("canal del asistente", `/library/channels/${chConfirmed.entity_id}`);

    const messages = await s.json<unknown[]>(`${base}/messages`);
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });
});

test("FEATURE asistente UI: el botón abre el chat", async ({ playwright, baseURL, page }) => {
  const role = pick(...ADMINS);
  test.skip(!role || flag("E2E_SKIP_LLM"), "Sin rol o E2E_SKIP_LLM=1");
  const settings = await assistantSettings(playwright, baseURL);
  test.skip(settings?.assistant_enabled === false, "Asistente deshabilitado");
  await uiLogin(page, role!);
  await page.goto("/biblioteca");
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  await expect(page.getByLabel("Mensaje para ARIA")).toBeVisible();
});

// ------------------------------------------------------------------ optimizer
test("FEATURE optimizador: estado, límites, catálogo, objetivos, sesión crear/leer/cancelar", async ({ playwright, baseURL, page }) => {
  await withSession(playwright, baseURL, ["CHANNEL_MANAGER", "MANAGER"], async (s) => {
    for (const p of [
      "/agent/optimizer-status", "/agent/optimizer-launch-limits", "/agent/failure-catalog", "/agent/memory",
      "/agent/objectives", "/agent/objectives/active", "/agent/sessions?limit=5",
    ]) {
      const r = await s.get(p);
      expect([200, 404], `${p}: ${r.status()} ${await r.text()}`).toContain(r.status());
    }
    const session = await ok<{ session_id: string; status: string }>(
      await s.post("/agent/sessions", { mode: "optimization", scope: ["configuration"] }),
      "crear sesión de optimización",
    );
    s.later("cancelar sesión de optimización", async () => {
      const r = await s.post(`/agent/sessions/${session.session_id}/cancel`);
      if (r.status() >= 500) throw new Error(`cancel ${r.status()}`);
    });
    const base = `/agent/sessions/${session.session_id}`;
    for (const sub of ["", "/overview", "/events", "/findings", "/hypotheses", "/iterations", "/experiments", "/packages", "/budget", "/summary", "/audit", "/insights", "/messages", "/confirmations"]) {
      const r = await s.get(`${base}${sub}`);
      expect(r.status(), `GET ${base}${sub}: ${await r.text()}`).toBeLessThan(300);
    }
    if (flag("E2E_ALLOW_OPTIMIZER_RUN")) {
      await ok(await s.post(`${base}/start`), "iniciar optimización");
      await ok(await s.post(`${base}/pause`), "pausar optimización");
    }
    await ok(await s.post(`${base}/cancel`), "cancelar optimización");

    // UI: the optimizer lives in Configuración for the Channel Manager.
    if (s.role === "CHANNEL_MANAGER") {
      const monitor = await page.context().newPage();
      await uiLogin(monitor, s.role);
      await monitor.goto("/configuracion");
      await expect(monitor.getByText(/Unexpected Application Error|Application error/i)).toHaveCount(0);
      await monitor.close();
    }
  });
});

// ------------------------------------------------------------------ platform reads
const READS: Array<{ path: () => string; roles: string[] }> = [
  { path: () => "/metrics/live", roles: ["MANAGER", "OPS_ANALYST", "CHANNEL_MANAGER"] },
  { path: () => "/metrics/technical", roles: ["MANAGER", "OPS_ANALYST", "DATA_ANALYST"] },
  { path: () => "/metrics/version-events", roles: ["MANAGER", "OPS_ANALYST", "DATA_ANALYST"] },
  { path: () => "/operations/capacity", roles: ALL_ROLES },
  { path: () => "/async-operations", roles: ALL_ROLES },
  { path: () => "/configurations", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/configurations/active", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/configurations/graph", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/configuration-deploy-requests", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/operational-settings", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/operational-settings/history", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/assistant-optimizer-settings", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/assistant-optimizer-settings/changes", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/assistant-optimizer-settings/sampler/fields", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/assistant-optimizer-settings/sampler/schema-configuration", roles: ["MANAGER", "CHANNEL_MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/backups", roles: ["MANAGER"] },
  { path: () => "/agent/releases", roles: ["MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/alert-schema/active", roles: ["MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/alert-schema/versions", roles: ["MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/alert-schema/presence", roles: ["MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/alert-schema/suggestions", roles: ["MANAGER", "RELEASE_MANAGER"] },
  { path: () => "/test-runs", roles: BUILDERS },
];

test("FEATURE plataforma: lecturas de métricas, configuración, ajustes, esquema y operaciones", async ({ playwright, baseURL }) => {
  const failures: string[] = [];
  let ran = 0;
  for (const read of READS) {
    const roles = read.roles.filter((r) => creds(r));
    if (!roles.length) continue;
    const results: string[] = [];
    let passed = false;
    for (const role of roles) {
      const s = await Session.open(playwright, baseURL, role);
      try {
        const r = await s.get(read.path());
        results.push(`${role}=${r.status()}`);
        if (r.status() >= 500) failures.push(`${read.path()} ${role} -> ${r.status()}`);
        if (r.status() < 300) {
          passed = true;
          break;
        }
      } finally {
        await s.api.dispose();
      }
    }
    ran++;
    if (!passed) failures.push(`${read.path()} sin 2xx (${results.join(", ")})`);
  }
  test.skip(ran === 0, "Sin credenciales para ninguna lectura");
  expect(failures, failures.join("\n")).toEqual([]);
});

test("FEATURE alertas y cola: historial, detalle, JSON crudo, revisiones y vistas de detalle", async ({ playwright, baseURL, page }) => {
  await withSession(playwright, baseURL, ["MANAGER", "FRAUD_REVIEWER", "CHANNEL_MANAGER"], async (s) => {
    const hist = await s.json<{ items: Array<{ alert_id: string }> }>("/alerts/history");
    if (hist.items.length) {
      const id = hist.items[0].alert_id;
      expect((await s.get(`/alerts/${id}/fraud-reviews`)).status()).toBeLessThan(300);
      if (s.role === "MANAGER") expect((await s.get(`/alerts/${id}/raw`)).status()).toBeLessThan(300);
      await uiLogin(page, s.role);
      await page.goto(`/alerta/${id}`);
      await expect(page.locator("aside").first()).toBeVisible();
      await expect(page.getByText(/Unexpected Application Error|Application error/i)).toHaveCount(0);
    }
    const runs = await s.get("/test-runs");
    if (runs.ok()) {
      const list = (await runs.json()) as Array<{ id?: string; test_run_id?: string }>;
      const runId = list[0]?.id ?? list[0]?.test_run_id;
      if (runId) {
        expect((await s.get(`/test-runs/${runId}`)).status()).toBeLessThan(300);
        await page.goto(`/testing/${runId}`);
        await expect(page.getByText(/Unexpected Application Error|Application error/i)).toHaveCount(0);
      }
    }
  });
});

test("FEATURE cola del analista: ver cola y detalle; tomar/liberar solo con opt-in", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ["FRAUD_ANALYST"], async (s) => {
    const queue = await s.json<Array<{ alert_id?: string }>>("/analyst-queue");
    expect((await s.get("/analyst-queue/in-process")).status()).toBeLessThan(300);
    const id = queue[0]?.alert_id;
    if (!id) return;
    expect((await s.get(`/analyst-queue/${id}`)).status()).toBeLessThan(300);
    if (flag("E2E_ALLOW_TAKE_RELEASE")) {
      await ok(await s.post(`/analyst-queue/${id}/take`), "tomar");
      s.later("liberar alerta", async () => {
        await ok(await s.post(`/analyst-queue/${id}/release`), "liberar");
      });
    }
  });
});


// ------------------------------------------------------------------ datasets: upload, splits, extract
test("FEATURE datasets avanzado: subida por partes, carga directa, splits reales y extracción", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, BUILDERS, async (s) => {
    const csv = ["event_id,amount,label", ...Array.from({ length: 60 }, (_, i) => `smoke-${i},${10 + i},${i % 6 === 0 ? "fraud" : "no_fraud"}`)].join("\n") + "\n";
    const ready = async (ds: string) =>
      poll(`dataset ${ds} READY`, async () => {
        const sm = await s.json<{ status: string; error?: string; total_rows: number }>(`/datasets/${encodeURIComponent(ds)}/summary`);
        if (sm.status === "FAILED") throw new Error(`dataset ${ds} FAILED: ${sm.error}`);
        return sm.status === "READY" ? sm : undefined;
      });

    // Multipart (chunked) upload.
    const bytes = Buffer.from(csv, "utf8");
    const upload = await ok<{ upload_id: string; name: string; total_parts: number }>(
      await s.post("/datasets/uploads", { filename: `${DS_RUN}_up.csv`, total_size_bytes: bytes.length }),
      "iniciar subida",
    );
    s.later("abortar subida", async () => {
      await s.del(`/datasets/uploads/${upload.upload_id}`);
    });
    expect(upload.total_parts).toBe(1);
    await ok(
      await s.api.put(`${API}/datasets/uploads/${upload.upload_id}/parts/1`, { ...s.auth, headers: { ...s.auth.headers, "content-type": "application/octet-stream" }, data: bytes }),
      "subir parte 1",
    );
    const done = await ok<{ name: string }>(await s.post(`/datasets/uploads/${upload.upload_id}/complete`), "completar subida");
    s.deleteLater("dataset subido", `/datasets/${encodeURIComponent(done.name)}`);
    const uploaded = await ready(done.name);
    expect(uploaded.total_rows).toBe(60);

    // Direct file upload.
    const direct = await ok<{ name: string }>(
      await s.api.post(`${API}/datasets`, { ...s.auth, multipart: { file: { name: `${DS_RUN}_direct.csv`, mimeType: "text/csv", buffer: bytes } } }),
      "carga directa",
    );
    s.deleteLater("dataset directo", `/datasets/${encodeURIComponent(direct.name)}`);
    await ready(direct.name);

    // Real split (creates a derived dataset) and extraction.
    const splitName = `${DS_RUN}_split`;
    await ok(
      await s.post(`/datasets/${done.name}/splits`, { target_name: splitName, proportions: { training: 0.6, validation: 0.1, calibration: 0.1, test: 0.2 }, seed: 7 }),
      "crear splits",
    );
    s.deleteLater("dataset splits", `/datasets/${encodeURIComponent(splitName)}`);
    await ready(splitName);
    const extractName = `${DS_RUN}_extract`;
    await ok(await s.post("/datasets/extract", { source_names: [done.name], percentage: 50, target_name: extractName }), "extraer");
    s.deleteLater("dataset extraído", `/datasets/${encodeURIComponent(extractName)}`);
    await ready(extractName);
  });
});

test("FEATURE watchlists: importar elementos desde archivo CSV", async ({ playwright, baseURL }) => {
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const wl = await ok<{ id: string }>(
      await s.post("/watchlists", { name: `${RUN_ID} importada`, description: "smoke", list_type: "whitelist", elements: [] }),
      "crear watchlist",
    );
    s.deleteLater("watchlist importada", `/watchlists/${wl.id}`);
    const res = await ok<{ added: number }>(
      await s.api.post(`${API}/watchlists/${wl.id}/elements/import`, { ...s.auth, multipart: { file: { name: "smoke.csv", mimeType: "text/csv", buffer: Buffer.from("imp-1\nimp-2\nimp-3\n") } } }),
      "importar archivo",
    );
    expect(res.added).toBe(3);
    const elements = await s.json<unknown>(`/watchlists/${wl.id}/elements?limit=10`);
    expect(JSON.stringify(elements)).toContain("imp-2");
  });
});

// ------------------------------------------------------------------ assistant: every draft kind
// Shared harness: one assistant session with a typed message -> draft -> confirm helper.
async function assistantHarness(s: Session) {
  const session = await ok<{ session_id: string }>(await s.post("/agent/sessions", { mode: "assistant", scope: ["library"] }), "sesión");
  s.later("cancelar sesión", async () => {
    await s.post(`/agent/sessions/${session.session_id}/cancel`);
  });
  const base = `/agent/sessions/${session.session_id}`;
  const send = async (content: string) => {
    const id = crypto.randomUUID();
    const t0 = Date.now();
    await ok(await s.post(`${base}/messages`, { client_message_id: id, content, page_path: "/biblioteca" }), "mensaje");
    console.log(`[asistente] mensaje ${Math.round((Date.now() - t0) / 1000)}s`);
    return id;
  };
  const confirmDraft = async (kind: string, body: Record<string, unknown>, prompt: string, id?: string) => {
    const messageId = id ?? (await send(prompt));
    const t0 = Date.now();
    const draft = await ok<{ package_id: string; content: { items: Array<Record<string, string>> }; verifications: Array<{ status: string }> }>(
      await s.post(`${base}/${kind}`, { client_message_id: messageId, ...body }),
      `borrador ${kind}`,
    );
    console.log(`[asistente] borrador ${kind} ${Math.round((Date.now() - t0) / 1000)}s`);
    expect(draft.verifications.every((v) => v.status === "PASS"), `verificaciones ${kind}`).toBeTruthy();
    const item = draft.content.items[0];
    return ok<{ entity_id: string }>(await s.post(`${base}/${kind}/${draft.package_id}/confirm`, { item_id: item.item_id ?? item.id }), `confirmar ${kind}`);
  };
  return { base, send, confirmDraft };
}

test("FEATURE asistente avanzado A: modus operandi, red/yellow flag y caso similar", async ({ playwright, baseURL }) => {
  test.setTimeout(600_000);
  test.skip(flag("E2E_SKIP_LLM"), "E2E_SKIP_LLM=1");
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const settings = await assistantSettings(playwright, baseURL);
    test.skip(settings?.assistant_enabled === false, "Asistente deshabilitado");
    const taxonomy = await ok<{ id: string }>(
      await s.post("/library/taxonomies", { code: `${RUN_ID}-T`.slice(0, 50), name: `${RUN_ID} taxonomía base`, description: "fixture", variables: ["canal", "dispositivo"], examples: ["autenticación digital no reconocida"] }),
      "taxonomía fixture",
    );
    s.deleteLater("taxonomía fixture (cascada MO/flags/casos)", `/library/taxonomies/${taxonomy.id}`);
    const { confirmDraft } = await assistantHarness(s);

    const mo = await confirmDraft(
      "modus-operandi-drafts",
      { operation: "create" },
      `Crea un modus operandi nuevo. Título exacto: ${RUN_ID} MO asistente. Narrativa: suplantación del titular durante autenticación digital. Taxonomy_library_id exacto: ${taxonomy.id}. Variables: canal y dispositivo. Playbook strategy: validar identidad por canal alterno. resolution_tag primaria handle_by_aria, resolution_method_id null. if_no_voicebot debe ser scale_to_analyst, resolution_method_id null. if_no_analyst debe ser block_soft, resolution_method_id null. Incluye todos esos campos en el borrador sin cambiar valores.`,
    );
    for (const color of ["red", "yellow"]) {
      await confirmDraft(
        "flag-drafts",
        { operation: "create" },
        `Crea un ${color} flag para el modus operandi ${mo.entity_id}. flag_type exacto ${color}. Nombre exacto: ${RUN_ID} ${color} flag. Descripción: indicador de suplantación digital durante validación reforzada. evolved_variables: canal y dispositivo. modus_operandi_library_ids debe contener únicamente ${mo.entity_id}.`,
      );
    }
    await confirmDraft(
      "similar-case-drafts",
      { operation: "create" },
      `Crea un caso similar nuevo. El texto debe incluir exactamente el marcador ${RUN_ID}-CASO y describir una suplantación durante autenticación digital con validación por canal alterno. modus_operandi_library_id exacto ${mo.entity_id}. taxonomy_library_id exacto ${taxonomy.id}. No inventes referencias.`,
    );
    const flags = await s.json<Array<{ name: string }>>("/library/flags");
    expect(flags.filter((f) => f.name.startsWith(RUN_ID)).length).toBeGreaterThanOrEqual(2);
  });
});

test("FEATURE asistente avanzado B: watchlist, elementos enmascarados, catálogo y dataset vacío", async ({ playwright, baseURL }) => {
  test.setTimeout(600_000);
  test.skip(flag("E2E_SKIP_LLM"), "E2E_SKIP_LLM=1");
  await withSession(playwright, baseURL, ADMINS, async (s) => {
    const settings = await assistantSettings(playwright, baseURL);
    test.skip(settings?.assistant_enabled === false, "Asistente deshabilitado");
    const { base, send, confirmDraft } = await assistantHarness(s);

    const wl = await confirmDraft(
      "watchlist-drafts",
      { operation: "create" },
      `Crea una watchlist blacklist con name exacto ${RUN_ID} lista asistente y description: identificadores de prueba de humo. No agregues elementos.`,
    );
    s.deleteLater("watchlist del asistente", `/watchlists/${wl.entity_id}`);
    const tag = await confirmDraft("resource-drafts", { resource: "catalog_entry" }, `Crea un elemento nuevo del catálogo event_type con value exacto ${RUN_ID}_EVENTO.`);
    s.deleteLater("tag del asistente", `/tag-catalog/event_type/${tag.entity_id}`);
    const dsName = `${DS_RUN}_asst`;
    const ds = await confirmDraft("resource-drafts", { resource: "dataset_empty" }, `Crea un dataset vacío con name exacto ${dsName} y fields: event_id, event_type.`);
    s.deleteLater("dataset del asistente", `/datasets/${encodeURIComponent(ds.entity_id ?? dsName)}`);

    // The raw identifier travels only in source_message_content; the transcript stores a mask.
    const elPrompt = `Agrega la cédula 999888777 a la watchlist ${RUN_ID} lista asistente.`;
    const elId = await send(elPrompt);
    await confirmDraft("watchlist-drafts", { operation: "add_elements", source_message_content: elPrompt }, elPrompt, elId);
    const messages = await s.json<Array<{ content: string }>>(`${base}/messages`);
    expect(JSON.stringify(messages)).not.toContain("999888777");

    const insights = await s.json<Array<{ insight_id: string; status: string }>>(`${base}/insights`);
    const pending = insights.find((i) => i.status === "PROPOSED" || i.status === "PENDING");
    if (pending) await ok(await s.post(`${base}/insights/${pending.insight_id}/reject`), "rechazar insight");
  });
});

// ------------------------------------------------------------------ opt-in writes
test("FEATURE ajustes (opt-in): escribir ajustes operativos con los mismos valores", async ({ playwright, baseURL }) => {
  test.skip(!flag("E2E_ALLOW_SETTINGS_WRITE"), "E2E_ALLOW_SETTINGS_WRITE=1 requerido");
  await withSession(playwright, baseURL, ["MANAGER", "CHANNEL_MANAGER"], async (s) => {
    for (const path of ["/operational-settings", "/assistant-optimizer-settings"]) {
      const current = await s.json<Record<string, unknown>>(path);
      const settings = (current.settings as Record<string, unknown> | undefined) ?? current;
      await ok(await s.put(path, { settings }), `PUT ${path}`);
    }
  });
});

test("FEATURE respaldos (opt-in): crear un respaldo", async ({ playwright, baseURL }) => {
  test.skip(!flag("E2E_ALLOW_BACKUP"), "E2E_ALLOW_BACKUP=1 requerido (no se puede borrar por API)");
  await withSession(playwright, baseURL, ["MANAGER"], async (s) => {
    await ok(await s.post("/backups"), "crear respaldo");
  });
});

// ------------------------------------------------------------------ sweep
test.afterAll(async ({ playwright, baseURL }) => {
  const role = pick(...ADMINS);
  if (!role) return;
  const s = await Session.open(playwright, baseURL, role);
  const errors: string[] = [];
  const sweep = async (label: string, list: string, field: string, prefix: string, del: (x: Record<string, string>) => string) => {
    try {
      const r = await s.get(list);
      if (!r.ok()) return;
      const data = (await r.json()) as Array<Record<string, string>>;
      for (const x of Array.isArray(data) ? data : []) {
        if (String(x[field] ?? "").startsWith(prefix)) {
          const d = await s.del(del(x));
          if (![200, 202, 204, 404].includes(d.status())) errors.push(`${label} ${x[field]}: ${d.status()}`);
        }
      }
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
    }
  };
  await sweep("marcación", "/marcacion-catalog?active_only=false", "value", PREFIX, (x) => `/marcacion-catalog/${x.id}`);
  await sweep("método", "/resolution-method-catalog?active_only=false", "value", PREFIX, (x) => `/resolution-method-catalog/${x.id}`);
  await sweep("variable", "/variable-catalog?active_only=false", "value", PREFIX, (x) => `/variable-catalog/${x.id}`);
  for (const c of ["integration_point", "triggered_rule", "event_type"]) {
    await sweep(`tag ${c}`, `/tag-catalog?category=${c}`, "value", PREFIX, (x) => `/tag-catalog/${c}/${x.id}`);
  }
  await sweep("escenarios", "/scenarios", "name", PREFIX, (x) => `/scenarios/${x.id}`);
  await sweep("datasets", "/datasets", "name", DS_PREFIX, (x) => `/datasets/${encodeURIComponent(x.name)}`);
  await sweep("plantillas", "/models/feature-templates", "name", PREFIX, (x) => `/models/feature-templates/${x.id}`);
  await sweep("canales", "/library/channels", "name", PREFIX, (x) => `/library/channels/${x.id}`);
  await sweep("taxonomías", "/library/taxonomies?active_only=false", "name", PREFIX, (x) => `/library/taxonomies/${x.id}`);
  await s.api.dispose();
  if (errors.length) throw new Error(`BARRIDO INCOMPLETO, revisar a mano:\n${errors.join("\n")}`);
});
