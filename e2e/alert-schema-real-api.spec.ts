import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

const datasetName = "Muestra_total_ARIA_JUl_head5";
let metricAlertId: string | undefined;
let metricSchemaVersion: string | undefined;
const checkpointFile = resolve(".e2e-alert-schema-checkpoint.json");

test.beforeEach(({}, testInfo) => {
  const from = Number(process.env.E2E_FROM ?? "0");
  const step =
    [
      /^API real: gobierno del esquema/,
      /^API real: procesa cinco filas/,
      /^API\/UI real: alerta canónica/,
      /^API\/UI real: release manager/,
      /^API real: métricas conservan versión/,
      /^API real: el simulador/,
    ].findIndex((pattern) => pattern.test(testInfo.title)) + 1;
  if (from > 0 && step < from) {
    testInfo.skip(true, `Checkpoint E2E_FROM=${from} omite los pasos anteriores.`);
  }
});

test.beforeAll(() => {
  if (process.env.E2E_FROM !== "5") return;
  try {
    const checkpoint = JSON.parse(readFileSync(checkpointFile, "utf8")) as {
      metricAlertId?: string;
      metricSchemaVersion?: string;
    };
    metricAlertId = checkpoint.metricAlertId;
    metricSchemaVersion = checkpoint.metricSchemaVersion;
  } catch {
    throw new Error(
      `No se pudo cargar ${checkpointFile}. Ejecuta primero desde E2E_FROM=3 sin limpiar el estado, o usa E2E_FROM=0.`,
    );
  }
});

const field = (id: string, name: string, location: string, type = "string", extra = {}) => ({
  id,
  data_source: "aric",
  field: name,
  field_name: name,
  field_ds_loc: location,
  type,
  is_alert: true,
  is_mandatory: true,
  is_history: false,
  is_core: ["event_id", "event_type", "channel", "amount"].includes(name),
  is_label: false,
  is_sensible: false,
  sensitivity_strategy: null,
  group: "Evento",
  description: "Campo de Muestra_total_ARIA_JUl",
  use_locale: false,
  locale_type: null,
  ...extra,
});

const optionalField = (id: string, name: string, location: string, type = "string", extra = {}) =>
  field(id, name, location, type, { is_mandatory: false, ...extra });

const outcomeField = (id: string, name: string, location: string) =>
  optionalField(id, name, location, "string", {
    is_alert: true,
    is_label: true,
    group: "Desenlace",
  });

const mandatoryFields = [
  field("event-id", "event_id", "eventid"),
  field("event-time", "event_time", "fecha_transaccion", "datetime"),
  field("event-type", "event_type", "eventtype"),
  field("channel", "channel", "channel"),
  field("entrypoint", "entrypoint", "integrationpoint"),
  field("amount", "amount", "amount_value", "number"),
  field("customer-id", "customer_id", "customerid"),
];

