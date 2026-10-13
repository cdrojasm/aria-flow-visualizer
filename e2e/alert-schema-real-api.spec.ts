import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const datasetName = "Muestra_total_ARIA_JUl_head5";
let metricAlertId: string | undefined;
let metricSchemaVersion: string | undefined;

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
  optionalField(id, name, location, "string", { is_alert: true, is_label: true, group: "Desenlace" });

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
  optionalField("fecha-primer-marcacion", "fecha_primer_marcacion", "fecha_primer_marcacion", "datetime"),
  optionalField("fecha-ultima-marcacion", "fecha_ultima_marcacion", "fecha_ultima_marcacion", "datetime"),
  optionalField("biocatch-is-mobile-rat", "biocatch_isMobileRat", "biocatch_isMobileRat"),
  optionalField("biocatch-is-emulator", "biocatch_isEmulator", "biocatch_isEmulator"),
  optionalField("biocatch-is-rat", "biocatch_isRat", "biocatch_isRat"),
  optionalField("biocatch-is-bot", "biocatch_isBot", "biocatch_isBot"),
  optionalField("biocatch-indrobo1", "biocatch_indrobo1", "biocatch_indrobo1"),
  optionalField("biocatch-is-on-call", "biocatch_isOnCall", "biocatch_isOnCall"),
  optionalField("biocatch-is-voip-on-call", "biocatch_isVoipOnCall", "biocatch_isVoipOnCall"),
  optionalField("biocatch-screen-broadcast", "biocatch_screenBroadcast", "biocatch_screenBroadcast"),
  optionalField("device-id", "deviceid", "deviceid"),
  optionalField("triggered-rules", "triggered_rules", "triggered_rules"),
  optionalField("device-ip-encrypted", "device_ipaddress_encrypted", "device_ipaddress_encrypted"),
  optionalField("counterparty-entity-encrypted", "counterpartyentityid_encrypted", "counterpartyentityid_encrypted"),
  optionalField("transaction-id", "transactionid", "transactionid"),
  optionalField("output-tags", "output_tags", "output_tags"),
  optionalField("lista-cliente", "lista_cliente", "lista_cliente"),
  optionalField("tipo-documento", "tipo_documento", "tipo_documento"),
  optionalField("numero-documento", "numero_documento", "numero_documento"),
  optionalField("nombre-razon-social", "nombre_razon_social", "nombre_razon_social"),
  optionalField("fecha-nacimiento", "fecha_nacimiento", "fecha_nacimiento", "date"),
  optionalField("sexo", "sexo", "sexo"),
  optionalField("fecha-expedicion-documento", "fecha_expedicion_documento", "fecha_expedicion_documento", "date"),
  optionalField("indicador-revinculado", "indicador_revinculado", "indicador_revinculado"),
  optionalField("codigo-ciudad", "codigo_ciudad", "codigo_ciudad"),
  optionalField("ciudad", "ciudad", "ciudad"),
  optionalField("empleado-banco", "empleado_banco", "empleado_banco"),
  optionalField("fecha-alta", "fecha_alta", "fecha_alta", "date"),
  optionalField("direccion", "direccion", "direccion"),
  optionalField("correo-1", "correo_1", "correo_1"),
  optionalField("correo-2", "correo_2", "correo_2"),
  optionalField("celular", "celular", "celular"),
  optionalField("fecha-ultima-modificacion", "fecha_ultima_modificacion", "fecha_ultima_modificacion", "datetime"),
  optionalField("monto-mas-alto-pse", "MontoMasAltoPSE", "MontoMasAltoPSE", "number"),
  optionalField("monto-mas-alto-pasarela-pago", "MontoMasAltoPasarelaPago", "MontoMasAltoPasarelaPago", "number"),
  optionalField("monto-mas-alto-breb", "MontoMasAltoBreB", "MontoMasAltoBreB", "number"),
  optionalField("monto-mas-alto-glomo", "MontoMasAltoGlomo", "MontoMasAltoGlomo", "number"),
  optionalField("monto-mas-alto-net", "MontoMasAltoNet", "MontoMasAltoNet", "number"),
  optionalField("monto-mas-alto-prestamo", "MontoMasAltoPrestamo", "MontoMasAltoPrestamo", "number"),
  optionalField("monto-mas-alto-facturas", "MontoMasAltoFacturas", "MontoMasAltoFacturas", "number"),
  optionalField("monto-mas-alto-retiros-tarjeta", "MontoMasAltoRetirosTarjeta", "MontoMasAltoRetirosTarjeta", "number"),
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

