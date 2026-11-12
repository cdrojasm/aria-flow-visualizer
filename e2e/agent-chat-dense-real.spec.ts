import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { captureTurn, type ChatMessage } from "./agent-chat-helpers";

// Dense assistant chat on the real stack (no API mocking): insights live in the
// message feed (no fixed block under it), the composer stays small, and the
// current route is sent so the backend can retrieve graph context for it.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;

test.skip(!email || !password, "E2E_CHANNEL_MANAGER_EMAIL/PASSWORD are required");

const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
type Credentials = { email?: string; password?: string };
let channelManagerCredentials: Credentials = { email, password };
let managerCredentials: Credentials = { email: managerEmail, password: managerPassword };

test.describe.configure({ mode: "parallel" });

function credentialsForWorker(prefix: string, workerIndex: number, fallback: Credentials) {
  return {
    email: process.env[`E2E_${prefix}_W${workerIndex}_EMAIL`] ?? fallback.email,
    password: process.env[`E2E_${prefix}_W${workerIndex}_PASSWORD`] ?? fallback.password,
  };
}

async function clearOpenSessions(
  request: APIRequestContext,
  credentials: { email?: string; password?: string },
) {
  if (!credentials.email || !credentials.password) return;
  const login = await request.post(`${baseURL}/api/v0/auth/login`, { data: credentials });
  const loginBody = await login.text();
  expect(login.ok(), `login para limpiar sesiones E2E: ${loginBody}`).toBeTruthy();
  const { access_token: token } = JSON.parse(loginBody) as { access_token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await request.get(`${baseURL}/api/v0/agent/sessions?limit=1000`, { headers });
  const listedBody = await listed.text();
  expect(listed.ok(), `listar sesiones E2E: ${listedBody}`).toBeTruthy();
  const sessions = JSON.parse(listedBody) as {
    session_id: string;
    status: string;
    mode: string;
  }[];
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

test.beforeEach(async ({ request }, testInfo) => {
  channelManagerCredentials = credentialsForWorker("CHANNEL_MANAGER", testInfo.parallelIndex, {
    email,
    password,
  });
  managerCredentials = credentialsForWorker("MANAGER", testInfo.parallelIndex, {
    email: managerEmail,
    password: managerPassword,
  });
  await clearOpenSessions(request, channelManagerCredentials);
  await clearOpenSessions(request, managerCredentials);
});

async function open(
  page: Page,
  path: string,
  credentials: Credentials = channelManagerCredentials,
) {
  const response = await page.request.post(`${baseURL}/api/v0/auth/login`, {
    data: credentials,
  });
  const body = await response.text();
  expect(response.ok(), `login API: ${body}`).toBeTruthy();
  const { access_token: token } = JSON.parse(body) as { access_token: string };
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  await page.goto(path);
}

test("assistant chat is dense, keeps insights in the feed and sends the page", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/biblioteca");
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const panel = page.getByRole("complementary", { name: "Panel del asistente" });
  await expect(panel).toBeVisible();
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Nueva" }).click();
  const response = await created;
  expect(response.ok(), `crear sesión ARIA: ${await response.text()}`).toBeTruthy();
  const { session_id: sessionId } = (await response.json()) as { session_id: string };
  expect(sessionId, "la API debe devolver session_id al crear una conversación").toBeTruthy();
  await expect(page.getByLabel("Conversación")).toHaveValue(sessionId);

  const composer = page.getByLabel("Mensaje para ARIA");
  await expect(composer).toBeEnabled();
  const composerBox = (await composer.boundingBox())!;
  expect(composerBox.height).toBeLessThanOrEqual(80);

  const sent = page.waitForRequest(
    (request) => request.url().includes("/messages") && request.method() === "POST",
  );
  await composer.fill("Prefiero que las listas se revisen por canal antes de importarlas.");
  await composer.press("Enter");
  const body = (await sent).postDataJSON() as { page_path?: string };
  expect(body.page_path).toBe("/biblioteca");

  const feed = panel.locator('[aria-live="polite"]');
  await expect(feed.locator("article").filter({ hasText: "ARIA" }).first()).toBeVisible({
    timeout: 90_000,
  });

  // No fixed insights block under the feed any more.
  await expect(panel.getByText("Propuestas de insight")).toHaveCount(0);
  // Insights remain available but stay folded until requested.
  const insightSummary = feed.getByText(/^Insights \(\d+\)$/).last();
  await expect(insightSummary).toBeVisible({ timeout: 30_000 });
  const insightDetails = insightSummary.locator("..");
  await expect(insightDetails).not.toHaveAttribute("open", "");
  await expect(feed.getByRole("button", { name: "Confirmar insight" })).toHaveCount(0);
  await expect(feed.getByText(/^Contexto usado/)).toHaveCount(0);
  await insightSummary.click();
  await expect(feed.getByText("Insight propuesto").first()).toBeVisible();
  await expect(feed.getByRole("button", { name: "Confirmar insight" }).first()).toBeVisible();
  await expect(feed.getByRole("button", { name: "Editar en chat" }).first()).toBeVisible();
  await expect(feed.getByRole("button", { name: "Rechazar insight" }).first()).toBeVisible();

  // The feed gets most of the panel height.
  const panelBox = (await panel.boundingBox())!;
  const feedBox = (await feed.boundingBox())!;
  expect(feedBox.height / panelBox.height).toBeGreaterThan(0.5);

  // "Editar en chat" refills the composer instead of opening a card.
  await feed.getByRole("button", { name: "Editar en chat" }).first().click();
  await expect(composer).toHaveValue(/Quiero ajustar esta propuesta:/);
  // Rejecting works through the same inline controls.
  const pendingBefore = await feed.getByRole("button", { name: "Confirmar insight" }).count();
  await feed.getByRole("button", { name: "Rechazar insight" }).first().click();
  await expect(feed.getByRole("button", { name: "Confirmar insight" })).toHaveCount(
    pendingBefore - 1,
  );
});

async function ask(page: Page, question: string) {
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const created = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Nueva" }).click();
  const response = await created;
  expect(response.ok(), `crear sesión ARIA: ${await response.text()}`).toBeTruthy();
  const { session_id: sessionId } = (await response.json()) as { session_id: string };
  expect(sessionId, "la API debe devolver session_id al crear una conversación").toBeTruthy();
  await expect(page.getByLabel("Conversación")).toHaveValue(sessionId);
  const composer = page.getByLabel("Mensaje para ARIA");
  await composer.fill(question);
  type Reply = ChatMessage & {
    references: { id: string; kind: string; label: string; path?: string }[];
    context_used: { id: string; kind: string; label: string }[];
  };
  const { reply } = await captureTurn<Reply>(page, () => composer.press("Enter"));
  return reply;
}

test("answers about another view carry a chip that navigates there", async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, "/biblioteca");
  const answer = await ask(page, "¿Cómo entreno un modelo?");

  expect(answer.references.map((ref) => ref.path)).toContain("/modelos");
  expect(answer.context_used.map((ref) => ref.id)).toContain("task:entrenar-modelo");

  const panel = page.getByRole("complementary", { name: "Panel del asistente" });
  const chip = panel.getByRole("link", { name: /Entrenar un modelo|Modelos/ }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/Contexto usado/)).toHaveCount(0);
  await chip.click();
  await expect(page).toHaveURL(/\/modelos$/);
});

test("a role without access to a view never gets a chip or a how-to for it", async ({ page }) => {
  test.skip(!managerEmail || !managerPassword, "E2E_MANAGER_EMAIL/PASSWORD are required");
  test.setTimeout(120_000);
  await open(page, "/biblioteca", managerCredentials);
  const answer = await ask(page, "¿Cómo entreno un modelo?");

  expect(answer.references.map((ref) => ref.path)).not.toContain("/modelos");
  expect(answer.context_used.map((ref) => ref.id)).not.toContain("task:entrenar-modelo");
  expect(answer.context_used.map((ref) => ref.id)).not.toContain("view:/modelos");
});