// Complete mapping for Muestra_total_ARIA_JUl.csv. The five-row fixture only
// contains a representative subset; the remaining optional fields validate
// the production column contract when the full export is uploaded.
const completeMappedFields = [
  optionalField("reviewstatus-first", "reviewstatus_first", "reviewstatus_first"),
  outcomeField("marcacion-final", "marcacion_final", "marcacion_final"),
  outcomeField("razon-marcacion", "razon_marcacion", "razon_marcacion"),
  optionalField("biocatch-score", "biocatch_score", "biocatch_score", "number"),
  optionalField("model-score", "model_score", "Model_score", "number"),
  optionalField(
    "fecha-primer-marcacion",
    "fecha_primer_marcacion",
    "fecha_primer_marcacion",
    "datetime",
  ),
  optionalField(
    "fecha-ultima-marcacion",
    "fecha_ultima_marcacion",
    "fecha_ultima_marcacion",
    "datetime",
  ),
  optionalField("biocatch-is-mobile-rat", "biocatch_isMobileRat", "biocatch_isMobileRat"),
  optionalField("biocatch-is-emulator", "biocatch_isEmulator", "biocatch_isEmulator"),
  optionalField("biocatch-is-rat", "biocatch_isRat", "biocatch_isRat"),
  optionalField("biocatch-is-bot", "biocatch_isBot", "biocatch_isBot"),
  optionalField("biocatch-indrobo1", "biocatch_indrobo1", "biocatch_indrobo1"),
  optionalField("biocatch-is-on-call", "biocatch_isOnCall", "biocatch_isOnCall"),
  optionalField("biocatch-is-voip-on-call", "biocatch_isVoipOnCall", "biocatch_isVoipOnCall"),
  optionalField(
    "biocatch-screen-broadcast",
    "biocatch_screenBroadcast",
    "biocatch_screenBroadcast",
  ),
  optionalField("device-id", "deviceid", "deviceid"),
  optionalField("triggered-rules", "triggered_rules", "triggered_rules"),
  optionalField("device-ip-encrypted", "device_ipaddress_encrypted", "device_ipaddress_encrypted"),
  optionalField(
    "counterparty-entity-encrypted",
    "counterpartyentityid_encrypted",
    "counterpartyentityid_encrypted",
  ),
  optionalField("transaction-id", "transactionid", "transactionid"),
  optionalField("output-tags", "output_tags", "output_tags"),
  optionalField("lista-cliente", "lista_cliente", "lista_cliente"),
  optionalField("tipo-documento", "tipo_documento", "tipo_documento"),
  optionalField("numero-documento", "numero_documento", "numero_documento"),
  optionalField("nombre-razon-social", "nombre_razon_social", "nombre_razon_social"),
  optionalField("fecha-nacimiento", "fecha_nacimiento", "fecha_nacimiento", "date"),
  optionalField("sexo", "sexo", "sexo"),
  optionalField(
    "fecha-expedicion-documento",
    "fecha_expedicion_documento",
    "fecha_expedicion_documento",
    "date",
  ),
  optionalField("indicador-revinculado", "indicador_revinculado", "indicador_revinculado"),
  optionalField("codigo-ciudad", "codigo_ciudad", "codigo_ciudad"),
  optionalField("ciudad", "ciudad", "ciudad"),
  optionalField("empleado-banco", "empleado_banco", "empleado_banco"),
  optionalField("fecha-alta", "fecha_alta", "fecha_alta", "date"),
  optionalField("direccion", "direccion", "direccion"),
  optionalField("correo-1", "correo_1", "correo_1"),
  optionalField("correo-2", "correo_2", "correo_2"),
  optionalField("celular", "celular", "celular"),
  optionalField(
    "fecha-ultima-modificacion",
    "fecha_ultima_modificacion",
    "fecha_ultima_modificacion",
    "datetime",
  ),
  optionalField("monto-mas-alto-pse", "MontoMasAltoPSE", "MontoMasAltoPSE", "number"),
  optionalField(
    "monto-mas-alto-pasarela-pago",
    "MontoMasAltoPasarelaPago",
    "MontoMasAltoPasarelaPago",
    "number",
  ),
  optionalField("monto-mas-alto-breb", "MontoMasAltoBreB", "MontoMasAltoBreB", "number"),
  optionalField("monto-mas-alto-glomo", "MontoMasAltoGlomo", "MontoMasAltoGlomo", "number"),
  optionalField("monto-mas-alto-net", "MontoMasAltoNet", "MontoMasAltoNet", "number"),
  optionalField(
    "monto-mas-alto-prestamo",
    "MontoMasAltoPrestamo",
    "MontoMasAltoPrestamo",
    "number",
  ),
  optionalField(
    "monto-mas-alto-facturas",
    "MontoMasAltoFacturas",
    "MontoMasAltoFacturas",
    "number",
  ),
  optionalField(
    "monto-mas-alto-retiros-tarjeta",
    "MontoMasAltoRetirosTarjeta",
    "MontoMasAltoRetirosTarjeta",
    "number",
  ),
  outcomeField("tipo", "tipo", "tipo"),
  optionalField("transacciones-json", "transacciones_json", "transacciones_json"),
  optionalField("alertas-json", "alertas_json", "alertas_json"),
];

const v1Fields = [...mandatoryFields, ...completeMappedFields];

const roles = {
  event_id: "event-id",
  event_time: "event-time",
  event_type: "event-type",
  channel: "channel",
  entrypoint: "entrypoint",
  amount: "amount",
  customer_id: "customer-id",
};

type Auth = { id: string; access_token: string };

