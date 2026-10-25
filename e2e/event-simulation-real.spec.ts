import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(360_000);

const seedDatasetName = process.env.E2E_SIMULATION_SEED_DATASET ?? "Muestra_total_ARIA_JUl_head5";
const realApi = process.env.ARIA_E2E_REAL === "1";

type Auth = { id: string; access_token: string };
type Scenario = {
  id: string;
  status: string;
  events_emitted: number;
  output_mode: "DATASET" | "LIVE_PIPELINE";
  target_dataset_name: string | null;
  field_specs: Record<string, unknown>;
};

async function login(
  api: APIRequestContext,
  email: string,
  password: string,
  label: string,
): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `${label} login: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function getJson(api: APIRequestContext, token: string, path: string) {
  const response = await api.get(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function postJson(api: APIRequestContext, token: string, path: string, data?: unknown) {
  const response = await api.post(path, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function deleteScenario(api: APIRequestContext, token: string, id: string) {
  const response = await api.delete(`/api/v0/scenarios/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status(), await response.text()).toBe(204);
  const missing = await api.get(`/api/v0/scenarios/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(missing.status()).toBe(404);
}

async function deleteDataset(api: APIRequestContext, token: string, name: string) {
  const response = await api.delete(`/api/v0/datasets/${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status() === 404) return;
  expect(response.status(), await response.text()).toBe(202);
  const operation = (await response.json()) as { async_operation_id?: string };
  if (operation.async_operation_id) {
    await expect
      .poll(
        async () =>
          getJson(api, token, `/api/v0/async-operations/${operation.async_operation_id}/poll`),
        { timeout: 180_000, intervals: [1000, 2000, 5000] },
      )
      .toMatchObject({ done: true, status: "SUCCEEDED" });
  }
  await expect
    .poll(
      async () => {
        const datasets = (await getJson(api, token, "/api/v0/datasets")) as {
          name: string;
        }[];
        return datasets.some((item) => item.name === name);
      },
      { timeout: 60_000, intervals: [1000, 2000, 5000] },
    )
    .toBe(false);
}

async function useToken(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
}

