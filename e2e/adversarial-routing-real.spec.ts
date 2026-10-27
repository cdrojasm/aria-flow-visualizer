import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const datasetName = "Muestra_total_ARIA_JUl_head5";
let token: string;
let browserToken: string;
let configuration: { configuration_id: string; version: number };
const completedRuns: string[] = [];

async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const response = await request.fetch(`/api/v0${path}`, {
    method, headers: { Authorization: `Bearer ${token}` }, data,
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

function finalAnswer(value: Record<string, unknown>) {
  return `Prueba de contrato del workflow. Responde exactamente con esta conclusión, sin herramientas:\nFinal Answer: ${JSON.stringify(value)}`;
}

test.beforeAll(async ({ request }) => {
  expect(process.env.E2E_MANAGER_EMAIL, "Credenciales del runner real requeridas").toBeTruthy();
  const login = await request.post("/api/v0/auth/login", { data: {
    email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD,
  } });
  expect(login.ok(), await login.text()).toBeTruthy();
  token = (await login.json()).access_token;
  const releaseLogin = await request.post("/api/v0/auth/login", { data: {
    email: process.env.E2E_RELEASE_MANAGER_EMAIL, password: process.env.E2E_RELEASE_MANAGER_PASSWORD,
  } });
  expect(releaseLogin.ok(), await releaseLogin.text()).toBeTruthy();
  browserToken = (await releaseLogin.json()).access_token;
  // Repeated real runs can grow the schema catalog beyond one DynamoDB
  // page. The active schema must remain visible and present in that catalog.
  const activeSchema = await api(request, "GET", "/alert-schema/active");
  expect(activeSchema?.version).toBeGreaterThan(0);
  const schemaVersions = await api(request, "GET", "/alert-schema/versions");
  expect(schemaVersions.some((schema: { version: number }) => schema.version === activeSchema.version)).toBe(true);
  const active = await api(request, "GET", "/configurations/active");
  // Inactive, pinned configuration: no segment gates, scoring or playbooks
  // can intercept these routing scenarios. Real dataset, LLM and Celery;
  // the supported test-run prompt overrides select the branch under test.
  configuration = await api(request, "POST", "/configurations", {
    name: `E2E adversarial routes ${randomUUID()}`,
    description: "Contrato de las tres salidas del primer adversarial",
    general: active.general, infra: active.infra, test: active.test, segments: {},
  });
  expect((await api(request, "GET", `/datasets/${datasetName}/summary`)).status).toBe("READY");
});

test.afterAll(async ({ request }) => {
  if (completedRuns.length) {
    await api(request, "DELETE", "/test-runs", { test_run_ids: completedRuns });
  }
});

for (const scenario of [
  { decision: "pass", detector: "not_fraud", label: "Deja pasar", title: "Primer adversarial: deja pasar" },
  { decision: "scale_to_analyst", detector: "unknown", label: "Escala a analista humano", title: "Primer adversarial: escala a analista humano" },
  { decision: "handle_by_aria", detector: "fraud", label: "Gestiona ARIA", title: null },
]) {
  test(`primer adversarial real: ${scenario.decision}`, async ({ page, request }) => {
    const started = await api(request, "POST", "/test-runs", {
      name: `E2E adversarial ${scenario.decision}`, dataset_name: datasetName, sample_size: 1,
      config: {
        configuration_ref: { configuration_id: configuration.configuration_id, version: configuration.version },
        max_feedback_iterations: 1,
        prompt_overrides: {
          profiling: "Resume únicamente los datos recibidos en una frase breve, sin inferencias.",
          detector: finalAnswer({ is_fraud: scenario.detector, fraud_classification: "unknown", reasoning: "Evidencia del escenario de enrutamiento" }),
          detector_adversarial: finalAnswer({ decision: scenario.decision, has_issues: false, feedback: "", weak_points: [], reasoning: `Revisión independiente: ${scenario.decision}` }),
          classification: finalAnswer({ is_fraud: "fraud", fraud_classification: "unknown", reasoning: "Clasificación del escenario de gestión ARIA" }),
          adversarial: finalAnswer({ has_issues: false, feedback: "", weak_points: [], reasoning: "Clasificación revisada" }),
        },
      },
    });
    expect(started.dispatched_count).toBe(1);
    let run;
    await expect.poll(async () => {
      run = await api(request, "GET", `/test-runs/${started.test_run_id}`);
      return run.status;
    }, { timeout: 540_000, intervals: [1000, 2000] }).toBe("SUCCEEDED");
    completedRuns.push(started.test_run_id);
    const detail = await api(request, "GET", `/test-runs/${started.test_run_id}/cases/${run.cases[0].workflow_execution_id}`);
    expect(detail.status).toBe("SUCCEEDED");
    const steps = detail.steps as { step_name: string; output: Record<string, unknown> }[];
    const names = steps.map((step) => step.step_name);
    const review = steps.find((step) => step.step_name === "detector_adversarial")!.output;
    expect(review.decision).toBe(scenario.decision);
    expect(review.requires_classification_feedback).toBe(false);
    expect(names).toEqual(expect.arrayContaining(["detector", "detector_adversarial", "executor", "post_process"]));
    for (const name of ["classification", "adversarial", "analyst"]) {
      expect(names.includes(name)).toBe(scenario.decision === "handle_by_aria");
    }
    const execution = steps.find((step) => step.step_name === "executor")!.output;
    expect(execution.executed_action).toBe("simulated");
    if (scenario.decision !== "handle_by_aria") {
      expect(execution.proposed_action).toBe(scenario.decision);
      expect(steps.find((step) => step.step_name === "post_process")!.output.resolution_path).toBe(scenario.decision);
      expect(run.analyst_agreement_metrics.total).toBe(1);
    }
    await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), browserToken);
    await page.goto(`/testing/${started.test_run_id}`);
    await expect(page.getByRole("heading", { name: "Detección, revisión y clasificación" })).toBeVisible();
    await expect(page.getByText(scenario.label, { exact: true })).toBeVisible();
    if (scenario.title) await expect(page.getByText(scenario.title, { exact: true })).toBeVisible();
  });
}
