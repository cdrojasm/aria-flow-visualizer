import { expect, test, type Page } from "@playwright/test";

const scenarioId = "7e5d2c31-0d49-43f1-a576-8d7d5a0a8e42";

const draftScenario = {
  id: scenarioId,
  name: "E2E simulación categórica",
  status: "DRAFT",
  output_mode: "LIVE_PIPELINE",
  rate_schedule: [{ start_offset_seconds: 0, end_offset_seconds: 60, events_per_minute: 10 }],
  field_specs: { channel: { kind: "CATEGORICAL", weights: { OM: 3, GL: 1 } } },
  target_dataset_name: null,
  created_by: null,
  created_at: "2026-09-28T10:00:00Z",
  updated_at: "2026-09-28T10:00:00Z",
  started_at: null,
  events_emitted: 0,
  last_tick_offset_seconds: 0,
  error: null,
};

async function mockSimulationApi(page: Page) {
  let createdRequest: Record<string, unknown> | undefined;
  let started = false;

  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok"}' }),
  );
  await page.route("**/api/v0/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/v0/auth/me") {
      return json({ name: "Andrea Analista", email: "andrea@example.com", role: "data_analyst" });
    }
    if (path === "/api/v0/configurations") return json([]);
    if (path === "/api/v0/test-runs") return json([]);
    if (path === "/api/v0/scenarios" && request.method() === "GET") return json([]);
    if (path === "/api/v0/scenarios" && request.method() === "POST") {
      createdRequest = request.postDataJSON() as Record<string, unknown>;
      return json({ ...draftScenario, ...createdRequest });
    }
    if (path === `/api/v0/scenarios/${scenarioId}/preview` && request.method() === "POST") {
      return json([{ channel: "OM" }, { channel: "GL" }]);
    }
    if (path === `/api/v0/scenarios/${scenarioId}/start` && request.method() === "POST") {
      started = true;
      return json({ ...draftScenario, status: "RUNNING", started_at: "2026-09-28T10:01:00Z" });
    }
    if (path === `/api/v0/scenarios/${scenarioId}` && request.method() === "GET") {
      return json({
        ...draftScenario,
        status: started ? "COMPLETED" : "DRAFT",
        events_emitted: started ? 2 : 0,
        last_tick_offset_seconds: started ? 60 : 0,
      });
    }
    if (path === `/api/v0/scenarios/${scenarioId}/status`) {
      return json({
        scenario_id: scenarioId,
        status: started ? "COMPLETED" : "DRAFT",
        events_emitted: started ? 2 : 0,
        last_tick_offset_seconds: started ? 60 : 0,
        error: null,
      });
    }
    return json([]);
  });

  return () => createdRequest;
}

test("crea, previsualiza e inicia un escenario generado por distribución", async ({ page }) => {
  const getCreatedRequest = await mockSimulationApi(page);
  await page.addInitScript(() => localStorage.setItem("aria.auth.accessToken", "test-token"));

  // The supported deep link opens the same modal when a configuration asks
  // to be tested. It gives this end-to-end spec a deterministic entry point.
  await page.goto("/testing?configurationId=e2e-config");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("tab", { name: "Generador" }).click();

  await page
    .getByPlaceholder("Ej: Pico de fraude BreB fin de mes")
    .fill("E2E simulación categórica");
  await page.getByRole("button", { name: "Pipeline en vivo" }).click();
  await page.getByRole("combobox").selectOption("CATEGORICAL");
  await page.getByRole("button", { name: "+ Agregar opción" }).click();
  await page.getByPlaceholder("valor").fill("OM");
  await page.getByPlaceholder("peso").fill("3");
  await page.getByRole("button", { name: "Crear borrador" }).click();

  await expect(page.getByText("Borrador creado")).toBeVisible();
  expect(getCreatedRequest()).toMatchObject({
    name: "E2E simulación categórica",
    output_mode: "LIVE_PIPELINE",
    field_specs: { channel: { kind: "CATEGORICAL", weights: { OM: 3 } } },
  });

  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByText('"channel": "OM"')).toBeVisible();
  await page.getByRole("button", { name: "Iniciar" }).click();

  await expect(page).toHaveURL(`/testing/scenarios/${scenarioId}`);
  await expect(page.getByRole("heading", { name: "E2E simulación categórica" })).toBeVisible();
  await expect(page.getByText("COMPLETED")).toBeVisible();
  await expect(page.getByText("Eventos emitidos").locator("..")).toContainText("2");
});
