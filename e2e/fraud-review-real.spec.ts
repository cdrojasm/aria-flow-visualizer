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
