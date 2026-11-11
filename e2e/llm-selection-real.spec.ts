import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Selección de modelo LLM por elemento, de punta a punta por nginx:
 * catálogo (ConfigMap) -> selector en Configuración -> versión guardada ->
 * selector en "Nueva prueba" -> alerta procesada con el despliegue efectivo
 * registrado en cada paso y visible en el detalle de la alerta.
 */
test.setTimeout(600_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const channelManagerEmail = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const channelManagerPassword = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
const workflowTimeoutMs = Number(process.env.E2E_WORKFLOW_TIMEOUT ?? "540") * 1000;
const FIXTURE = resolve(process.cwd(), "e2e/fixtures/muestra_total_aria_head5.csv");

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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

function oneRowDataset(): Buffer {
  const [header, firstRow] = readFileSync(FIXTURE, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  return Buffer.from(`${header}\n${firstRow}\n`, "utf8");
}

async function openConfiguration(page: Page, name: string) {
  await page.goto("/configuracion");
  await expect(page.getByRole("heading", { name: "Configuración del Agente" })).toBeVisible();
  const configSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Configuraciones" }) });
  const configPicker = configSection
    .getByRole("button", { name: "Configuración", exact: true })
    .locator("..");
  await configPicker.getByRole("button", { name: "Configuración", exact: true }).click();
  const row = configPicker.getByRole("button").filter({ hasText: name }).last();
  await expect(row).toBeVisible();
  await row.click();
}

test("modelo LLM por elemento: catálogo, configuración, prueba y deployment efectivo", async ({
  page,
  request,
}) => {
  test.skip(
    !managerEmail || !managerPassword || !channelManagerEmail || !channelManagerPassword,
    "Define E2E_MANAGER_* y E2E_CHANNEL_MANAGER_*.",
  );
  const managerToken = await login(request, managerEmail!, managerPassword!);
  const channelToken = await login(request, channelManagerEmail!, channelManagerPassword!);
  const headers = { Authorization: `Bearer ${managerToken}` };
  const channelHeaders = { Authorization: `Bearer ${channelToken}` };

  // 1. El catálogo viene del ConfigMap (solo lectura) y lista todos los elementos.
  const catalogResponse = await request.get(`${baseURL}/api/v0/llm-catalog`, { headers });
  expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
  const catalog = (await catalogResponse.json()) as {
    entries: { name: string; deployment: string }[];
    elements: { element: string; group: string }[];
  };
  const principal = catalog.entries.find((entry) => entry.name === "GPT-5.2");
  const alterno = catalog.entries.find((entry) => entry.name === "GPT-5 mini");
  expect(principal && alterno, "LLM_CATALOG local debe traer 'GPT-5.2' y 'GPT-5 mini'").toBeTruthy();
  expect(catalog.elements.map((e) => e.element)).toEqual(
    expect.arrayContaining([
      "profiling",
      "detector",
      "detector_adversarial",
      "classification",
      "adversarial",
      "analyst",
      "executor",
      "report",
      "judge",
      "history_research",
      "assistant_chat",
      "optimizer",
      "agent_drafts",
    ]),
  );
  expect((await request.post(`${baseURL}/api/v0/llm-catalog`, { headers })).status()).toBe(405);

  // 2. Una configuración aislada, basada en la activa.
  const active = (await (
    await request.get(`${baseURL}/api/v0/configurations/active`, { headers: channelHeaders })
  ).json()) as Json;
  const configName = `E2E llm ${randomUUID()}`;
  const seedResponse = await request.post(`${baseURL}/api/v0/configurations`, {
    headers: channelHeaders,
    data: {
      name: configName,
      description: "Configuración aislada para la selección de modelo LLM.",
      general: active.general,
      infra: active.infra,
      test: active.test,
      segments: active.segments,
    },
  });
  expect(seedResponse.status(), await seedResponse.text()).toBe(201);
  const seed = (await seedResponse.json()) as Json;

  // Un nombre fuera del catálogo se rechaza al guardar (422), sin versión nueva.
  const invalid = await request.post(`${baseURL}/api/v0/configurations`, {
    headers: channelHeaders,
    data: {
      name: seed.name,
      configuration_id: seed.configuration_id,
      based_on_version: seed.version,
      general: { ...seed.general, llm_selection: { detector: "inexistente" } },
      infra: seed.infra,
      test: seed.test,
      segments: seed.segments,
    },
  });
  expect(invalid.status(), await invalid.text()).toBe(422);

  // 3. UI: elegir modelos en Configuración > General y crear la versión.
  await authenticatePage(page, channelToken);
  await openConfiguration(page, configName);
  await page.getByRole("button", { name: /Crear nueva versión basada en/ }).click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(page.getByText("Modelo de lenguaje por elemento")).toBeVisible();
  for (const element of catalog.elements) {
    await expect(page.getByTestId(`llm-select-${element.element}`)).toBeVisible();
  }
  await expect(page.getByTestId("llm-select-detector")).toHaveValue("");
  await page.getByTestId("llm-select-detector").selectOption("GPT-5 mini");
  await page.getByTestId("llm-select-judge").selectOption("GPT-5.2");
  await page.getByRole("button", { name: "Crear versión", exact: true }).click();
  const confirm = page.getByRole("button", { name: /^(Confirmar|Guardar|Crear versión)$/ }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();

  await expect
    .poll(
      async () => {
        const versions = (await (
          await request.get(
            `${baseURL}/api/v0/configurations/${encodeURIComponent(seed.configuration_id)}`,
            { headers: channelHeaders },
          )
        ).json()) as Json[];
        const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
        if (latest.version === seed.version) return null;
        const detail = (await (
          await request.get(
            `${baseURL}/api/v0/configurations/${encodeURIComponent(seed.configuration_id)}/versions/${latest.version}`,
            { headers: channelHeaders },
          )
        ).json()) as Json;
        return { version: latest.version, selection: detail.general.llm_selection };
      },
      { timeout: 60_000, intervals: [1_500] },
    )
    .toMatchObject({ selection: { detector: "GPT-5 mini", judge: "GPT-5.2" } });
  const versionsNow = (await (
    await request.get(
      `${baseURL}/api/v0/configurations/${encodeURIComponent(seed.configuration_id)}`,
      { headers: channelHeaders },
    )
  ).json()) as Json[];
  const savedVersion = Math.max(...versionsNow.map((v) => v.version));

  // La selección persiste al recargar.
  await page.reload();
  await openConfiguration(page, configName);
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(page.getByTestId("llm-select-detector")).toHaveValue("GPT-5 mini");
  await expect(page.getByTestId("llm-select-judge")).toHaveValue("GPT-5.2");

  // 4. UI: "Nueva prueba" con la versión guardada y un modelo elegido para el perfilamiento.
  const datasetName = `E2E_llm_${randomUUID().slice(0, 8)}`;
  const upload = await request.post(`${baseURL}/api/v0/datasets`, {
    headers,
    multipart: {
      file: { name: `${datasetName}.csv`, mimeType: "text/csv", buffer: oneRowDataset() },
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

    const testerPage = await page.context().newPage();
    await authenticatePage(testerPage, managerToken);
    await testerPage.goto(
      `/testing?configurationId=${encodeURIComponent(seed.configuration_id)}&version=${savedVersion}`,
    );
    await testerPage.getByText(datasetName, { exact: true }).first().click();
    await testerPage.getByTestId("toggle-model-overrides").click();
    // Los pasos del workflow se listan; el resto de componentes no aplica a una prueba.
    await expect(testerPage.getByTestId("run-llm-select-profiling")).toBeVisible();
    await expect(testerPage.getByTestId("run-llm-select-judge")).toHaveCount(0);
    await testerPage.getByTestId("run-llm-select-profiling").selectOption("GPT-5.2");
    const startResponse = testerPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v0/test-runs") && response.request().method() === "POST",
    );
    await testerPage.getByRole("button", { name: "Iniciar prueba" }).click();
    const started = await startResponse;
    expect(started.status(), await started.text()).toBe(202);
    expect(started.request().postDataJSON().config.model_overrides).toEqual({
      profiling: "GPT-5.2",
    });
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
    expect(run.config.model_overrides).toEqual({ profiling: "GPT-5.2" });
    expect(run.cases).toHaveLength(1);
    const detail = (await (
      await request.get(
        `${baseURL}/api/v0/test-runs/${runId}/cases/${run.cases[0].workflow_execution_id}`,
        { headers },
      )
    ).json()) as { alert_id: string; steps: { step_name: string; output: Json | null }[] };

    // 5. Cada paso con LLM registra el deployment efectivo y de dónde salió.
    const llmOf = (step: string) => detail.steps.find((s) => s.step_name === step)?.output?.llm;
    expect(llmOf("profiling")).toMatchObject({
      name: "GPT-5.2",
      deployment: principal!.deployment,
      source: "override",
    });
    expect(llmOf("detector")).toMatchObject({
      name: "GPT-5 mini",
      deployment: alterno!.deployment,
      source: "configuration",
    });
    expect(llmOf("classification")).toMatchObject({ name: null, source: "default" });

    // 6. El detalle de la alerta muestra el modelo de cada paso.
    await authenticatePage(page, managerToken);
    await page.goto(`/alerta/${detail.alert_id}`);
    const badges = page.getByTestId("step-llm");
    await expect(badges.first()).toBeVisible({ timeout: 30_000 });
    await expect(badges.filter({ hasText: "GPT-5.2" }).first()).toBeVisible();
    await expect(badges.filter({ hasText: "GPT-5 mini" }).first()).toBeVisible();
  } finally {
    await request.delete(`${baseURL}/api/v0/datasets/${datasetName}`, { headers });
  }
});
