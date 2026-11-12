import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * #11c against the real stack through nginx: legal holds on a live alert and the
 * cold-archive lookup contract. The archive write path (object + index + range
 * read) is covered against real DynamoDB Local and MinIO by
 * `make test-integration-fraud-history-retention`; here the API contract,
 * permissions and audit trail are exercised end to end.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const api = (path: string) => `${baseURL}/api/v0${path}`;
const REASON = "Requerimiento judicial E2E 11c sobre la alerta";

async function login(request: APIRequestContext, email?: string, password?: string) {
  const response = await request.post(api("/auth/login"), { data: { email, password } });
  expect(response.ok(), response.ok() ? "" : await response.text()).toBeTruthy();
  const body = (await response.json()) as { access_token: string };
  return { Authorization: `Bearer ${body.access_token}` };
}

test("11c real: el manager retiene, lista y libera una alerta, con auditoría", async ({
  request,
}) => {
  const { E2E_MANAGER_EMAIL: email, E2E_MANAGER_PASSWORD: password } = process.env;
  test.skip(!email || !password, "El runner local debe proporcionar las credenciales del manager.");
  const headers = await login(request, email, password);

  const eventId = `E11C-${Date.now()}`;
  const created = await request.post(api("/alerts/test"), {
    headers,
    data: {
      event: {
        eventId,
        eventType: "E2E legal hold",
        customerId: `E11C-CUSTOMER-${Date.now()}`,
        eventid: eventId,
        eventtype: "E2E legal hold",
        customerid: `E11C-CUSTOMER-${Date.now()}`,
        fecha_transaccion: new Date().toISOString(),
        channel: "E2E",
        integrationpoint: "E11C",
        amount_value: 1000,
      },
    },
  });
  expect(created.ok(), created.ok() ? "" : await created.text()).toBeTruthy();
  const { alert_id: alertId } = (await created.json()) as { alert_id: string };
  const hold = `/fraud-history/legal-holds/${alertId}`;

  // The reason is mandatory and bounded.
  const short = await request.put(api(hold), { headers, data: { reason: "corto" } });
  expect(short.status()).toBe(422);
  expect((await short.json()).detail.code).toBe("LEGAL_HOLD_REASON");

  // A hold on an alert that exists nowhere is refused.
  const unknown = await request.put(api(`/fraud-history/legal-holds/${crypto.randomUUID()}`), {
    headers,
    data: { reason: REASON },
  });
  expect(unknown.status()).toBe(404);

  const placed = await request.put(api(hold), {
    headers,
    data: { reason: REASON, case_reference: "CASO-E2E-11C" },
  });
  expect(placed.status(), await placed.text()).toBe(201);
  const placedBody = (await placed.json()) as Record<string, unknown>;
  expect(placedBody).toMatchObject({
    alert_id: alertId,
    active: true,
    reason: REASON,
    case_reference: "CASO-E2E-11C",
  });
  expect(placedBody.placed_by).toBeTruthy();

  // Only one hold can be active at a time.
  const again = await request.put(api(hold), { headers, data: { reason: REASON } });
  expect(again.status()).toBe(409);
  expect((await again.json()).detail.code).toBe("LEGAL_HOLD_ALREADY_ACTIVE");

  const listed = await request.get(api("/fraud-history/legal-holds?limit=500"), { headers });
  expect(listed.ok()).toBeTruthy();
  expect(((await listed.json()) as Array<{ alert_id: string }>).map((h) => h.alert_id)).toContain(
    alertId,
  );

  // A live alert is not in the cold archive.
  const notArchived = await request.get(api(`/fraud-history/archive/${alertId}`), { headers });
  expect(notArchived.status()).toBe(404);
  expect((await notArchived.json()).detail.code).toBe("ARCHIVED_ALERT_NOT_FOUND");

  const released = await request.post(api(`${hold}/release`), {
    headers,
    data: { reason: "Oficio de levantamiento E2E 11c" },
  });
  expect(released.status(), await released.text()).toBe(200);
  expect(await released.json()).toMatchObject({
    alert_id: alertId,
    active: false,
    release_reason: "Oficio de levantamiento E2E 11c",
  });
  expect((await released.json()).released_by).toBeTruthy();

  const afterRelease = await request.get(api("/fraud-history/legal-holds?limit=500"), { headers });
  expect(
    ((await afterRelease.json()) as Array<{ alert_id: string }>).map((h) => h.alert_id),
  ).not.toContain(alertId);
  const releasedAgain = await request.post(api(`${hold}/release`), {
    headers,
    data: { reason: "Oficio de levantamiento E2E 11c" },
  });
  expect(releasedAgain.status()).toBe(404);

  // A released alert can be held again (a new case).
  const second = await request.put(api(hold), { headers, data: { reason: `${REASON} (2)` } });
  expect(second.status()).toBe(201);
  await request.post(api(`${hold}/release`), {
    headers,
    data: { reason: "Cierre del segundo caso E2E 11c" },
  });

  // The use cases write their own audit entries: the HTTP audit only keeps the
  // route template, never the alert_id.
  const today = new Date().toISOString().slice(0, 10);
  await expect
    .poll(
      async () => {
        const audit = await request.get(
          api(`/audit-logs?from_date=${today}&to_date=${today}&limit=10000`),
          { headers },
        );
        expect(audit.ok(), audit.ok() ? "" : await audit.text()).toBeTruthy();
        const rows = JSON.stringify(await audit.json());
        return (
          rows.includes(alertId) &&
          rows.includes("legal_hold.place") &&
          rows.includes("legal_hold.release") &&
          rows.includes("fraud_history.archive.read")
        );
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
});

test("11c real: permisos del archivo frío y de los holds por rol", async ({ request }) => {
  const env = process.env;
  test.skip(
    !env.E2E_FRAUD_REVIEW_EMAIL || !env.E2E_RELEASE_MANAGER_EMAIL,
    "Requiere la suite completa con usuarios fraud_reviewer y release_manager.",
  );
  const missing = crypto.randomUUID();
  const body = { reason: REASON };

  // fraud_reviewer reads the archive, but cannot operate holds.
  const reviewer = await login(request, env.E2E_FRAUD_REVIEW_EMAIL, env.E2E_FRAUD_REVIEW_PASSWORD);
  expect(
    (await request.get(api(`/fraud-history/archive/${missing}`), { headers: reviewer })).status(),
  ).toBe(404);
  expect(
    (await request.get(api("/fraud-history/legal-holds"), { headers: reviewer })).status(),
  ).toBe(403);
  expect(
    (
      await request.put(api(`/fraud-history/legal-holds/${missing}`), {
        headers: reviewer,
        data: body,
      })
    ).status(),
  ).toBe(403);

  // release_manager has neither permission.
  const release = await login(
    request,
    env.E2E_RELEASE_MANAGER_EMAIL,
    env.E2E_RELEASE_MANAGER_PASSWORD,
  );
  expect(
    (await request.get(api(`/fraud-history/archive/${missing}`), { headers: release })).status(),
  ).toBe(403);
  expect(
    (await request.get(api("/fraud-history/legal-holds"), { headers: release })).status(),
  ).toBe(403);
  expect(
    (
      await request.post(api(`/fraud-history/legal-holds/${missing}/release`), {
        headers: release,
        data: body,
      })
    ).status(),
  ).toBe(403);

  // No token at all.
  expect(
    (await request.get(api(`/fraud-history/archive/${missing}`))).status(),
  ).toBeGreaterThanOrEqual(401);
});

const ARCHIVED_ALERT_ID = "00000000-0000-4000-8000-0000000011c0";
const ARCHIVED_EVENT_ID = "E2E-11C-ARCHIVED";

async function openArchive(page: Page, headers: { Authorization: string }) {
  await page.addInitScript(
    (tokenValue) => localStorage.setItem("aria.auth.accessToken", tokenValue),
    headers.Authorization.replace("Bearer ", ""),
  );
  await page.goto("/historico-fraude");
  await page.getByRole("button", { name: "Archivo" }).click();
  await expect(page.getByRole("heading", { name: "Archivo de alertas" })).toBeVisible();
}

test("11c real UI: busca una alerta archivada por evento, la abre, la retiene y la libera", async ({
  page,
  request,
}) => {
  const { E2E_MANAGER_EMAIL: email, E2E_MANAGER_PASSWORD: password } = process.env;
  test.skip(!email || !password, "El runner local debe proporcionar las credenciales del manager.");
  const headers = await login(request, email, password);

  // Start from a clean hold state, whatever a previous run left behind: a held
  // alert would not be archived by the seed below.
  await request.post(api(`/fraud-history/legal-holds/${ARCHIVED_ALERT_ID}/release`), {
    headers,
    data: { reason: "Limpieza previa de la corrida E2E 11c" },
  });

  // Real archiver, real DynamoDB/MinIO: a backdated alert is archived and indexed.
  const seeded = await request.post(api("/e2e/fraud-history/archived-alert"), { headers });
  expect(seeded.ok(), seeded.ok() ? "" : await seeded.text()).toBeTruthy();
  expect(await seeded.json()).toMatchObject({
    alert_id: ARCHIVED_ALERT_ID,
    event_id: ARCHIVED_EVENT_ID,
    created_day: "2024-02-29",
  });
  // API: the three ways of finding it, and the verified read.
  for (const query of [
    `alert_id=${ARCHIVED_ALERT_ID}`,
    `event_id=${ARCHIVED_EVENT_ID}`,
    "day=2024-02-29",
  ]) {
    const found = await request.get(api(`/fraud-history/archive?${query}`), { headers });
    expect(found.ok(), await found.text()).toBeTruthy();
    expect(((await found.json()) as Array<{ alert_id: string }>).map((h) => h.alert_id)).toContain(
      ARCHIVED_ALERT_ID,
    );
  }
  expect((await request.get(api("/fraud-history/archive"), { headers })).status()).toBe(422);
  const detail = await request.get(api(`/fraud-history/archive/${ARCHIVED_ALERT_ID}`), { headers });
  expect(detail.ok(), await detail.text()).toBeTruthy();
  expect(await detail.json()).toMatchObject({
    alert_id: ARCHIVED_ALERT_ID,
    verified_against: "record",
    alert: { event_id: ARCHIVED_EVENT_ID },
  });

  // UI.
  await openArchive(page, headers);
  await page.getByLabel("Buscar por").selectOption("event_id");
  await page.getByLabel("Valor a buscar en el archivo").fill(ARCHIVED_EVENT_ID);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: `Abrir ${ARCHIVED_ALERT_ID}` }).click();
  await expect(page.getByText(/Integridad verificada/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar JSON" })).toBeVisible();

  const panel = page.getByRole("region", { name: "Retención legal" });
  await expect(panel.getByText("Sin retención activa.")).toBeVisible();
  await panel.getByLabel("Motivo de la retención").fill("Requerimiento judicial E2E 11c UI");
  await panel.getByLabel("Referencia del caso").fill("CASO-UI-11C");
  await panel.getByRole("button", { name: "Retener" }).click();
  await expect(panel.getByText("CASO-UI-11C")).toBeVisible();

  // The same alert now appears flagged in the search results and in "Retenciones".
  await page.getByRole("button", { name: "Volver a los resultados" }).click();
  await expect(page.getByText("Retenida", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Retenciones" }).click();
  await expect(page.getByRole("button", { name: `Levantar ${ARCHIVED_ALERT_ID}` })).toBeVisible();

  await page.getByRole("button", { name: `Levantar ${ARCHIVED_ALERT_ID}` }).click();
  await page.getByLabel("Motivo para levantar la retención").fill("Oficio de levantamiento UI 11c");
  await page.getByRole("button", { name: "Levantar retención" }).click();
  await expect(page.getByRole("button", { name: `Levantar ${ARCHIVED_ALERT_ID}` })).toHaveCount(0);

  const after = await request.get(api("/fraud-history/legal-holds?limit=500"), { headers });
  expect(
    ((await after.json()) as Array<{ alert_id: string }>).map((h) => h.alert_id),
  ).not.toContain(ARCHIVED_ALERT_ID);
});