async function login(
  api: APIRequestContext,
  email: string,
  password: string,
  label = email,
): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `${label} login: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function postJson(api: APIRequestContext, token: string, path: string, data: unknown) {
  const response = await api.post(path, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function getJson(api: APIRequestContext, token: string, path: string) {
  let response = await api.get(path, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status() === 502) {
    await expect
      .poll(
        async () => {
          response = await api.get(path, { headers: { Authorization: `Bearer ${token}` } });
          return response.status() === 502 ? null : response.status();
        },
        { timeout: 30_000, intervals: [250, 500, 1000, 2000] },
      )
      .not.toBeNull();
  }
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function deleteIfPresent(api: APIRequestContext, token: string, path: string) {
  const response = await api.delete(path, { headers: { Authorization: `Bearer ${token}` } });
  expect([202, 404]).toContain(response.status());
  if (response.status() === 202) {
    const deletion = (await response.json()) as { async_operation_id?: string | null };
    if (deletion.async_operation_id) {
      await expect
        .poll(
          async () => {
            return getJson(
              api,
              token,
              `/api/v0/async-operations/${deletion.async_operation_id}/poll`,
            );
          },
          { timeout: 60_000, intervals: [1000, 2000, 5000] },
        )
        .toMatchObject({
          done: true,
          status: "SUCCEEDED",
        });
    }
    const name = decodeURIComponent(path.split("/").pop()!);
    await expect
      .poll(
        async () => {
          const datasets = await getJson(api, token, "/api/v0/datasets");
          return datasets.some((item: { name: string }) => item.name === name);
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(false);
  }
}

async function authenticateAndSeed(api: APIRequestContext) {
  const manager = await login(
    api,
    process.env.E2E_MANAGER_EMAIL!,
    process.env.E2E_MANAGER_PASSWORD!,
    "manager",
  );
  const release = await login(
    api,
    process.env.E2E_RELEASE_MANAGER_EMAIL!,
    process.env.E2E_RELEASE_MANAGER_PASSWORD!,
    "release_manager",
  );
  const active = await getJson(api, manager.access_token, "/api/v0/alert-schema/active");
  const versions = await getJson(api, manager.access_token, "/api/v0/alert-schema/versions");
  const candidate = versions.find((item: { status: string }) => item.status === "proposed");
  expect(active, "e2e-seed must leave an active schema").toBeTruthy();
  expect(candidate, "e2e-seed must leave a proposed candidate").toBeTruthy();
  await expect
    .poll(
      async () => {
        const summary = await getJson(
          api,
          manager.access_token,
          `/api/v0/datasets/${datasetName}/summary`,
        );
        return summary.status;
      },
      { timeout: 60_000, intervals: [1000, 2000, 5000] },
    )
    .toBe("READY");
  return { manager, release, activeVersion: active.version, candidateVersion: candidate.version };
}

async function useToken(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
}

test("API real: gobierno del esquema y bloqueo de autoaprobación", async ({ page, request }) => {
  test.skip(
    !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_RELEASE_MANAGER_EMAIL,
    "Define las credenciales E2E de manager y release_manager.",
  );
  const seeded = await authenticateAndSeed(request);
  const activeSchema = await getJson(
    request,
    seeded.manager.access_token,
    "/api/v0/alert-schema/active",
  );
  let seededSuggestion: { field: string; location: string; comment: string } | undefined;
  if (process.env.E2E_FRAUD_ANALYST_EMAIL && process.env.E2E_FRAUD_ANALYST_PASSWORD) {
    const analyst = await login(
      request,
      process.env.E2E_FRAUD_ANALYST_EMAIL,
      process.env.E2E_FRAUD_ANALYST_PASSWORD,
      "fraud_analyst",
    );
    seededSuggestion = {
      field: "e2e_review_signal",
      location: `e2e_review_signal_${Date.now()}`,
      comment: "E2E suggestion content check",
    };
    await postJson(request, analyst.access_token, "/api/v0/alert-schema/suggestions", {
      alert_id: `e2e-suggestion-${Date.now()}`,
      ...seededSuggestion,
    });
  }
  await useToken(page, seeded.manager.access_token);
  await page.goto("/configuracion");

  await page.getByRole("button", { name: "Esquema" }).click();
  await expect(page.getByText(new RegExp(`Activo: v${seeded.activeVersion}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "Campos de sistema" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sugerencias" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Propuestas" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Campo event-id" })).toHaveValue("event_id");
  await page.getByRole("button", { name: "Campos de sistema" }).click();
  for (const role of Object.keys(roles)) {
    await expect(page.getByRole("combobox", { name: `Campo para ${role}` })).toHaveValue(
      activeSchema.field_roles[role],
    );
  }
  await expect(page.getByText("Workflow, perfilado e historial")).toBeVisible();
  await page.getByRole("button", { name: "Sugerencias" }).click();
  await expect(page.getByText(/Último análisis:/)).toBeVisible();
  const presence = await getJson(
    request,
    seeded.manager.access_token,
    "/api/v0/alert-schema/presence",
  );
  const suggestions = await getJson(
    request,
    seeded.manager.access_token,
    "/api/v0/alert-schema/suggestions",
  );
  if (seededSuggestion) {
    await expect(
      page.getByText(`${seededSuggestion.field} · ${seededSuggestion.location}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(seededSuggestion.comment, { exact: true }).first()).toBeVisible();
  }
  if (presence?.unknown_locations?.length || suggestions.length) {
    for (const item of [...(presence?.unknown_locations ?? []), ...suggestions]) {
      await expect(page.getByText(item.location, { exact: false }).first()).toBeVisible();
    }
  } else {
    await expect(page.getByText("No hay reportes de analistas.")).toBeVisible();
  }
  await page
    .getByRole("combobox", { name: "Versión del esquema" })
    .selectOption(String(seeded.candidateVersion));
  await expect(page.getByText(new RegExp(`Propuso: .+`))).toBeVisible();
  await page.getByRole("button", { name: "Propuestas" }).click();
  const candidate = await getJson(
    request,
    seeded.manager.access_token,
    "/api/v0/alert-schema/versions",
  ).then((versions) =>
    versions.find((item: { version: number }) => item.version === seeded.candidateVersion),
  );
  await expect(page.getByText("Comparación con la versión activa")).toBeVisible();
  if (candidate.impact.length > 0) await expect(page.getByText("Impacto en uso")).toBeVisible();
  if (candidate.proposed_by === seeded.manager.id) {
    await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeDisabled();
    await expect(page.getByText(/No puedes aprobar tu propia propuesta/)).toBeVisible();
  } else {
    // The persisted local stack may contain a proposal from an earlier E2E
    // identity. In that case this manager is a valid cross-user approver.
    await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeEnabled();
  }

  const versions = await getJson(
    request,
    (await login(request, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!))
      .access_token,
    "/api/v0/alert-schema/versions",
  );
  expect(versions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        version: seeded.activeVersion,
        status: "active",
        approved_by: expect.any(String),
      }),
      expect.objectContaining({
        version: seeded.candidateVersion,
        status: "proposed",
        proposed_by: expect.any(String),
      }),
    ]),
  );

  if (process.env.E2E_FRAUD_ANALYST_EMAIL && process.env.E2E_FRAUD_ANALYST_PASSWORD) {
    const analyst = await login(
      request,
      process.env.E2E_FRAUD_ANALYST_EMAIL,
      process.env.E2E_FRAUD_ANALYST_PASSWORD,
      "fraud_analyst",
    );
    const denied = await request.get("/api/v0/alert-schema/versions", {
      headers: { Authorization: `Bearer ${analyst.access_token}` },
    });
    expect(denied.status()).toBe(403);
  }
});

test("API real: procesa una fila y conserva labels fuera del input", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_RELEASE_MANAGER_EMAIL,
    "Define las credenciales E2E de manager y release_manager.",
  );
  const release = await login(
    request,
    process.env.E2E_RELEASE_MANAGER_EMAIL!,
    process.env.E2E_RELEASE_MANAGER_PASSWORD!,
    "release_manager",
  );
  const seeded = await authenticateAndSeed(request);
  const schema = await getJson(request, release.access_token, "/api/v0/alert-schema/versions");
  const candidate = schema.find((item: { status: string }) => item.status === "proposed");
  expect(candidate).toBeTruthy();

  await useToken(page, release.access_token);
  await page.goto("/testing");
  await page.getByRole("button", { name: "Nueva prueba" }).click();
  await page.getByPlaceholder("Ej: Regresión semanal").fill("E2E real ARIA · 1 fila");
  await page
    .getByRole("combobox")
    .filter({ has: page.locator(`option[value="${candidate.version}"]`) })
    .selectOption(String(candidate.version));
  await page
    .locator("aside select")
    .filter({ has: page.locator(`option[value="${datasetName}"]`) })
    .selectOption(datasetName);
  // This assertion covers the persisted case payload and its real workflow.
  // Keep the sample bounded so an unrelated slow LLM request among several
  // concurrent rows cannot hold the complete E2E suite open for minutes.
  await page.getByPlaceholder("Todas las filas").fill("1");
  await page.locator('input[type="number"]').nth(1).fill("1");
  await page.getByRole("button", { name: "Iniciar prueba" }).click();

  await expect(page).toHaveURL(/\/testing\/[^/]+/);
  await expect(page.getByText(new RegExp(`Esquema: v${candidate.version}`))).toBeVisible({
    timeout: 120_000,
  });

  const runId = new URL(page.url()).pathname.split("/").pop();
  await expect
    .poll(
      async () => {
        const current = await getJson(request, release.access_token, `/api/v0/test-runs/${runId}`);
        return current.status;
      },
      { timeout: 360_000, intervals: [1000, 2000, 5000] },
    )
    .toBe("SUCCEEDED");

  const run = await getJson(request, release.access_token, `/api/v0/test-runs/${runId}`);
  expect(run.total).toBe(1);
  expect(run.cases).toHaveLength(1);
  expect(run.succeeded + run.failed + run.running + run.pending).toBe(1);
  expect(
    run.cases.every((item: { status: string }) => ["SUCCEEDED", "FAILED"].includes(item.status)),
  ).toBeTruthy();
  const caseId = run.cases[0].workflow_execution_id;
  const detail = await getJson(
    request,
    release.access_token,
    `/api/v0/test-runs/${runId}/cases/${caseId}`,
  );
  const candidateInput = detail.schema_comparison.candidate.input;
  expect(Object.keys(candidateInput).length).toBeGreaterThan(0);
  expect(detail.schema_comparison.candidate.labels.tipo).toBeTruthy();
  expect(candidateInput.tipo).toBeUndefined();
  expect(detail.schema_comparison.active.schema_version).toBe(seeded.activeVersion);
  expect(detail.schema_comparison.candidate.schema_version).toBe(seeded.candidateVersion);
  const versions = await getJson(request, release.access_token, "/api/v0/alert-schema/versions");
  const candidateSchema = versions.find(
    (item: { version: number }) => item.version === seeded.candidateVersion,
  );
  const activeSchema = versions.find(
    (item: { version: number }) => item.version === seeded.activeVersion,
  );
  expect(candidateSchema.comparison.added.length).toBeGreaterThan(0);
  expect(candidateSchema.comparison.removed.length).toBeGreaterThan(0);
  expect(candidateSchema.comparison.role_reassignments).toContainEqual({
    role: "channel",
    before: activeSchema.field_roles.channel,
    after: candidateSchema.field_roles.channel,
  });

  const workflowInputs = JSON.stringify(
    (detail.steps ?? []).map((step: { input?: unknown }) => step.input ?? {}),
  );
  for (const label of ["tipo", "marcacion_final", "razon_marcacion", "output_tags"]) {
    expect(workflowInputs).not.toContain(`\"${label}\"`);
  }
});

