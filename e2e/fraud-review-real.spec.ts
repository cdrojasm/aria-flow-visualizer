import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_FRAUD_REVIEW_EMAIL;
const password = process.env.E2E_FRAUD_REVIEW_PASSWORD;
const bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN;
const userName = "ARIA E08 fraud-review E2E";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
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

test("E08 real: marca, remarca y consulta el histórico de revisiones", async ({ page, request }) => {
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

  const history = await request.get(`${baseURL}/api/v0/alerts/history?limit=50`, { headers });
  expect(history.ok(), history.ok() ? "" : await history.text()).toBeTruthy();
  const historyPage = (await history.json()) as {
    items: Array<{ alert_id: string; event_id: string; fraud_review_count: number }>;
  };
  expect(historyPage.items).toContainEqual(
    expect.objectContaining({ alert_id: alertId, event_id: eventId, fraud_review_count: 2 }),
  );

  await login(page);
  await page.goto("/historico-fraude");
  const search = page.getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…");
  await search.fill(eventId);
  const row = page.getByRole("row").filter({ hasText: eventId });
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