async function login(api: APIRequestContext, email: string, password: string, label = email): Promise<Auth> {
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
    await expect.poll(async () => {
      response = await api.get(path, { headers: { Authorization: `Bearer ${token}` } });
      return response.status() === 502 ? null : response.status();
    }, { timeout: 30_000, intervals: [250, 500, 1000, 2000] }).not.toBeNull();
  }
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function deleteIfPresent(api: APIRequestContext, token: string, path: string) {
  const response = await api.delete(path, { headers: { Authorization: `Bearer ${token}` } });
  expect([202, 404]).toContain(response.status());
  if (response.status() === 202) {
    const deletion = await response.json() as { async_operation_id?: string | null };
    if (deletion.async_operation_id) {
      await expect.poll(async () => {
        return getJson(api, token, `/api/v0/async-operations/${deletion.async_operation_id}/poll`);
      }, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toMatchObject({
        done: true,
        status: "SUCCEEDED",
      });
    }
    const name = decodeURIComponent(path.split("/").pop()!);
    await expect.poll(async () => {
      const datasets = await getJson(api, token, "/api/v0/datasets");
      return datasets.some((item: { name: string }) => item.name === name);
    }, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe(false);
  }
}

async function authenticateAndSeed(api: APIRequestContext) {
  const manager = await login(api, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!, "manager");
  const release = await login(api, process.env.E2E_RELEASE_MANAGER_EMAIL!, process.env.E2E_RELEASE_MANAGER_PASSWORD!, "release_manager");
  const active = await getJson(api, manager.access_token, "/api/v0/alert-schema/active");
  const versions = await getJson(api, manager.access_token, "/api/v0/alert-schema/versions");
  const candidate = versions.find((item: { status: string }) => item.status === "proposed");
  expect(active, "e2e-seed must leave an active schema").toBeTruthy();
  expect(candidate, "e2e-seed must leave a proposed candidate").toBeTruthy();
  await expect.poll(async () => {
    const summary = await getJson(api, manager.access_token, `/api/v0/datasets/${datasetName}/summary`);
    return summary.status;
  }, { timeout: 60_000, intervals: [1000, 2000, 5000] }).toBe("READY");
  return { manager, release, activeVersion: active.version, candidateVersion: candidate.version };
}

async function useToken(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
}

test("API real: gobierno del esquema y bloqueo de autoaprobación", async ({ page, request }) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL || !process.env.E2E_RELEASE_MANAGER_EMAIL,
    "Define las credenciales E2E de manager y release_manager.");
  const seeded = await authenticateAndSeed(request);
  await useToken(page, seeded.manager.access_token);
  await page.goto("/configuracion");

  await page.getByRole("button", { name: "Esquema" }).click();
  await page.getByRole("combobox", { name: "Versión del esquema" }).selectOption(String(seeded.candidateVersion));
  await page.getByRole("button", { name: "Propuestas" }).click();
  await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeDisabled();
  await expect(page.getByText(/No puedes aprobar tu propia propuesta/)).toBeVisible();
});

test("API real: procesa una fila y conserva labels fuera del input", async ({ page, request }) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL || !process.env.E2E_RELEASE_MANAGER_EMAIL,
    "Define las credenciales E2E de manager y release_manager.");
  const release = await login(request, process.env.E2E_RELEASE_MANAGER_EMAIL!, process.env.E2E_RELEASE_MANAGER_PASSWORD!, "release_manager");
  const schema = await getJson(request, release.access_token, "/api/v0/alert-schema/versions");
  const candidate = schema.find((item: { status: string }) => item.status === "proposed");
  expect(candidate).toBeTruthy();

  await useToken(page, release.access_token);
  await page.goto("/testing");
  await page.getByRole("button", { name: "Nueva prueba" }).click();
  await page.getByPlaceholder("Ej: Regresión semanal").fill("E2E real ARIA · 5 filas");
  await page.getByRole("combobox").filter({ has: page.locator(`option[value="${candidate.version}"]`) }).selectOption(String(candidate.version));
  await page.locator("select").filter({ has: page.locator(`option[value="${datasetName}"]`) }).selectOption(datasetName);
  // A single real evaluation exercises the candidate-schema path. The
  // five-row dataset remains available for presence and simulator scenarios;
  // five sequential LLM workflows exceed the local worker's practical E2E budget.
  await page.getByPlaceholder("Todas las filas").fill("1");
  await page.getByRole("button", { name: "Iniciar prueba" }).click();

  await expect(page).toHaveURL(/\/testing\/[^/]+/);
  await expect(page.getByText(new RegExp(`Esquema: v${candidate.version}`))).toBeVisible({ timeout: 120_000 });

  const runId = new URL(page.url()).pathname.split("/").pop();
  await expect.poll(async () => {
    const current = await getJson(request, release.access_token, `/api/v0/test-runs/${runId}`);
    return current.status;
  }, { timeout: 150_000, intervals: [1000, 2000, 5000] }).toMatch(/^(SUCCEEDED|FAILED)$/);

  const run = await getJson(request, release.access_token, `/api/v0/test-runs/${runId}`);
  expect(run.total).toBe(1);
  expect(run.cases).toHaveLength(1);
  expect(run.succeeded + run.failed).toBe(1);
  const caseId = run.cases[0].workflow_execution_id;
  const detail = await getJson(request, release.access_token, `/api/v0/test-runs/${runId}/cases/${caseId}`);
  const candidateInput = detail.schema_comparison.candidate.input;
  for (const role of ["event_id", "event_time", "event_type", "channel", "entrypoint", "amount", "customer_id"]) {
    expect(candidateInput[role], `mandatory role ${role} should be mapped`).toBeTruthy();
  }
  expect(detail.schema_comparison.candidate.labels.tipo).toBeTruthy();
  expect(candidateInput.tipo).toBeUndefined();
});