test("API/UI real: alerta canónica, raw restringido, historial y exportación al dataset", async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL, "Define las credenciales E2E de manager.");
  const manager = await login(
    request,
    process.env.E2E_MANAGER_EMAIL!,
    process.env.E2E_MANAGER_PASSWORD!,
    "manager",
  );
  const eventId = `e2e-${Date.now()}`;
  const customerId = "e2e-customer-9876";
  const start = await postJson(request, manager.access_token, "/api/v0/alerts/test", {
    event: {
      eventid: eventId,
      eventtype: "paymentRT",
      channel: "OM",
      integrationpoint: "e2e-entrypoint",
      amount_value: 12345.67,
      fecha_transaccion: new Date().toISOString(),
      customerid: customerId,
      tipo: "NoFraude",
      marcacion_final: "no-risk",
      razon_marcacion: "e2e evaluation label",
      output_tags: "e2e-only-label",
    },
  });
  await expect
    .poll(
      async () =>
        getJson(
          request,
          manager.access_token,
          `/api/v0/async-operations/${start.async_operation_id}/poll`,
        ),
      { timeout: 120_000, intervals: [1000, 2000, 5000] },
    )
    .toMatchObject({ done: true });

  const detail = await getJson(
    request,
    manager.access_token,
    `/api/v0/analyst-queue/${start.alert_id}`,
  );
  expect(detail.input.event_id).toBe(eventId);
  expect(detail.input.amount).toBe(12345.67);
  for (const label of ["tipo", "marcacion_final", "razon_marcacion", "output_tags"]) {
    expect(detail.labels[label], `${label} stays in labels`).toBeTruthy();
    expect(detail.input[label], `${label} is excluded from agent input`).toBeUndefined();
  }
  expect(Array.isArray(detail.history_prev_alerta)).toBeTruthy();
  expect(typeof detail.agent_output).toBe("object");

  const raw = await getJson(request, manager.access_token, `/api/v0/alerts/${start.alert_id}/raw`);
  expect(raw.customerid).not.toBe(customerId);
  expect(raw.customerid.endsWith("9876")).toBeTruthy();

  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const history = await getJson(
    request,
    manager.access_token,
    `/api/v0/alerts/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  expect(
    history.items.some((item: { alert_id: string }) => item.alert_id === start.alert_id),
  ).toBeTruthy();

  await useToken(page, manager.access_token);
  await page.goto("/cola");
  await expect(page.getByRole("heading", { name: "Alertas en progreso" })).toBeVisible();
  await page.getByRole("button", { name: "Alertas en proceso" }).click();
  await expect(page.getByText("$ 800,00 USD")).toBeVisible();
  await page.goto(`/alerta/${start.alert_id}`);
  await page.getByRole("button", { name: "Data alerta" }).click();
  await expect(page.getByText("12.345,67", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Razonamiento del agente" }).click();
  await expect(page.getByRole("heading", { name: "Campos del agente" })).toBeVisible();
  const visibleAgentOutput = Object.entries(detail.agent_output as Record<string, unknown>);
  if (visibleAgentOutput.length) {
    for (const [key, value] of visibleAgentOutput) {
      await expect(page.getByText(key, { exact: true })).toBeVisible();
      await expect(page.getByText(String(value), { exact: true })).toBeVisible();
    }
  }
  await page.getByRole("button", { name: "Evento original (ARIC)" }).click();
  await expect(page.locator("pre")).toContainText(eventId);
  const audit = await getJson(
    request,
    manager.access_token,
    `/api/v0/e2e/alerts/${start.alert_id}/raw-access-audit`,
  );
  expect(audit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ alert_id: start.alert_id, user_id: manager.id }),
    ]),
  );
  await expect(page.getByRole("button", { name: "Al dataset" })).toBeVisible();
  await page.getByRole("button", { name: "Al dataset" }).click();
  const datasetModal = page
    .locator("div.fixed.inset-0")
    .filter({ hasText: "Agregar al dataset de entrenamiento" });
  await datasetModal.locator("select").selectOption(datasetName);
  await datasetModal
    .locator("textarea")
    .fill("E2E exporta la alerta canónica al dataset de entrenamiento");
  await datasetModal
    .locator("div.max-w-md")
    .evaluate((dialog) => dialog.scrollTo(0, dialog.scrollHeight));
  const curateResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v0/alerts/${start.alert_id}/curate-to-dataset`) &&
      response.request().method() === "POST",
  );
  await datasetModal.getByRole("button", { name: "Agregar" }).click();
  const curate = await curateResponse;
  expect(curate.ok(), await curate.text()).toBeTruthy();
  expect(await curate.json()).toMatchObject({ dataset_name: datasetName });
  metricAlertId = start.alert_id;
  metricSchemaVersion = String(detail.schema_version);
  writeFileSync(checkpointFile, JSON.stringify({ metricAlertId, metricSchemaVersion }, null, 2));
});