test("E06 real: seed, vista previa, pipeline/dataset, ciclo de vida y limpieza", async ({
  page,
  request,
}) => {
  test.skip(!realApi, "Ejecuta con npm run test:e2e:simulation para usar API real por nginx.");
  if (
    !process.env.E2E_MANAGER_EMAIL ||
    !process.env.E2E_MANAGER_PASSWORD ||
    !process.env.E2E_RELEASE_MANAGER_EMAIL ||
    !process.env.E2E_RELEASE_MANAGER_PASSWORD
  ) {
    throw new Error("E06 real requiere credenciales E2E de manager y release_manager.");
  }

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
  const datasets = (await getJson(request, manager.access_token, "/api/v0/datasets")) as {
    name: string;
  }[];
  expect(
    datasets.some((dataset) => dataset.name === seedDatasetName),
    `El seed E2E debe crear el dataset ${seedDatasetName}`,
  ).toBeTruthy();
  const seededSpecs = (await postJson(
    request,
    manager.access_token,
    "/api/v0/scenarios/seed-from-dataset",
    { dataset_name: seedDatasetName },
  )) as Record<string, { kind: string; weights?: Record<string, number> }>;
  expect(seededSpecs.tipo).toBeUndefined();
  expect(seededSpecs.marcacion_final).toBeUndefined();
  expect(seededSpecs.amount_value?.kind).toMatch(/^(NORMAL|LOGNORMAL|POISSON)$/);
  expect(seededSpecs.channel?.kind).toBe("CATEGORICAL");
  expect(
    Object.keys(seededSpecs.customerid?.weights ?? {}).every((value) =>
      value.startsWith("synthetic_customer_id_"),
    ),
  ).toBeTruthy();

  const invalidDatasetScenario = await request.post("/api/v0/scenarios", {
    headers: { Authorization: `Bearer ${manager.access_token}` },
    data: {
      name: `E06 missing target ${Date.now()}`,
      output_mode: "DATASET",
      rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 60, events_per_minute: 1 }],
      field_specs: seededSpecs,
    },
  });
  expect(invalidDatasetScenario.status()).toBe(400);

  const unique = Date.now();
  const destinationDataset = `e2e-simulation-output-${unique}`;
  const datasetCreate = await request.post("/api/v0/datasets/empty", {
    headers: { Authorization: `Bearer ${manager.access_token}` },
    data: {
      name: destinationDataset,
      fields: ["eventId", "eventid", "eventtype", "channel", "amount_value"],
    },
  });
  expect(datasetCreate.status(), await datasetCreate.text()).toBe(201);

  const scenarioIds: string[] = [];
  let primaryFailure: unknown;
  try {
    await useToken(page, release.access_token);
    await page.goto("/testing?configurationId=e2e-simulation");
    // The launch UI is the shared right-hand SideDrawer (an ARIA dialog).
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Nueva prueba" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Generador" }).click();
    await page.getByPlaceholder("Ej: Pico de fraude BreB fin de mes").fill(`E06 dataset ${unique}`);
    await page
      .getByRole("combobox", { name: "Dataset para sembrar" })
      .selectOption(seedDatasetName);
    await page.getByRole("button", { name: "Sembrar desde dataset" }).click();
    await expect(page.getByTestId("scenario-field-editor").first()).toBeVisible();

    // Keep a traceable event identifier alongside the schema-mapped field.
    const eventId = `e2e-simulator-${unique}`;
    const eventIdField = page.locator(
      '[data-testid="scenario-field-editor"][data-field-name="eventid"]',
    );
    await expect(eventIdField).toBeVisible();
    await eventIdField.locator("select").selectOption("CONSTANT");
    await eventIdField.locator("input").nth(1).fill(eventId);

    await page.getByRole("button", { name: /Agregar campo/ }).click();
    const extraField = page.locator('[data-testid="scenario-field-editor"][data-field-name=""]');
    await extraField.locator("input").first().fill("eventId");
    await page
      .locator('[data-testid="scenario-field-editor"][data-field-name="eventId"]')
      .locator("input")
      .nth(1)
      .fill(eventId);

    await page.getByPlaceholder("Nombre exacto de un dataset existente").fill(destinationDataset);
    // A high, short rate makes the worker emit rows promptly while keeping
    // this integration scenario bounded and local to its temporary dataset.
    await page.locator('input[type="number"]').nth(2).fill("60");
    const createResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/v0/scenarios" && response.request().method() === "POST";
    });
    await page.getByRole("button", { name: "Crear borrador" }).click();
    const response = await createResponse;
    expect(response.status(), await response.text()).toBe(201);
    const datasetScenario = (await response.json()) as Scenario;
    scenarioIds.push(datasetScenario.id);
    expect(datasetScenario.status).toBe("DRAFT");
    expect(datasetScenario.output_mode).toBe("DATASET");
    expect(datasetScenario.field_specs.eventId).toMatchObject({ kind: "CONSTANT", value: eventId });

    await page.getByRole("button", { name: "Vista previa" }).click();
    await expect(page.getByText("Filas de ejemplo")).toBeVisible();
    await expect(page.locator("pre").last()).toContainText(eventId);
    const previewResponse = await postJson(
      request,
      manager.access_token,
      `/api/v0/scenarios/${datasetScenario.id}/preview?count=5`,
    );
    expect(previewResponse).toHaveLength(5);
    expect(previewResponse[0].amount_value).toEqual(expect.any(Number));
    expect(previewResponse[0].tipo).toBeUndefined();
    expect(previewResponse[0].marcacion_final).toBeUndefined();
    expect(previewResponse[0].customerid).toMatch(/^synthetic_customer_id_/);
    const seedRowsResponse = (await getJson(
      request,
      manager.access_token,
      `/api/v0/datasets/${encodeURIComponent(seedDatasetName)}/rows?offset=0&limit=50`,
    )) as { rows: { channel: string }[] };
    const expectedChannelWeights = Object.fromEntries(
      [...new Set(seedRowsResponse.rows.map((row) => row.channel))].map((channel) => [
        channel,
        seedRowsResponse.rows.filter((row) => row.channel === channel).length,
      ]),
    );
    const previewRows = (await postJson(
      request,
      manager.access_token,
      `/api/v0/scenarios/${datasetScenario.id}/preview?count=100`,
    )) as Record<string, unknown>[];
    expect(previewRows).toHaveLength(100);
    const observedChannelCounts = previewRows.reduce<Record<string, number>>((counts, row) => {
      const channel = String(row.channel);
      counts[channel] = (counts[channel] ?? 0) + 1;
      return counts;
    }, {});
    for (const [channel, count] of Object.entries(expectedChannelWeights)) {
      expect(datasetScenario.field_specs.channel).toHaveProperty("weights");
      const expectedShare = count / seedRowsResponse.rows.length;
      const observedShare = (observedChannelCounts[channel] ?? 0) / previewRows.length;
      expect(
        Math.abs(observedShare - expectedShare),
        `channel ${channel} distribution`,
      ).toBeLessThan(0.15);
    }
    for (const row of previewRows) {
      expect(row.amount_value).toEqual(expect.any(Number));
      expect(row.customerid).toMatch(/^synthetic_customer_id_/);
      expect(row.tipo).toBeUndefined();
      expect(row.marcacion_final).toBeUndefined();
    }
    await page.getByRole("button", { name: "Iniciar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/testing/scenarios/${datasetScenario.id}$`));
    await expect(page.getByRole("heading", { name: `E06 dataset ${unique}` })).toBeVisible();
    await expect(page.getByText("RUNNING", { exact: true })).toBeVisible();

    await expect
      .poll(
        async () => {
          const status = await getJson(
            request,
            manager.access_token,
            `/api/v0/scenarios/${datasetScenario.id}/status`,
          );
          return status.events_emitted as number;
        },
        { timeout: 90_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const rows = await getJson(
            request,
            manager.access_token,
            `/api/v0/datasets/${encodeURIComponent(destinationDataset)}/rows?offset=0&limit=50`,
          );
          return rows.total as number;
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);
    const emittedRows = (await getJson(
      request,
      manager.access_token,
      `/api/v0/datasets/${encodeURIComponent(destinationDataset)}/rows?offset=0&limit=50`,
    )) as { rows: Record<string, unknown>[] };
    expect(emittedRows.rows[0]).toHaveProperty("eventId", eventId);
    const runningDelete = await request.delete(`/api/v0/scenarios/${datasetScenario.id}`, {
      headers: { Authorization: `Bearer ${manager.access_token}` },
    });
    expect(runningDelete.status()).toBe(400);
    await page.getByRole("button", { name: "Detener" }).click();
    await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${datasetScenario.id}`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "COMPLETED" });

    // Exercise LIVE_PIPELINE through the real simulator worker and prove the
    // emitted event is registered as simulator-origin traffic in alert history.
    const liveScenario = (await postJson(request, manager.access_token, "/api/v0/scenarios", {
      name: `E06 pipeline ${unique}`,
      output_mode: "LIVE_PIPELINE",
      rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 300, events_per_minute: 30 }],
      field_specs: datasetScenario.field_specs,
    })) as Scenario;
    scenarioIds.push(liveScenario.id);
    await postJson(request, manager.access_token, `/api/v0/scenarios/${liveScenario.id}/start`);
    await expect
      .poll(
        async () => {
          const status = await getJson(
            request,
            manager.access_token,
            `/api/v0/scenarios/${liveScenario.id}/status`,
          );
          return status.events_emitted as number;
        },
        { timeout: 90_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);

    const from = new Date(Date.now() - 5 * 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    let matchingAlert: { alert_id: string; event_id: string; origin: string } | undefined;
    await expect
      .poll(
        async () => {
          const history = await getJson(
            request,
            manager.access_token,
            `/api/v0/alerts/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`,
          );
          matchingAlert = history.items.find(
            (item: { event_id: string; origin: string }) =>
              item.event_id === eventId && item.origin === "simulator",
          );
          return matchingAlert?.event_id ?? null;
        },
        { timeout: 90_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(eventId);
    const alertDetail = await getJson(
      request,
      manager.access_token,
      `/api/v0/analyst-queue/${matchingAlert!.alert_id}`,
    );
    expect(alertDetail.event_id).toBe(eventId);
    expect(alertDetail.workflow_execution_id).toBeTruthy();
    expect(alertDetail.workflow_status).toBeTruthy();
    await postJson(request, manager.access_token, `/api/v0/scenarios/${liveScenario.id}/stop`);
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${liveScenario.id}/status`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "COMPLETED" });

    const lifecycle = (await postJson(request, manager.access_token, "/api/v0/scenarios", {
      name: `E06 lifecycle ${unique}`,
      output_mode: "LIVE_PIPELINE",
      rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 3600, events_per_minute: 0 }],
      field_specs: { eventId: { kind: "CONSTANT", value: `e2e-lifecycle-${unique}` } },
    })) as Scenario;
    scenarioIds.push(lifecycle.id);
    expect(lifecycle.status).toBe("DRAFT");
    await postJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/start`);
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/status`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "RUNNING" });
    await postJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/pause`);
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/status`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "PAUSED" });
    await postJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/start`);
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/status`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "RUNNING" });
    await postJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/stop`);
    await expect
      .poll(
        () => getJson(request, manager.access_token, `/api/v0/scenarios/${lifecycle.id}/status`),
        { timeout: 30_000 },
      )
      .toMatchObject({ status: "COMPLETED" });
    const invalidRestart = await request.post(`/api/v0/scenarios/${lifecycle.id}/start`, {
      headers: { Authorization: `Bearer ${manager.access_token}` },
    });
    expect(invalidRestart.status()).toBe(400);

    for (const scenarioId of scenarioIds) {
      await deleteScenario(request, manager.access_token, scenarioId);
    }
    scenarioIds.length = 0;
    await deleteDataset(request, manager.access_token, destinationDataset);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    // Best effort cleanup on failure without masking the assertion or API
    // error that caused the test to fail.
    if (primaryFailure) {
      for (const scenarioId of scenarioIds) {
        try {
          const headers = { Authorization: `Bearer ${manager.access_token}` };
          const status = await request.get(`/api/v0/scenarios/${scenarioId}/status`, { headers });
          if (status.ok()) {
            const { status: state } = (await status.json()) as { status: string };
            if (state === "RUNNING" || state === "PAUSED") {
              await request.post(`/api/v0/scenarios/${scenarioId}/stop`, { headers });
            }
          }
          await request.delete(`/api/v0/scenarios/${scenarioId}`, { headers });
        } catch {
          console.warn(`E06 could not clean scenario ${scenarioId}.`);
        }
      }
      try {
        await deleteDataset(request, manager.access_token, destinationDataset);
      } catch {
        console.warn(`E06 could not clean dataset ${destinationDataset}.`);
      }
    }
  }
});
