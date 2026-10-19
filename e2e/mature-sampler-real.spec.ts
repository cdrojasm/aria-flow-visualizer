import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Auth = { access_token: string };
type Settings = Record<string, unknown> & { sampler_strata: string[] };

async function login(api: APIRequestContext) {
  const response = await api.post("/api/v0/auth/login", {
    data: {
      email: process.env.E2E_MANAGER_EMAIL,
      password: process.env.E2E_MANAGER_PASSWORD,
    },
  });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function getSettings(api: APIRequestContext, token: string) {
  const response = await api.get("/api/v0/assistant-optimizer-settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `settings API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Settings>;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
}

test("H6 real: los campos del muestreador vienen del esquema y la vista previa usa la API", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
    "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.",
  );
  const manager = await login(request);
  const token = manager.access_token;
  const headers = { Authorization: `Bearer ${token}` };
  const original = await getSettings(request, token);
  const schemaConfigurationResponse = await request.get(
    "/api/v0/assistant-optimizer-settings/sampler/schema-configuration",
    { headers },
  );
  expect(
    schemaConfigurationResponse.ok(),
    `configuración de campos: ${await schemaConfigurationResponse.text()}`,
  ).toBeTruthy();
  const originalSchemaConfiguration = await schemaConfigurationResponse.json();
  const operationalResponse = await request.get("/api/v0/operational-settings", { headers });
  expect(
    operationalResponse.ok(),
    `operational settings: ${await operationalResponse.text()}`,
  ).toBeTruthy();
  const originalOperational = (await operationalResponse.json()) as Record<string, unknown>;
  const poolResponse = await request.get("/api/v0/assistant-optimizer-settings/sampler/fields", {
    headers,
  });
  expect(poolResponse.ok(), `pool de esquema: ${await poolResponse.text()}`).toBeTruthy();
  const pool = (await poolResponse.json()) as string[];
  test.skip(pool.length === 0, "El esquema compatible no tiene campos seleccionables.");
  const field = pool[0];
  const initialMarkField = originalSchemaConfiguration.initial_mark_fields[0]?.field as
    string | undefined;
  const initialDateOption = originalSchemaConfiguration.initial_marking_date_fields[0];
  const latestDateOption = originalSchemaConfiguration.marking_date_fields.find(
    (option: { field: string }) => option.field !== initialDateOption?.field,
  );
  const initialMarkingDateField = initialDateOption?.field as string | undefined;
  const targetField = originalSchemaConfiguration.target_fields[0]?.field as string | undefined;
  const markingDateField = latestDateOption?.field as string | undefined;
  test.skip(
    !initialMarkField || !initialMarkingDateField || !targetField || !markingDateField,
    "El esquema E2E no expone la marca inicial, etiqueta vigente y ambas fechas.",
  );

  try {
    const operationalUpdate = await request.put("/api/v0/operational-settings", {
      headers,
      data: { settings: { ...originalOperational, maturing_days: 0 } },
    });
    expect(
      operationalUpdate.ok(),
      `maturing_days=0: ${await operationalUpdate.text()}`,
    ).toBeTruthy();
    await authenticatePage(page, token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Asistente y optimizador" }).click();
    const sampler = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Muestreo de datos" }),
    });
    await expect(sampler).toBeVisible();
    await sampler.getByLabel("Campo de marca inicial (esquema)").selectOption(initialMarkField!);
    await sampler
      .getByLabel("Fecha de marca inicial (esquema)")
      .selectOption(initialMarkingDateField!);
    await sampler.getByLabel("Etiqueta vigente (esquema)").selectOption(targetField!);
    await sampler.getByLabel("Fecha de última marcación (esquema)").selectOption(markingDateField!);
    await sampler
      .getByLabel("Equivalencias de etiqueta (JSON)")
      .fill(JSON.stringify({ Fraude: "fraud", "No fraude": "no_fraud" }, null, 2));
    await sampler.getByRole("button", { name: "Guardar marcas, fechas y equivalencias" }).click();
    await expect
      .poll(async () => {
        const response = await request.get(
          "/api/v0/assistant-optimizer-settings/sampler/schema-configuration",
          { headers },
        );
        const saved = await response.json();
        return saved.mapping;
      })
      .toMatchObject({
        initial_mark_field: initialMarkField,
        initial_marking_date_field: initialMarkingDateField,
        target_field: targetField,
        marking_date_field: markingDateField,
      });
    const alertResponse = await request.post("/api/v0/alerts/test", {
      headers,
      data: {
        event: {
          eventid: crypto.randomUUID(),
          eventtype: "transferencia",
          customerid: `e2e-${crypto.randomUUID()}`,
          channel: "web",
          amount_value: 120000,
          fecha_transaccion: new Date().toISOString(),
          [initialMarkField!]: "risk-suspected",
          [initialMarkingDateField!]: new Date().toISOString(),
          [targetField!]: "No fraude",
          [markingDateField!]: new Date().toISOString(),
          integrationpoint: "PSE",
          transactionid: crypto.randomUUID(),
          triggered_rules: "H6_MATURE_SAMPLE_E2E",
        },
      },
    });
    expect(alertResponse.status(), `alert intake: ${await alertResponse.text()}`).toBe(202);
    const alert = (await alertResponse.json()) as { alert_id: string };
    const reviewResponse = await request.post(`/api/v0/alerts/${alert.alert_id}/fraud-review`, {
      headers,
      data: { fraud_label: "no_fraud", note: "H6 real E2E sample" },
    });
    expect(reviewResponse.ok(), `fraud review: ${await reviewResponse.text()}`).toBeTruthy();
    await expect(sampler.getByLabel("Campo de marca inicial (esquema)")).toHaveValue(
      initialMarkField!,
    );
    await expect(sampler.getByLabel("Fecha de marca inicial (esquema)")).toHaveValue(
      initialMarkingDateField!,
    );
    await expect(sampler.getByLabel("Etiqueta vigente (esquema)")).toHaveValue(targetField!);
    await expect(sampler.getByLabel("Fecha de última marcación (esquema)")).toHaveValue(
      markingDateField!,
    );
    await sampler.getByLabel(field, { exact: true }).check();
    await sampler.getByRole("switch").first().click();
    await sampler.getByRole("button", { name: "Guardar sección" }).click();
    await expect
      .poll(async () => (await getSettings(request, token)).sampler_strata)
      .toContain(field);
    await sampler.getByRole("button", { name: "Vista previa del muestreo" }).click();
    await expect(
      sampler.getByRole("status").filter({ hasText: "Alertas elegibles:" }),
    ).toBeVisible();
    await sampler.getByRole("button", { name: "Crear muestra madura" }).click();
    const runText = await sampler
      .getByRole("status")
      .filter({ hasText: "Ejecución de muestreo" })
      .textContent();
    const operationId = runText?.match(/[0-9a-f-]{36}/i)?.[0];
    expect(operationId).toBeTruthy();
    let completed: {
      status: string;
      done: boolean;
      result: Record<string, unknown> | null;
    } | null = null;
    await expect
      .poll(
        async () => {
          const response = await request.get(`/api/v0/async-operations/${operationId}/poll`, {
            headers,
          });
          expect(response.ok(), `poll de muestreo: ${await response.text()}`).toBeTruthy();
          completed = (await response.json()) as typeof completed;
          return completed?.status;
        },
        { timeout: 180_000, intervals: [1_000, 2_000, 5_000] },
      )
      .toBe("SUCCEEDED");
    expect(completed?.done).toBe(true);
    const result = completed?.result as Record<string, unknown>;
    expect(Object.keys(result.dataset_refs as Record<string, string>).sort()).toEqual(
      ["all", "final", "test", "training", "validation"].sort(),
    );
    expect(Object.keys(result.partition_counts as Record<string, number>).sort()).toEqual(
      ["final", "test", "training", "validation"].sort(),
    );
    expect(result.content_hash).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    const schemaRestored = await request.put(
      "/api/v0/assistant-optimizer-settings/sampler/schema-configuration",
      { headers, data: originalSchemaConfiguration.mapping },
    );
    expect(
      schemaRestored.ok(),
      `restauración mapping: ${await schemaRestored.text()}`,
    ).toBeTruthy();
    const restored = await request.put("/api/v0/assistant-optimizer-settings", {
      headers,
      data: { settings: original },
    });
    expect(
      restored.ok(),
      `restauración de sampler settings: ${await restored.text()}`,
    ).toBeTruthy();
    const operationalRestored = await request.put("/api/v0/operational-settings", {
      headers,
      data: { settings: originalOperational },
    });
    expect(
      operationalRestored.ok(),
      `restauración operational: ${await operationalRestored.text()}`,
    ).toBeTruthy();
  }
});