test("API/UI real: release manager aprueba con impacto y conserva auditoría", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_RELEASE_MANAGER_EMAIL,
    "Define credenciales E2E de manager y release_manager.",
  );
  const manager = await login(
    request,
    process.env.E2E_MANAGER_EMAIL!,
    process.env.E2E_MANAGER_PASSWORD!,
    "manager",
  );
  const release = await login(
    request,
    process.env.E2E_RELEASE_MANAGER_EMAIL!,
    process.env.E2E_RELEASE_MANAGER_PASSWORD!,
    "release_manager",
  );
  const versions = await getJson(request, manager.access_token, "/api/v0/alert-schema/versions");
  const candidate = versions.find((item: { status: string }) => item.status === "proposed");
  test.skip(!candidate, "El seed debe dejar una propuesta para aprobación cross-user.");

  await useToken(page, release.access_token);
  await page.goto("/configuracion");
  await page.getByRole("button", { name: "Esquema" }).click();
  await page
    .getByRole("combobox", { name: "Versión del esquema" })
    .selectOption(String(candidate.version));
  await page.getByRole("button", { name: "Propuestas" }).click();
  if (candidate.impact.length > 0) {
    await expect(page.getByText("Impacto en uso")).toBeVisible();
    await page.getByRole("checkbox", { name: "Entiendo el impacto" }).check();
  } else {
    await expect(page.getByText("Comparación con la versión activa")).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeEnabled();
  await page.getByRole("button", { name: "Aprobar propuesta" }).click();
  await expect
    .poll(async () => getJson(request, release.access_token, "/api/v0/alert-schema/active"))
    .toMatchObject({
      version: candidate.version,
      status: "active",
      approved_by: release.id,
      impact_acknowledged: candidate.impact.length > 0,
    });
});

