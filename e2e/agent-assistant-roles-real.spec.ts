import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Role coverage for the assistant, complementing agent-assistant-views-real
// (channel_manager and manager). The assistant needs the "configuration"
// permission: release_manager has it, but its project map hides Modelos and
// Backups; data_analyst and fraud_analyst do not have it, so the assistant is
// not offered and the API refuses them. Real stack, no API mocking.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
type Credentials = { email?: string; password?: string };

const release: Credentials = {
  email: process.env.E2E_RELEASE_MANAGER_EMAIL,
  password: process.env.E2E_RELEASE_MANAGER_PASSWORD,
};
const dataAnalyst: Credentials = {
  email: process.env.E2E_DATA_ANALYST_EMAIL,
  password: process.env.E2E_DATA_ANALYST_PASSWORD,
};
const fraudAnalyst: Credentials = {
  email: process.env.E2E_FRAUD_ANALYST_EMAIL,
  password: process.env.E2E_FRAUD_ANALYST_PASSWORD,
};

type Ref = { id: string; kind: string; label: string; path?: string };
type Answer = { content: string; references: Ref[]; context_used: Ref[] };

async function login(request: APIRequestContext, credentials: Credentials) {
  const response = await request.post(`${baseURL}/api/v0/auth/login`, { data: credentials });
  const body = await response.text();
  expect(response.ok(), `login API: ${body}`).toBeTruthy();
  return (JSON.parse(body) as { access_token: string }).access_token;
}

async function open(page: Page, path: string, credentials: Credentials) {
  const token = await login(page.request, credentials);
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  await page.goto(path);
}

async function clearOpenSessions(request: APIRequestContext, credentials: Credentials) {
  const token = await login(request, credentials);
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await request.get(`${baseURL}/api/v0/agent/sessions?limit=1000`, { headers });
  expect(listed.ok(), `listar sesiones E2E: ${await listed.text()}`).toBeTruthy();
  const sessions = (await listed.json()) as { session_id: string; status: string; mode: string }[];
  const openStatuses = new Set(["DRAFT", "ACTIVE", "PAUSED", "WAITING_USER", "WAITING_APPROVAL"]);
  for (const session of sessions.filter(
    (item) => item.mode === "assistant" && openStatuses.has(item.status),
  )) {
    const cancelled = await request.post(
      `${baseURL}/api/v0/agent/sessions/${encodeURIComponent(session.session_id)}/cancel`,
      { headers },
    );
    expect(cancelled.ok(), `cerrar sesión E2E: ${await cancelled.text()}`).toBeTruthy();
  }
}

async function startChat(page: Page) {
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Nueva", exact: true }).click();
  const response = await created;
  expect(response.ok(), `crear sesión ARIA: ${await response.text()}`).toBeTruthy();
  const { session_id: sessionId } = (await response.json()) as { session_id: string };
  await expect(page.getByLabel("Conversación")).toHaveValue(sessionId);
}

async function ask(page: Page, question: string): Promise<Answer> {
  const composer = page.getByLabel("Mensaje para ARIA");
  await expect(composer).toBeEnabled();
  const reply = page.waitForResponse(
    (response) => response.url().includes("/messages") && response.request().method() === "POST",
  );
  await composer.fill(question);
  await composer.press("Enter");
  const turn = await (await reply).json();
  const answer = turn.assistant_message as Answer;
  expect(answer.content.trim().length).toBeGreaterThan(20);
  expect(answer.content).not.toContain('"tool_call"');
  return answer;
}

const ids = (answer: Answer) => answer.context_used.map((ref) => ref.id);
const paths = (answer: Answer) => answer.references.map((ref) => ref.path);

test.describe("rol release_manager (sin Modelos ni Backups)", () => {
  test.skip(
    !release.email || !release.password,
    "E2E_RELEASE_MANAGER_EMAIL/PASSWORD are required",
  );

  test.beforeEach(async ({ request }) => {
    await clearOpenSessions(request, release);
  });

  test("en /testing recibe cómo lanzar una prueba", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/testing", release);
    await startChat(page);
    const answer = await ask(page, "¿Cómo lanzo una prueba del agente?");

    expect(ids(answer)).toContain("task:ejecutar-prueba");
  });

  test("en /configuracion recibe cómo desplegar una configuración", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/configuracion", release);
    await startChat(page);
    const answer = await ask(page, "¿Cómo despliego una configuración nueva?");

    expect(ids(answer)).toContain("task:desplegar-configuracion");
  });

  test("no recibe cómo entrenar un modelo ni chip a /modelos", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/biblioteca", release);
    await startChat(page);
    const answer = await ask(page, "¿Cómo entreno un modelo?");

    expect(paths(answer)).not.toContain("/modelos");
    expect(ids(answer)).not.toContain("task:entrenar-modelo");
    expect(ids(answer)).not.toContain("view:/modelos");
  });

  test("no recibe cómo crear un respaldo ni chip a /backups", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/configuracion", release);
    await startChat(page);
    const answer = await ask(page, "¿Cómo creo un respaldo?");

    expect(paths(answer)).not.toContain("/backups");
    expect(ids(answer)).not.toContain("task:crear-respaldo");
    expect(ids(answer)).not.toContain("view:/backups");
  });
});

for (const [label, credentials, views] of [
  ["data_analyst", dataAnalyst, ["/biblioteca", "/modelos", "/testing"]],
  ["fraud_analyst", fraudAnalyst, ["/cola"]],
] as const) {
  test.describe(`rol ${label} (sin permiso de configuración)`, () => {
    test.skip(
      !credentials.email || !credentials.password,
      `E2E_${label.toUpperCase()}_EMAIL/PASSWORD are required`,
    );

    for (const view of views) {
      test(`el asistente no se ofrece en ${view}`, async ({ page }) => {
        await open(page, view, credentials);
        await expect(page).toHaveURL(new RegExp(`${view}$`));
        await expect(page.getByRole("main").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Abrir asistente ARIA" })).toHaveCount(0);
      });
    }

    test("la API rechaza sus sesiones del asistente", async ({ request }) => {
      const token = await login(request, credentials);
      const response = await request.get(`${baseURL}/api/v0/agent/sessions?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(403);
    });
  });
}
