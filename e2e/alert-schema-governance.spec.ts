import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(import.meta.dirname, "fixtures/muestra_total_aria_head5.csv");
const fixtureRows = readFileSync(fixturePath, "utf8").trim().split("\n").slice(1);
const datasetName = "Muestra_total_ARIA_JUl_head5.csv";
const runId = "e2e-schema-run-5";
const workflowId = "e2e-workflow-1";

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
  description: "Campo proveniente del CSV de ARIA",
  use_locale: false,
  locale_type: null,
  ...extra,
});

const activeSchema = {
  version: 1,
  status: "active",
  fields: [
    field("event-id", "event_id", "eventid"),
    field("event-time", "event_time", "fecha_transaccion", "datetime"),
    field("event-type", "event_type", "eventtype"),
    field("channel", "channel", "channel"),
    field("entrypoint", "entrypoint", "integrationpoint"),
    field("amount", "amount", "amount_value", "number"),
    field("customer-id", "customer_id", "customerid"),
  ],
  field_roles: {
    event_id: "event-id",
    event_time: "event-time",
    event_type: "event-type",
    channel: "channel",
    entrypoint: "entrypoint",
    amount: "amount",
    customer_id: "customer-id",
  },
  proposed_by: null,
  proposed_at: null,
  approved_by: "release-manager-1",
  approved_at: "2026-10-10T10:00:00Z",
  impact_acknowledged: false,
  based_on_version: null,
  comparison: {},
  impact: [],
};

const candidateSchema = {
  ...activeSchema,
  version: 2,
  status: "proposed",
  fields: [
    ...activeSchema.fields,
    field("label-tipo", "tipo", "tipo", "string", {
      field_name: "Desenlace real",
      is_alert: true,
      is_mandatory: false,
      is_core: false,
      is_label: true,
      group: "Desenlace",
    }),
  ],
  proposed_by: "manager-1",
  proposed_at: "2026-10-10T11:00:00Z",
  based_on_version: 1,
  comparison: { added: [{ id: "label-tipo", field: "tipo" }] },
  impact: [{ kind: "configuration", id: "config-e2e" }],
};