test("API real: métricas conservan versión, channel y entrypoint desde roles", async ({
  page,
  request,
}) => {
  test.skip(
    !metricAlertId || !metricSchemaVersion || !process.env.E2E_MANAGER_EMAIL,
    "Requiere la alerta del escenario de procesamiento.",
  );
  const manager = await login(
    request,
    process.env.E2E_MANAGER_EMAIL!,
    process.env.E2E_MANAGER_PASSWORD!,
    "manager",
  );
  const versions = await getJson(request, manager.access_token, "/api/v0/alert-schema/active");
  const secondAlert = await postJson(request, manager.access_token, "/api/v0/alerts/test", {
    event: {
      eventid: `e2e-v${versions.version}-${Date.now()}`,
      eventtype: "paymentRT",
      channel: "OM",
      integrationpoint: "e2e-entrypoint-v2",
      amount_value: 23456.78,
      fecha_transaccion: new Date().toISOString(),
      customerid: `e2e-customer-v${versions.version}`,
      tipo: "NoFraude",
      marcacion_final: "no-risk",
      razon_marcacion: "e2e second schema version",
      output_tags: "e2e-only-label",
    },
  });
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const metricsPath = `/api/v0/metrics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  await expect
    .poll(
      async () => {
        const current = await getJson(request, manager.access_token, metricsPath);
        return current.range.schema_versions.map(String).includes(String(versions.version));
      },
      { timeout: 120_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(true);
  const metrics = await getJson(request, manager.access_token, metricsPath);
  expect(metrics.range.schema_versions.map(String)).toContain(metricSchemaVersion);
  expect(metrics.range.schema_versions.map(String)).toContain(String(versions.version));
  expect(metrics.range.schema_versions.length).toBeGreaterThanOrEqual(2);
  expect(
    metrics.distributions.channel.some((item: { value: string }) => item.value === "OM"),
  ).toBeTruthy();
  expect(
    metrics.distributions.subchannel.some(
      (item: { value: string }) => item.value === "e2e-entrypoint",
    ),
  ).toBeTruthy();
  expect(
    metrics.distributions.subchannel.some(
      (item: { value: string }) => item.value === "e2e-entrypoint-v2",
    ),
  ).toBeTruthy();
  await useToken(page, manager.access_token);
  await page.goto("/dashboard");
  const dashboardRange = await page.locator("input[type=date]").all();
  if (dashboardRange.length >= 2) {
    await dashboardRange[0].fill(from.slice(0, 10));
    await dashboardRange[1].fill(to.slice(0, 10));
  }
  const versionEvents = await getJson(
    request,
    manager.access_token,
    `/api/v0/metrics/version-events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  expect(versionEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "schema", version: Number(metricSchemaVersion) }),
    ]),
  );
  await page.getByRole("tab", { name: "Histórico" }).click();
  await expect(
    page.getByTestId("dashboard-version-event").filter({
      hasText: new RegExp(`Esquema v${metricSchemaVersion}`),
    }),
  ).toBeVisible();
});

