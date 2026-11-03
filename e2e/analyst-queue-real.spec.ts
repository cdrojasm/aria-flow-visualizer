import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const analystEmail = process.env.E2E_FRAUD_ANALYST_EMAIL;
const analystPassword = process.env.E2E_FRAUD_ANALYST_PASSWORD;
const workflowTimeoutMs = Number(process.env.E2E_WORKFLOW_TIMEOUT ?? "540") * 1000;

type Settings = Record<string, unknown>;
type QueueDetail = { status: string; steps: { step_name: string }[] };

async function login(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${baseURL}/api/v0/auth/login`, {
    data: { email, password },
  });
  expect(response.ok(), response.ok() ? "" : await response.text()).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function openAs(page: Page, accessToken: string, path: string) {
  await page.addInitScript(
    (tokenValue) => localStorage.setItem("aria.auth.accessToken", tokenValue),
    accessToken,
  );
  await page.goto(path);
}

// A real escalated alert: the same velocity event scripts/e2e_alert_processing.py
// uses, run through the real 7-step workflow with analysts switched on.
// whileProcessing runs right after intake, while ARIA is still analysing it.
async function escalatedAlert(
  request: APIRequestContext,
  managerToken: string,
  whileProcessing?: (alertId: string) => Promise<void>,
) {
  const headers = { Authorization: `Bearer ${managerToken}` };
  const before = await request.get(`${baseURL}/api/v0/operational-settings`, { headers });
  expect(before.ok()).toBeTruthy();
  const settingsBefore = (await before.json()) as Settings;
  const put = (settings: Settings, changedBy: string) =>
    request.put(`${baseURL}/api/v0/operational-settings`, {
      headers,
      data: { settings, changed_by: changedBy },
    });
  try {
    const forE2E = {
      ...settingsBefore,
      agent_enabled: true,
      analyst_enabled: true,
      voicebot_enabled: false,
    };
    expect((await put(forE2E, "e2e-analyst-queue")).ok()).toBeTruthy();

    const now = new Date();
    const iso = (offsetMinutes: number) =>
      new Date(now.getTime() - offsetMinutes * 60_000).toISOString().replace(/\.\d+Z$/, "Z");
    const prior = [185000, 240000, 315000, 410000].map((amount, index) => ({
      event_time: iso(2 * (index + 1)),
      amount,
      channel: "PSE",
      beneficiary_id: "90123456789",
      status: "approved",
    }));
    const unique = `${Date.now()}`;
    const started = await request.post(`${baseURL}/api/v0/alerts/test`, {
      headers,
      data: {
        event: {
          eventid: `QUEUE-${unique}`,
          eventtype: "transferencia",
          customerid: `1${unique.slice(-9)}`,
          channel: "web",
          amount_value: 520000,
          fecha_transaccion: iso(0),
          integrationpoint: "PSE",
          triggered_rules:
            "VELOCITY_03: 5 transacciones en los últimos 10 minutos, incluida la actual",
          transactionid: `TX-${unique}`,
          deviceid: `DEV-${unique}`,
          counterpartyentityid_encrypted: "90123456789",
          biocatch_isMobileRat: "false",
          biocatch_isEmulator: "false",
          biocatch_isRat: "false",
          biocatch_isBot: "false",
          transacciones_json: JSON.stringify(prior),
        },
      },
    });
    expect(started.status(), await started.text()).toBe(202);
    const { alert_id: alertId } = (await started.json()) as { alert_id: string };
    await whileProcessing?.(alertId);

    await expect
      .poll(
        async () => {
          const detail = await request.get(`${baseURL}/api/v0/analyst-queue/${alertId}`, {
            headers,
          });
          return detail.ok() ? ((await detail.json()) as QueueDetail).status : "pending";
        },
        { timeout: workflowTimeoutMs, intervals: [2_000] },
      )
      .toBe("ESCALATED");
    return alertId;
  } finally {
    await put(settingsBefore, "e2e-analyst-queue-restore");
  }
}

test("cola real: tomar, liberar, resolver y ver la resolución en la alerta cerrada", async ({
  page,
  request,
}) => {
  test.skip(
    !managerEmail || !managerPassword || !analystEmail || !analystPassword,
    "Configura E2E_MANAGER_EMAIL/PASSWORD y E2E_FRAUD_ANALYST_EMAIL/PASSWORD.",
  );

  const managerToken = await login(request, managerEmail!, managerPassword!);
  const analystToken = await login(request, analystEmail!, analystPassword!);
  const alertId = await escalatedAlert(request, managerToken);
  const shortId = alertId.slice(0, 8);

  // "Alertas en proceso" loads from the backend (no hardcoded rows) and the
  // escalated alert is no longer in it.
  const inProcess = await request.get(`${baseURL}/api/v0/analyst-queue/in-process`, {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  expect(inProcess.status()).toBe(200);
  const inProcessIds = ((await inProcess.json()) as { alert_id: string }[]).map((a) => a.alert_id);
  expect(inProcessIds).not.toContain(alertId);

  await openAs(page, analystToken, "/cola");
  await page.getByRole("button", { name: "Alertas en proceso" }).click();
  await expect(page.getByText("No se pudieron cargar las alertas en proceso")).toHaveCount(0);
  await expect(page.getByText("Sub-agente PHISH-02")).toHaveCount(0);

  // Take it from the queue -> lands on the detail with the countdown.
  await page.getByRole("button", { name: "Pending Alerts for Analyst" }).click();
  await page.getByRole("textbox", { name: "Buscar en la tabla" }).fill(shortId);
  const row = page.getByRole("row", { name: new RegExp(shortId) });
  await expect(row).toContainText("Sin tomar");
  await row.getByRole("button", { name: "Tomar caso" }).click();
  await expect(page).toHaveURL(new RegExp(`/alerta/${alertId}`));
  await expect(page.getByText(/Tu reserva vence en/)).toBeVisible();

  // Release gives it back to the queue, untaken.
  await page.getByRole("button", { name: "Liberar" }).click();
  await expect(page).toHaveURL(/\/cola$/);
  await page.getByRole("textbox", { name: "Buscar en la tabla" }).fill(shortId);
  await expect(page.getByRole("row", { name: new RegExp(shortId) })).toContainText("Sin tomar");

  // Take again and resolve as false positive with notes.
  await page
    .getByRole("row", { name: new RegExp(shortId) })
    .getByRole("button", { name: "Tomar caso" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/alerta/${alertId}`));
  await page.getByRole("button", { name: "Falso positivo (dejar pasar)" }).click();
  const notes = `E2E cola ${Date.now()}: cliente reconoce la operación`;
  await page.getByPlaceholder("Evidencia revisada y criterio aplicado…").fill(notes);
  await page.getByRole("button", { name: "Resolver" }).click();
  await expect(page).toHaveURL(/\/cola$/);
  await expect(page.getByRole("row", { name: new RegExp(shortId) })).toHaveCount(0);

  // The closed alert shows who resolved it, with what decision and notes.
  await page.goto(`/alerta/${alertId}`);
  await expect(page.getByText("Cerrada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Razonamiento del agente" }).click();
  const diagrams = page.getByRole("list", { name: "Etapas agrupadas de la revisión de alerta" });
  await page.getByText("Ver diagramas del flujo y la resolución").click();
  await expect(diagrams).toBeVisible();
  await expect(diagrams).toContainText("Analizar");
  await expect(diagrams).toContainText("Resuelto por analista");
  await expect(page.getByText("Ruta de resolución")).toBeVisible();
  await expect(page.getByText("Registrada: Analista")).toBeVisible();
  await page.getByRole("button", { name: "Resumen" }).click();
  const resolution = page.getByTestId("analyst-resolution");
  await expect(resolution).toContainText("Falso positivo (dejada pasar)");
  await expect(resolution).toContainText(notes);
  await expect(page.getByText(/Cerrada por/)).toBeVisible();
});