function json(route: Parameters<Parameters<Page["route"]>[1]>[0], body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockGovernanceApi(page: Page, role = "manager") {
  let startedRequest: Record<string, unknown> | undefined;

  await page.route("**/health", (route) => json(route, { status: "ok" }));
  await page.route("**/api/v0/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v0/auth/me") {
      return json(route, {
        id: role === "manager" ? "manager-1" : "release-manager-1",
        name: role === "manager" ? "Manager E2E" : "Release Manager E2E",
        email: `${role}@example.com`,
        role,
        permissions: ["alert_schema", "testing", "configuration"],
      });
    }
    if (path === "/api/v0/alert-schema/active") return json(route, activeSchema);
    if (path === "/api/v0/alert-schema/versions") return json(route, [candidateSchema, activeSchema]);
    if (path === "/api/v0/alert-schema/presence") return json(route, null);
    if (path === "/api/v0/alert-schema/suggestions") return json(route, []);
    if (path === "/api/v0/configurations") return json(route, []);
    if (path === "/api/v0/test-runs" && request.method() === "GET") return json(route, []);
    if (path === "/api/v0/datasets") {
      return json(route, [{ name: datasetName, row_count: fixtureRows.length }]);
    }
    if (path === `/api/v0/datasets/${encodeURIComponent(datasetName)}/summary`) {
      return json(route, {
        dataset_name: datasetName,
        status: "READY",
        total_rows: fixtureRows.length,
        field_distributions: {},
        available_fields: ["eventid", "eventtype", "channel", "integrationpoint", "amount_value", "tipo"],
        uploaded_at: "2026-10-10T10:00:00Z",
        updated_at: null,
        error: null,
        origin: "UPLOADED",
        source_dataset_names: [],
        extraction_filter: null,
        fraud_marking_analysis: null,
      });
    }
    if (path === "/api/v0/test-runs" && request.method() === "POST") {
      startedRequest = request.postDataJSON() as Record<string, unknown>;
      return json(route, {
        test_run_id: runId,
        id: runId,
        name: startedRequest.name,
        dataset_name: datasetName,
        status: "SUCCEEDED",
        total: fixtureRows.length,
      }, 202);
    }
    if (path === `/api/v0/test-runs/${runId}`) {
      return json(route, {
        id: runId,
        name: "E2E esquema ARIA · 5 filas",
        dataset_name: datasetName,
        status: "SUCCEEDED",
        total: fixtureRows.length,
        succeeded: fixtureRows.length,
        failed: 0,
        running: 0,
        pending: 0,
        input_tokens: 0,
        output_tokens: 0,
        cases: [{ workflow_execution_id: workflowId, alert_id: "alert-e2e-1", status: "SUCCEEDED", current_step: null, duration_seconds: 1 }],
        config: {
          prompt_overrides: {},
          model_overrides: {},
          max_feedback_iterations: 1,
          configuration_ref: null,
          schema_version: 2,
        },
        step_duration_stats: {},
        total_duration_stats: null,
        analyst_agreement_metrics: null,
        ground_truth_metrics: null,
      });
    }
    if (path === `/api/v0/test-runs/${runId}/cases/${workflowId}`) {
      return json(route, {
        workflow_execution_id: workflowId,
        alert_id: "alert-e2e-1",
        status: "SUCCEEDED",
        input_tokens: 0,
        output_tokens: 0,
        schema_version: 2,
        configuration_ref: null,
        schema_comparison: {
          active: { schema_version: 1, input: { event_type: "paymentRT", amount: 19411000 }, labels: { tipo: "NoFraude" }, history_prev_alerta: [] },
          candidate: { schema_version: 2, input: { event_type: "paymentRT", amount: 19411000 }, labels: { tipo: "NoFraude" }, history_prev_alerta: [] },
        },
        steps: [],
      });
    }
    if (path.startsWith("/api/v0/alert-schema/")) return json(route, candidateSchema);
    return json(route, []);
  });

  await page.addInitScript(() => localStorage.setItem("aria.auth.accessToken", "e2e-token"));
  return () => startedRequest;
}

test("gobierna el esquema y bloquea la autoaprobación", async ({ page }) => {
  await mockGovernanceApi(page, "manager");
  await page.goto("/configuracion");

  await page.getByRole("button", { name: "Esquema" }).click();
  await expect(page.getByRole("button", { name: "Campos", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Versión del esquema" }).selectOption("2");
  await page.getByRole("button", { name: "Propuestas" }).click();
  await expect(page.getByText("Vista: v2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar propuesta" })).toBeDisabled();
  await expect(page.getByText(/No puedes aprobar tu propia propuesta/)).toBeVisible();
});

test("lanza cinco filas del CSV con esquema candidato y separa labels", async ({ page }) => {
  const getStartedRequest = await mockGovernanceApi(page, "release_manager");
  await page.goto("/testing?configurationId=e2e-config");
  await expect(page.getByRole("heading", { name: "Nueva prueba" })).toBeVisible();

  await page.getByPlaceholder("Ej: Regresión semanal").fill("E2E esquema ARIA · 5 filas");
  await page.locator("select").filter({ has: page.locator("option", { hasText: "v2 · proposed" }) }).selectOption("2");
  await page.locator("select").filter({ has: page.locator(`option[value="${datasetName}"]`) }).selectOption(datasetName);
  await page.getByPlaceholder("Todas las filas").fill("5");
  await page.getByRole("button", { name: "Iniciar prueba" }).click();

  await expect(page).toHaveURL(`/testing/${runId}`);
  await expect(page.getByText(`Esquema: v2`)).toBeVisible();
  await expect(page.getByText("Comparación de pre-proceso")).toBeVisible();
  await expect(page.getByText("Solo pre-proceso; no incluye salida del agente.")).toBeVisible();
  expect(getStartedRequest()).toMatchObject({
    name: "E2E esquema ARIA · 5 filas",
    dataset_name: datasetName,
    sample_size: 5,
    config: { schema_version: 2 },
  });
});
