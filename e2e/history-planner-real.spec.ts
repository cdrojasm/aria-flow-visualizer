import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.setTimeout(600_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const channelManagerEmail = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const channelManagerPassword = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
const workflowTimeoutMs = Number(process.env.E2E_WORKFLOW_TIMEOUT ?? "540") * 1000;
const FIXTURE = resolve(process.cwd(), "e2e/fixtures/muestra_total_aria_head5.csv");
const HISTORY_STEPS = ["detector", "classification"];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type HistoryResult = {
  source: string;
  status: string;
  findings: unknown[];
  trace: Json[];
};

async function login(api: APIRequestContext, email: string, password: string) {
  const response = await api.post(`${baseURL}/api/v0/auth/login`, { data: { email, password } });
  expect(response.ok(), `login: ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript(
    (value) => window.localStorage.setItem("aria.auth.accessToken", value),
    token,
  );
}

const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

// First fixture row plus a real "transacciones_json" history, the column a
// CSV batch uses to give the Análisis de historial something to analyze.
function datasetWithHistory(): Buffer {
  const [header, firstRow] = readFileSync(FIXTURE, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const prior = [185000, 240000, 315000, 410000, 98000].map((amount, index) => ({
    amount_value: amount,
    eventtime: `2025-07-0${index + 1}T10:0${index}:00`,
    eventtype: "transferencia",
    channel: index % 2 ? "app" : "web",
    integrationpoint: "PSE",
  }));
  return Buffer.from(
    `${header},transacciones_json\n${firstRow},${csvCell(JSON.stringify(prior))}\n`,
    "utf8",
  );
}

// Detector and Clasificación stay inconclusive on purpose, so the history
// analysis runs and its planner is invoked; the LLM planner is pinned.
function withLlmHistoryPlanner(segments: Json): Json {
  const copy = structuredClone(segments);
  for (const segment of Object.values(copy) as Json[]) {
    // Tool settings apply only to an enabled segment that matches the alert.
    segment.enabled = true;
    const agent = segment.agent ?? {};
    if (agent.deterministic) agent.deterministic.rules = [];
    for (const step of HISTORY_STEPS) {
      const tools = agent[step];
      if (!tools) continue;
      tools.use_xgboost_model = false;
      tools.prompt =
        'Prueba E2E del análisis de historial: no concluyas. Devuelve siempre is_fraud="unknown" ' +
        "y explica qué evidencia del historial necesitarías.";
      tools.delegated_research = {
        ...tools.delegated_research,
        history_pandas: {
          ...(tools.delegated_research?.history_pandas ?? {}),
          enabled: true,
          planner: "llm",
          max_delegations: 1,
          window_days: 0,
          max_history_rows: 50,
          timeout_seconds: 25,
          allowed_columns: [],
        },
      };
    }
  }
  return copy;
}

async function waitForOperation(api: APIRequestContext, headers: Json, operationId?: string) {
  if (!operationId) return;
  await expect
    .poll(
      async () => {
        const response = await api.get(`${baseURL}/api/v0/async-operations/${operationId}/poll`, {
          headers,
        });
        const operation = (await response.json()) as { done: boolean; status: string };
        return operation.done ? operation.status : "RUNNING";
      },
      { timeout: 120_000, intervals: [2_000] },
    )
    .toBe("SUCCEEDED");
}

test("análisis de historial real: un lote CSV invoca el planner LLM y su traza queda registrada", async ({
  page,
  request,
}) => {
  test.skip(
    !managerEmail || !managerPassword || !channelManagerEmail || !channelManagerPassword,
    "Define E2E_MANAGER_* y E2E_CHANNEL_MANAGER_*.",
  );
  const managerToken = await login(request, managerEmail!, managerPassword!);
  const headers = { Authorization: `Bearer ${managerToken}` };
  const datasetName = `E2E_historial_${randomUUID().slice(0, 8)}`;

  const upload = await request.post(`${baseURL}/api/v0/datasets`, {
    headers,
    multipart: {
      file: { name: `${datasetName}.csv`, mimeType: "text/csv", buffer: datasetWithHistory() },
    },
  });
  expect([200, 201, 202], await upload.text()).toContain(upload.status());
  await waitForOperation(request, headers, ((await upload.json()) as Json).async_operation_id);

  try {
    await expect
      .poll(
        async () => {
          const response = await request.get(`${baseURL}/api/v0/datasets/${datasetName}/summary`, {
            headers,
          });
          return response.ok() ? ((await response.json()) as Json).status : "PENDING";
        },
        { timeout: 120_000, intervals: [2_000] },
      )
      .toBe("READY");

    const active = (await (
      await request.get(`${baseURL}/api/v0/configurations/active`, { headers })
    ).json()) as Json;
    const configName = `E2E planner historial ${randomUUID()}`;
    const created = await request.post(`${baseURL}/api/v0/configurations`, {
      headers,
      data: {
        name: configName,
        description: "Configuración aislada para invocar el planner LLM del análisis de historial.",
        general: active.general,
        infra: active.infra,
        test: active.test,
        segments: withLlmHistoryPlanner(active.segments),
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const configuration = (await created.json()) as Json;

    const started = await request.post(`${baseURL}/api/v0/test-runs`, {
      headers,
      data: {
        name: `E2E planner historial ${datasetName}`,
        dataset_name: datasetName,
        config: {
          max_feedback_iterations: 0,
          configuration_ref: {
            configuration_id: configuration.configuration_id,
            version: configuration.version,
          },
        },
      },
    });
    expect(started.status(), await started.text()).toBe(202);
    const runId = ((await started.json()) as { test_run_id: string }).test_run_id;

    await expect
      .poll(
        async () =>
          (
            (await (
              await request.get(`${baseURL}/api/v0/test-runs/${runId}`, { headers })
            ).json()) as Json
          ).status,
        { timeout: workflowTimeoutMs, intervals: [3_000] },
      )
      .toMatch(/SUCCEEDED|FAILED/);
    const run = (await (
      await request.get(`${baseURL}/api/v0/test-runs/${runId}`, { headers })
    ).json()) as Json;
    expect(run.cases).toHaveLength(1);
    const detail = (await (
      await request.get(
        `${baseURL}/api/v0/test-runs/${runId}/cases/${run.cases[0].workflow_execution_id}`,
        { headers },
      )
    ).json()) as { steps: { step_name: string; output: Json | null }[] };

    const history = detail.steps
      .filter((step) => HISTORY_STEPS.includes(step.step_name) && step.output)
      .flatMap((step) => (step.output!.research_delegations ?? []) as HistoryResult[])
      .filter((item) => item.source === "history_pandas");
    expect(
      history.length,
      `pasos: ${detail.steps.map((step) => `${step.step_name}:${step.output?.is_fraud ?? "-"}`).join(", ")}`,
    ).toBeGreaterThan(0);
    const executed = history.find((item) => item.status === "executed");
    expect(executed, JSON.stringify(history.map((item) => item.status))).toBeTruthy();
    const plan = executed!.trace[0];
    // The LLM planner ran (plan_history_research) over the real CSV history.
    expect(plan.planner).toBe("llm");
    expect(plan.rows_considered).toBe(5);
    expect(plan.planning_ms).toBeGreaterThan(0);
    expect(plan.planner_input_tokens).toBeGreaterThan(0);

    // The editor shows the pinned planner for the saved version.
    const channelManagerToken = await login(request, channelManagerEmail!, channelManagerPassword!);
    await authenticatePage(page, channelManagerToken);
    await page.goto("/configuracion");
    const configSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Configuraciones" }) });
    const configPicker = configSection
      .getByRole("button", { name: "Configuración", exact: true })
      .locator("..");
    await configPicker.getByRole("button", { name: "Configuración", exact: true }).click();
    await configPicker.getByRole("button").filter({ hasText: configName }).last().click();
    await page.getByRole("button", { name: "Agente", exact: true }).click();
    await page.getByRole("button", { name: "Detector", exact: true }).click();
    await expect(page.getByLabel("Planificador del análisis de historial")).toHaveValue("llm");
  } finally {
    await request.delete(`${baseURL}/api/v0/datasets/${datasetName}`, { headers });
  }
});
