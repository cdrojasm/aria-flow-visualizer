import { expect, test, type Page } from "@playwright/test";

// Dense assistant chat on the real stack (no API mocking): insights live in the
// message feed (no fixed block under it), the composer stays small, and the
// current route is sent so the backend can retrieve graph context for it.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;

test.skip(!email || !password, "E2E_CHANNEL_MANAGER_EMAIL/PASSWORD are required");

const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;

async function open(page: Page, path: string, credentials = { email, password }) {
  const response = await page.request.post(`${baseURL}/api/v0/auth/login`, {
    data: credentials,
  });
  expect(response.ok()).toBeTruthy();
  const { access_token: token } = (await response.json()) as { access_token: string };
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
  const { session_id: sessionId } = (await (await created).json()) as { session_id: string };
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
  // The proposal (LLM or rule-based fallback) is inside the scrolling feed.
  const insight = feed.getByText("Insight propuesto").first();
  await expect(insight).toBeVisible({ timeout: 30_000 });
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
  const { session_id: sessionId } = (await (await created).json()) as { session_id: string };
  await expect(page.getByLabel("Conversación")).toHaveValue(sessionId);
  const composer = page.getByLabel("Mensaje para ARIA");
  await composer.fill(question);
  const reply = page.waitForResponse(
    (response) => response.url().includes("/messages") && response.request().method() === "POST",
  );
  await composer.press("Enter");
  const turn = await (await reply).json();
  return turn.assistant_message as {
    references: { id: string; kind: string; label: string; path?: string }[];
    context_used: { id: string; kind: string; label: string }[];
  };
}

test("answers about another view carry a chip that navigates there, with the context used", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await open(page, "/biblioteca");
  const answer = await ask(page, "¿Cómo entreno un modelo?");

  expect(answer.references.map((ref) => ref.path)).toContain("/modelos");
  expect(answer.context_used.map((ref) => ref.id)).toContain("task:entrenar-modelo");

  const panel = page.getByRole("complementary", { name: "Panel del asistente" });
  const chip = panel.getByRole("link", { name: /Entrenar un modelo|Modelos/ }).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/Contexto usado \(\d+\)/)).toBeVisible();
  await chip.click();
  await expect(page).toHaveURL(/\/modelos$/);
});

test("a role without access to a view never gets a chip or a how-to for it", async ({ page }) => {
  test.skip(!managerEmail || !managerPassword, "E2E_MANAGER_EMAIL/PASSWORD are required");
  test.setTimeout(120_000);
  await open(page, "/biblioteca", { email: managerEmail, password: managerPassword });
  const answer = await ask(page, "¿Cómo entreno un modelo?");

  expect(answer.references.map((ref) => ref.path)).not.toContain("/modelos");
  expect(answer.context_used.map((ref) => ref.id)).not.toContain("task:entrenar-modelo");
  expect(answer.context_used.map((ref) => ref.id)).not.toContain("view:/modelos");
});