// Display names of the workflow steps (src/lib/alertSteps.ts) plus the label
// for an alert whose workflow has not started yet.
const IN_PROCESS_STAGE =
  /Pre-proceso|Reglas determinísticas|Perfilamiento|Detector|Adversarial|Clasificación|Analista \(agente\)|Ejecutor|Post-proceso|En espera de procesamiento/;

test("cola real: la alerta que ARIA analiza aparece en 'Alertas en proceso' y sale al escalar", async ({
  page,
  request,
}) => {
  test.skip(
    !managerEmail || !managerPassword || !analystEmail || !analystPassword,
    "Configura E2E_MANAGER_EMAIL/PASSWORD y E2E_FRAUD_ANALYST_EMAIL/PASSWORD.",
  );

  const managerToken = await login(request, managerEmail!, managerPassword!);
  const analystToken = await login(request, analystEmail!, analystPassword!);
  const headers = { Authorization: `Bearer ${analystToken}` };
  type InProcessAlert = { alert_id: string; customer_id: string | null };

  const alertId = await escalatedAlert(request, managerToken, async (startedId) => {
    // The backend lists the new alert while ARIA analyses it...
    let listed: InProcessAlert | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(`${baseURL}/api/v0/analyst-queue/in-process`, {
            headers,
          });
          listed = ((await response.json()) as InProcessAlert[]).find(
            (alert) => alert.alert_id === startedId,
          );
          return !!listed;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBeTruthy();

    // ...and the tab renders that same alert, with its customer and current stage.
    await openAs(page, analystToken, "/cola");
    await page.getByRole("button", { name: "Alertas en proceso" }).click();
    await expect(page.getByRole("heading", { name: "Alertas en proceso" })).toBeVisible();
    await page.getByRole("textbox", { name: "Buscar en la tabla" }).fill(startedId.slice(0, 8));
    const row = page.getByRole("row", { name: new RegExp(startedId.slice(0, 8)) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    if (listed?.customer_id) await expect(row).toContainText(listed.customer_id);
    await expect(row).toContainText(IN_PROCESS_STAGE);
    await expect(row.getByRole("link", { name: "Ver" })).toHaveAttribute(
      "href",
      `/alerta/${startedId}`,
    );
  });

  // Once escalated it leaves the in-process list and the tab.
  const inProcess = await request.get(`${baseURL}/api/v0/analyst-queue/in-process`, { headers });
  expect(inProcess.status()).toBe(200);
  expect(((await inProcess.json()) as InProcessAlert[]).map((a) => a.alert_id)).not.toContain(
    alertId,
  );
  await page.reload();
  await page.getByRole("button", { name: "Alertas en proceso" }).click();
  await expect(page.getByText("No se pudieron cargar las alertas en proceso")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Buscar en la tabla" }).fill(alertId.slice(0, 8));
  await expect(page.getByRole("row", { name: new RegExp(alertId.slice(0, 8)) })).toHaveCount(0);
});