test("API real: alerta canónica, raw restringido, historial y métricas por roles", async ({ request }) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL, "Define las credenciales E2E de manager.");
  const manager = await login(request, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!, "manager");
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
  await expect.poll(async () => getJson(request, manager.access_token,
    `/api/v0/async-operations/${start.async_operation_id}/poll`),
  { timeout: 120_000, intervals: [1000, 2000, 5000] }).toMatchObject({ done: true });

  const detail = await getJson(request, manager.access_token, `/api/v0/analyst-queue/${start.alert_id}`);
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
  const history = await getJson(request, manager.access_token, `/api/v0/alerts/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  expect(history.items.some((item: { alert_id: string }) => item.alert_id === start.alert_id)).toBeTruthy();
  metricAlertId = start.alert_id;
  metricSchemaVersion = String(detail.schema_version);
});

test("API real: métricas conservan versión, channel y entrypoint desde roles", async ({ request }) => {
  test.skip(!metricAlertId || !metricSchemaVersion || !process.env.E2E_MANAGER_EMAIL,
    "Requiere la alerta del escenario de procesamiento.");
  const manager = await login(request, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!, "manager");
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const metrics = await getJson(request, manager.access_token, `/api/v0/metrics/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  expect(metrics.range.schema_versions.map(String)).toContain(metricSchemaVersion);
  expect(metrics.distributions.channel.some((item: { value: string }) => item.value === "OM")).toBeTruthy();
  expect(metrics.distributions.subchannel.some((item: { value: string }) => item.value === "e2e-entrypoint")).toBeTruthy();
});

test("API real: el simulador siembra el esquema sin labels y emite eventos sintéticos", async ({ request }) => {
  test.skip(!process.env.E2E_MANAGER_EMAIL, "Define las credenciales E2E de manager.");
  const manager = await login(request, process.env.E2E_MANAGER_EMAIL!, process.env.E2E_MANAGER_PASSWORD!, "manager");
  const specs = await postJson(request, manager.access_token, "/api/v0/scenarios/seed-from-dataset", { dataset_name: datasetName });
  for (const label of ["tipo", "marcacion_final", "razon_marcacion", "output_tags"]) {
    expect(specs[label]).toBeUndefined();
  }
  expect(Object.values(specs).every((generator: any) => generator.kind && generator.kind !== "CONSTANT")).toBeTruthy();
  const customerGenerator = specs.customerid;
  expect(customerGenerator).toBeTruthy();
  expect(Object.keys(customerGenerator.weights ?? {}).every((value) => value.startsWith("synthetic_customer_id_"))).toBeTruthy();

  const scenario = await postJson(request, manager.access_token, "/api/v0/scenarios", {
    name: `E2E schema preview ${Date.now()}`,
    output_mode: "LIVE_PIPELINE",
    rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 60, events_per_minute: 0 }],
    field_specs: specs,
    created_by: manager.id,
  });
  try {
    const previewResponse = await request.post(`/api/v0/scenarios/${scenario.id}/preview?count=5`, {
      headers: { Authorization: `Bearer ${manager.access_token}` },
    });
    expect(previewResponse.ok(), await previewResponse.text()).toBeTruthy();
    const preview = await previewResponse.json();
    expect(preview).toHaveLength(5);
    expect(preview[0].tipo).toBeUndefined();
    expect(preview[0].marcacion_final).toBeUndefined();
    expect(preview[0].customerid.startsWith("synthetic_customer_id_")).toBeTruthy();
    expect(typeof preview[0].amount_value).toBe("number");
  } finally {
    const response = await request.delete(`/api/v0/scenarios/${scenario.id}`, {
      headers: { Authorization: `Bearer ${manager.access_token}` },
    });
    expect(response.status()).toBe(204);
  }
});