test("API real: el simulador siembra el esquema sin labels y emite eventos sintéticos", async ({
  request,
}) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL, "Define las credenciales E2E de manager.");
  const manager = await login(
    request,
    process.env.E2E_MANAGER_EMAIL!,
    process.env.E2E_MANAGER_PASSWORD!,
    "manager",
  );
  const specs = await postJson(
    request,
    manager.access_token,
    "/api/v0/scenarios/seed-from-dataset",
    { dataset_name: datasetName },
  );
  for (const label of ["tipo", "marcacion_final", "razon_marcacion", "output_tags"]) {
    expect(specs[label]).toBeUndefined();
  }
  expect(
    Object.values(specs).every((generator: any) => generator.kind && generator.kind !== "CONSTANT"),
  ).toBeTruthy();
  const customerGenerator = specs.customerid;
  expect(customerGenerator).toBeTruthy();
  expect(
    Object.keys(customerGenerator.weights ?? {}).every((value) =>
      value.startsWith("synthetic_customer_id_"),
    ),
  ).toBeTruthy();
  const fixture = readFileSync(
    resolve(import.meta.dirname, "fixtures/muestra_total_aria_head5.csv"),
    "utf8",
  )
    .trim()
    .split("\n");
  const columns = fixture[0].split(",");
  const rows = fixture
    .slice(1)
    .map((line) =>
      Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])),
    );
  const expectedChannelWeights = Object.fromEntries(
    [...new Set(rows.map((row) => row.channel))].map((value) => [
      value,
      rows.filter((row) => row.channel === value).length,
    ]),
  );
  for (const [channel, count] of Object.entries(expectedChannelWeights)) {
    expect(specs.channel.weights[channel]).toBeGreaterThanOrEqual(count);
  }
  expect(specs.amount_value.kind).toMatch(/^(NORMAL|LOGNORMAL|POISSON)$/);
  expect(specs.customerid.weights).not.toHaveProperty(rows[0].customerid);
  expect(specs.customerid.weights).not.toHaveProperty(rows[1].customerid);

  const scenario = await postJson(request, manager.access_token, "/api/v0/scenarios", {
    name: `E2E schema preview ${Date.now()}`,
    output_mode: "LIVE_PIPELINE",
    rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 60, events_per_minute: 0 }],
    field_specs: specs,
    created_by: manager.id,
  });
  try {
    const previewResponse = await request.post(
      `/api/v0/scenarios/${scenario.id}/preview?count=100`,
      {
        headers: { Authorization: `Bearer ${manager.access_token}` },
      },
    );
    expect(previewResponse.ok(), await previewResponse.text()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview).toHaveLength(100);
    expect(preview[0].tipo).toBeUndefined();
    expect(preview[0].marcacion_final).toBeUndefined();
    expect(preview[0].customerid.startsWith("synthetic_customer_id_")).toBeTruthy();
    expect(typeof preview[0].amount_value).toBe("number");
    const observed = preview.reduce((counts: Record<string, number>, item: { channel: string }) => {
      counts[item.channel] = (counts[item.channel] ?? 0) + 1;
      return counts;
    }, {});
    const weights = Object.entries(expectedChannelWeights) as [string, number][];
    for (const [value, weight] of weights) {
      const expectedShare = weight / rows.length;
      const observedShare = (observed[value] ?? 0) / preview.length;
      expect(Math.abs(observedShare - expectedShare), `channel ${value} distribution`).toBeLessThan(
        0.12,
      );
    }
  } finally {
    const response = await request.delete(`/api/v0/scenarios/${scenario.id}`, {
      headers: { Authorization: `Bearer ${manager.access_token}` },
    });
    expect(response.status()).toBe(204);
  }
});
