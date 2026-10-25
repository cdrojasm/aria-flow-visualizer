import { readFile } from "node:fs/promises";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_FRAUD_REVIEW_EMAIL;
const password = process.env.E2E_FRAUD_REVIEW_PASSWORD;
const bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN;
const userName = "ARIA E08 fraud-review E2E";

async function openFraudHistory(page: Page, accessToken: string) {
  await page.addInitScript(
    (tokenValue) => localStorage.setItem("aria.auth.accessToken", tokenValue),
    accessToken,
  );
  await page.goto("/historico-fraude");
  await expect(
    page.getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…"),
  ).toBeVisible();
}

async function token(request: APIRequestContext) {
  const response = await request.post(`${baseURL}/api/v0/auth/login`, {
    data: { email, password },
  });
  expect(response.ok(), response.ok() ? "" : await response.text()).toBeTruthy();
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function provisionUser(request: APIRequestContext) {
  const headers = { "X-Bootstrap-Token": bootstrapToken! };
  const listed = await request.get(`${baseURL}/api/v0/auth/users`, { headers });
  expect(listed.ok(), listed.ok() ? "" : await listed.text()).toBeTruthy();
  const users = (await listed.json()) as Array<{ id: string; email: string }>;
  const existing = users.find((user) => user.email === email);
  if (existing) {
    const reset = await request.put(`${baseURL}/api/v0/auth/users/${existing.id}/password`, {
      headers,
      data: { password },
    });
    expect(reset.ok(), reset.ok() ? "" : await reset.text()).toBeTruthy();
    return;
  }

  const created = await request.post(`${baseURL}/api/v0/auth/users`, {
    headers,
    data: { email, password, name: userName, role: "manager" },
  });
  expect(created.status(), await created.text()).toBe(201);
}

test("E08 real: marca, remarca y consulta el histórico de revisiones", async ({
  page,
  request,
}) => {
  test.skip(
    !email || !password || !bootstrapToken,
    "El runner local debe proporcionar credenciales efímeras y el token bootstrap temporal.",
  );

  await provisionUser(request);
  const accessToken = await token(request);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const eventId = `E08-${Date.now()}`;
  const created = await request.post(`${baseURL}/api/v0/alerts/test`, {
    headers,
    data: {
      event: {
        eventId,
        eventType: "E2E fraud review",
        customerId: `E08-CUSTOMER-${Date.now()}`,
        eventid: eventId,
        eventtype: "E2E fraud review",
        customerid: `E08-CUSTOMER-${Date.now()}`,
        fecha_transaccion: new Date().toISOString(),
        channel: "E2E",
        integrationpoint: "E08",
        amount_value: 1000,
      },
    },
  });
  expect(created.ok(), created.ok() ? "" : await created.text()).toBeTruthy();
  const { alert_id: alertId } = (await created.json()) as { alert_id: string };

  // Seed a deterministic state using the same audited business API.
  for (const label of ["fraud", "no_fraud"] as const) {
    const reviewed = await request.post(`${baseURL}/api/v0/alerts/${alertId}/fraud-review`, {
      headers,
      data: { fraud_label: label, note: `E08 setup ${label}` },
    });
    expect(reviewed.ok(), await reviewed.text()).toBeTruthy();
  }

  let historyPage: {
    items: Array<{ alert_id: string; event_id: string; fraud_review_count: number }>;
  } = { items: [] };
  await expect
    .poll(
      async () => {
        const history = await request.get(`${baseURL}/api/v0/alerts/history?limit=50`, { headers });
        expect(history.ok(), history.ok() ? "" : await history.text()).toBeTruthy();
        historyPage = (await history.json()) as typeof historyPage;
        return historyPage.items.some(
          (item) =>
            item.alert_id === alertId && item.event_id === eventId && item.fraud_review_count === 2,
        );
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);

  await openFraudHistory(page, accessToken);
  const search = page.getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…");
  await search.fill(eventId);
  // The event id is searchable but not printed in the table: the search leaves one data row.
  const table = page.getByRole("table").first();
  await expect(table.getByRole("row")).toHaveCount(2);
  const row = table.getByRole("row").nth(1);
  await expect(row).toBeVisible();
  await expect(row).toContainText("2");
  await expect(row).toContainText("No fraude");

  await row.getByRole("button", { name: "Revisar fraude" }).click();
  await page.getByRole("button", { name: "Fraude", exact: true }).click();
  await page.getByLabel(/Nota/).fill("E08: corrección confirmada desde la interfaz");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(row).toContainText("3");

  await row.getByRole("button", { name: "Auditoría" }).click();
  const trail = page.getByRole("dialog");
  const reviewRows = trail.getByRole("row");
  await expect(reviewRows).toHaveCount(4); // header + three append-only reviews
  await expect(reviewRows.nth(1)).toContainText("Pendiente → Fraude");
  await expect(trail).toContainText("E08 setup fraud");
  await expect(reviewRows.nth(2)).toContainText("Fraude → No fraude");
  await expect(trail).toContainText("E08 setup no_fraud");
  await expect(trail).toContainText("E08: corrección confirmada desde la interfaz");
  await expect(reviewRows.nth(3)).toContainText("No fraude → Fraude");
});

// "Descargar plantilla" and "Cargar CSV de revisiones" on the fraud history page.
test.describe("E08 CSV de revisiones", () => {
  const csvInput = (page: Page) => page.getByTestId("fraud-review-csv-input");
  const panelFor = (page: Page, fileName: string) =>
    page.locator("section").filter({ hasText: fileName }).first();
  const upload = async (page: Page, name: string, content: string | Buffer) =>
    csvInput(page).setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
    });

  async function createAlert(request: APIRequestContext, headers: Record<string, string>) {
    const eventId = `E08CSV-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const created = await request.post(`${baseURL}/api/v0/alerts/test`, {
      headers,
      data: {
        event: {
          eventId,
          eventType: "E2E fraud review csv",
          customerId: `E08CSV-CUSTOMER-${Date.now()}`,
          eventid: eventId,
          eventtype: "E2E fraud review csv",
          customerid: `E08CSV-CUSTOMER-${Date.now()}`,
          fecha_transaccion: new Date().toISOString(),
          channel: "E2E",
          integrationpoint: "E08",
          amount_value: 1000,
        },
      },
    });
    expect(created.ok(), created.ok() ? "" : await created.text()).toBeTruthy();
    const { alert_id: alertId } = (await created.json()) as { alert_id: string };
    return { alertId, eventId };
  }

  test("plantilla, carga válida e inválida, y archivos rechazados", async ({ page, request }) => {
    test.skip(
      !email || !password || !bootstrapToken,
      "El runner local debe proporcionar credenciales efímeras y el token bootstrap temporal.",
    );
    await provisionUser(request);
    const accessToken = await token(request);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const first = await createAlert(request, headers);
    const second = await createAlert(request, headers);
    await expect
      .poll(
        async () => {
          const history = await request.get(`${baseURL}/api/v0/alerts/history?limit=50`, {
            headers,
          });
          const items = ((await history.json()) as { items: { alert_id: string }[] }).items;
          return [first.alertId, second.alertId].every((id) =>
            items.some((item) => item.alert_id === id),
          );
        },
        { timeout: 60_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(true);
    await openFraudHistory(page, accessToken);

    // 1. The template downloads with the documented header and a sample row.
    const templateDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar plantilla" }).click();
    const template = await templateDownload;
    expect(template.suggestedFilename()).toBe("plantilla-revision-fraude.csv");
    const templateText = await readFile((await template.path())!, "utf8");
    expect(templateText.split("\n")[0]).toBe("alert_id,fraud_label,note");
    expect(templateText.split("\n").filter(Boolean).length).toBe(2);

    // 2. The untouched template is a valid file whose sample alert does not exist.
    await upload(page, "plantilla-revision-fraude.csv", templateText);
    let panel = panelFor(page, "plantilla-revision-fraude.csv");
    await expect(panel).toContainText(/0\s+de 1 filas aplicadas/, { timeout: 60_000 });
    await expect(panel.getByRole("row").nth(1)).toContainText("No encontrada");
    await panel.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByText("plantilla-revision-fraude.csv")).toHaveCount(0);

    // 3. A mixed file: two good rows, a blank line, a bad UUID, a bad label, an unknown alert.
    const unknown = "11111111-2222-4333-8444-555555555555";
    const mixed = [
      "alert_id,fraud_label,note",
      `${first.alertId},fraud,nota csv uno`,
      `${second.alertId},no_fraud,nota csv dos`,
      "",
      "no-es-uuid,fraud,uuid malo",
      `${first.alertId},quizas,etiqueta mala`,
      `${unknown},fraud,alerta inexistente`,
    ].join("\n");
    await upload(page, "mixto.csv", mixed);
    panel = panelFor(page, "mixto.csv");
    await expect(panel).toContainText(/2\s+de 5 filas aplicadas/, { timeout: 60_000 });
    await expect(panel).toContainText(/3\s+con problemas/);
    const rows = panel.getByRole("row");
    await expect(rows).toHaveCount(6); // header + 5 reported rows (the blank line is skipped)
    await expect(rows.nth(1)).toContainText("Aplicada");
    await expect(rows.nth(2)).toContainText("Aplicada");
    await expect(rows.nth(3)).toContainText("Inválida");
    await expect(rows.nth(3)).toContainText(/UUID/i);
    await expect(rows.nth(4)).toContainText("Inválida");
    await expect(rows.nth(5)).toContainText("No encontrada");
    // The page's table refreshed: the reviewed alert now carries the CSV label.
    await panel.getByRole("button", { name: "Cerrar" }).click();
    await page
      .getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…")
      .fill(first.eventId);
    await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("table").first().getByRole("row").nth(1)).toContainText("Fraude");
    // And each applied row left its own audit entry through the CSV channel.
    const trail = await request.get(`${baseURL}/api/v0/alerts/${first.alertId}/fraud-reviews`, {
      headers,
    });
    expect(trail.ok()).toBeTruthy();
    const trailText = await trail.text();
    expect(trailText).toContain("nota csv uno");
    expect(trailText).toContain("csv");
    expect(trailText).not.toContain("etiqueta mala");

    // 4. Semicolon-separated, BOM, upper-case header and extra column are accepted.
    await page.getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…").fill("");
    await upload(
      page,
      "puntoycoma.csv",
      `${String.fromCharCode(0xfeff)}ALERT_ID;Fraud_Label;note;extra\n${second.alertId};fraud;confirmada;x\n`,
    );
    panel = panelFor(page, "puntoycoma.csv");
    await expect(panel).toContainText(/1\s+de 1 filas aplicadas/, { timeout: 60_000 });
    await panel.getByRole("button", { name: "Cerrar" }).click();

    // 5. Files that cannot be read at all fail as a whole, with a clear reason.
    const rejected: { name: string; content: string | Buffer; reason: RegExp }[] = [
      {
        name: "sin-etiqueta.csv",
        content: "alert_id,note\n" + `${first.alertId},hola\n`,
        reason: /Missing column\(s\): fraud_label/,
      },
      { name: "vacio.csv", content: "", reason: /Missing column\(s\): alert_id, fraud_label/ },
      {
        name: "binario.csv",
        content: Buffer.from([0xff, 0xfe, 0xfa, 0x00, 0x80]),
        reason: /not UTF-8 text/,
      },
    ];
    for (const file of rejected) {
      await upload(page, file.name, file.content);
      panel = panelFor(page, file.name);
      await expect(panel).toContainText("La carga falló", { timeout: 60_000 });
      await expect(panel).toContainText(file.reason);
      await panel.getByRole("button", { name: "Cerrar" }).click();
    }

    // 6. A header-only file is valid and reports zero rows; the same file can be sent again.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await upload(page, "solo-encabezado.csv", "alert_id,fraud_label,note\n");
      panel = panelFor(page, "solo-encabezado.csv");
      await expect(panel).toContainText(/0\s+de 0 filas aplicadas/, { timeout: 60_000 });
      await panel.getByRole("button", { name: "Cerrar" }).click();
    }
  });
});
