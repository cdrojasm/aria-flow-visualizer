import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * LLM-judge verdicts (backend D6) through nginx. The API contract, permissions
 * and the "why is there no verdict" states run on any stack. The UI part needs a
 * judged alert, which `make e2e-alert-processing` (E07, scripted LLM, sample rate
 * 1.0) leaves behind; without one it skips and says so.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const api = (path: string) => `${baseURL}/api/v0${path}`;

async function login(request: APIRequestContext, email?: string, password?: string) {
  const response = await request.post(api("/auth/login"), { data: { email, password } });
  expect(response.ok(), response.ok() ? "" : await response.text()).toBeTruthy();
  const body = (await response.json()) as { access_token: string };
  return { token: body.access_token, headers: { Authorization: `Bearer ${body.access_token}` } };
}

const day = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Bogota",
  });

test("evaluador real: estados sin veredicto, rango y permisos", async ({ request }) => {
  const { E2E_MANAGER_EMAIL: email, E2E_MANAGER_PASSWORD: password } = process.env;
  test.skip(!email || !password, "El runner local debe proporcionar las credenciales del manager.");
  const { headers } = await login(request, email, password);

  const eventId = `JUDGE-${Date.now()}`;
  const created = await request.post(api("/alerts/test"), {
    headers,
    data: {
      event: {
        eventId,
        eventType: "E2E judge",
        customerId: `JUDGE-CUSTOMER-${Date.now()}`,
        eventid: eventId,
        eventtype: "E2E judge",
        customerid: `JUDGE-CUSTOMER-${Date.now()}`,
        fecha_transaccion: new Date().toISOString(),
        channel: "E2E",
        integrationpoint: "JUDGE",
        amount_value: 1000,
      },
    },
  });
  expect(created.ok(), created.ok() ? "" : await created.text()).toBeTruthy();
  const { alert_id: alertId } = (await created.json()) as { alert_id: string };

  // Whatever the sample rate, the answer says WHY there is (or is not) a verdict.
  const view = await request.get(api(`/alerts/${alertId}/reasoning-evaluation`), { headers });
  expect(view.ok(), await view.text()).toBeTruthy();
  const body = (await view.json()) as { alert_id: string; state: string; evaluation: unknown };
  expect(body.alert_id).toBe(alertId);
  expect(["pending", "not_sampled", "evaluated", "invalid", "not_applicable"]).toContain(
    body.state,
  );
  if (body.state === "pending" || body.state === "not_sampled") {
    expect(body.evaluation).toBeNull();
  }

  const unknown = await request.get(api(`/alerts/${crypto.randomUUID()}/reasoning-evaluation`), {
    headers,
  });
  expect(unknown.status()).toBe(404);

  // The listing: bounded range, validated filters.
  const range = await request.get(
    api(`/metrics/reasoning-evaluations?from_day=${day(60)}&to_day=${day(0)}`),
    { headers },
  );
  expect(range.status()).toBe(422);
  const malformed = await request.get(
    api("/metrics/reasoning-evaluations?from_day=nope&to_day=nope"),
    { headers },
  );
  expect(malformed.status()).toBe(422);
  const recent = await request.get(
    api(`/metrics/reasoning-evaluations?from_day=${day(1)}&to_day=${day(0)}&limit=5`),
    { headers },
  );
  expect(recent.ok(), await recent.text()).toBeTruthy();
  expect(Array.isArray(await recent.json())).toBe(true);

  // No permission, no verdicts: the rationale is model text about alert data.
  const { E2E_FRAUD_REVIEW_EMAIL: reviewer, E2E_FRAUD_REVIEW_PASSWORD: reviewerPassword } =
    process.env;
  if (reviewer && reviewerPassword) {
    const other = await login(request, reviewer, reviewerPassword);
    const detail = await request.get(api(`/alerts/${alertId}/reasoning-evaluation`), {
      headers: other.headers,
    });
    expect(detail.status()).toBe(403);
    const listing = await request.get(
      api(`/metrics/reasoning-evaluations?from_day=${day(1)}&to_day=${day(0)}`),
      { headers: other.headers },
    );
    expect(listing.status()).toBe(403);
  }
});

test("evaluador real UI: del monitor a la justificación por paso de una alerta marcada", async ({
  page,
  request,
}) => {
  const { E2E_MANAGER_EMAIL: email, E2E_MANAGER_PASSWORD: password } = process.env;
  test.skip(!email || !password, "El runner local debe proporcionar las credenciales del manager.");
  const { token, headers } = await login(request, email, password);

  const listed = await request.get(
    api(
      `/metrics/reasoning-evaluations?from_day=${day(1)}&to_day=${day(0)}&hallucination=true&limit=50`,
    ),
    { headers },
  );
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const flagged = (await listed.json()) as Array<{
    alert_id: string;
    rationale: string;
    steps: Array<{ step: string }>;
  }>;
  test.skip(
    flagged.length === 0,
    "No hay alertas marcadas por el evaluador: ejecuta antes `make e2e-alert-processing` (E07).",
  );
  const target = flagged[0];

  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  await page.goto("/monitor");
  await page.getByRole("tab", { name: "Explicabilidad" }).click();
  await page.getByRole("button", { name: "Ver alertas evaluadas" }).click();
  await expect(
    page.getByRole("heading", { name: "Alertas evaluadas por el LLM-judge" }),
  ).toBeVisible();
  // The default filter is "Con alucinación": the flagged alert is listed.
  await expect(page.getByRole("link", { name: target.alert_id })).toBeVisible();

  await page.getByRole("link", { name: target.alert_id }).click();
  await page.getByRole("button", { name: "Evaluación de calidad" }).click();
  await expect(page.getByText("Veredicto del evaluador")).toBeVisible();
  await expect(page.getByText(target.rationale)).toBeVisible();
  await expect(page.getByText("Por paso")).toBeVisible();
  await expect(page.getByText("Detector", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/prompt v2/)).toBeVisible();
});
