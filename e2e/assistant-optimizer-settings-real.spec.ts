import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Settings = Record<string, boolean | number | string[]> & {
  assistant_max_message_chars: number;
};
type Auth = { access_token: string };

async function login(api: APIRequestContext, email: string, password: string) {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function settings(api: APIRequestContext, token: string) {
  const response = await api.get("/api/v0/assistant-optimizer-settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `lectura H2: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Settings>;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
}

test("H2 real: guarda ajustes del asistente y registra el historial", async ({ page, request }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  test.skip(!email || !password, "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.");

  const manager = await login(request, email!, password!);
  const original = await settings(request, manager.access_token);
  const headers = { Authorization: `Bearer ${manager.access_token}` };
  const next = {
    ...original,
    assistant_max_message_chars: original.assistant_max_message_chars === 7_999 ? 7_998 : 7_999,
  };

  try {
    await authenticatePage(page, manager.access_token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Asistente y optimizador" }).click();
    const assistantSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Asistente" }),
    });
    await expect(assistantSection).toBeVisible();
    await assistantSection
      .locator('input[type="number"]')
      .first()
      .fill(String(next.assistant_max_message_chars));
    await assistantSection.getByRole("button", { name: "Guardar sección" }).click();

    await expect
      .poll(async () => (await settings(request, manager.access_token)).assistant_max_message_chars)
      .toBe(next.assistant_max_message_chars);
    const history = await request.get("/api/v0/assistant-optimizer-settings/changes?limit=1", {
      headers,
    });
    expect(history.ok(), `historial H2: ${await history.text()}`).toBeTruthy();
    const [latest] = (await history.json()) as {
      changed_by: string;
      changes: { path: string }[];
    }[];
    expect(latest.changed_by).toBe(email);
    expect(latest.changes.map(({ path }) => path)).toContain("assistant_max_message_chars");
  } finally {
    const restored = await request.put("/api/v0/assistant-optimizer-settings", {
      headers,
      data: { settings: original },
    });
    expect(restored.ok(), `restauración H2: ${await restored.text()}`).toBeTruthy();
  }
});

test("H2 real: guarda los reintentos ante fallos reintentables del optimizador", async ({
  page,
  request,
}) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  test.skip(!email || !password, "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.");

  const manager = await login(request, email!, password!);
  const original = await settings(request, manager.access_token);
  const headers = { Authorization: `Bearer ${manager.access_token}` };
  expect(typeof original.optimizer_max_retryable_failures).toBe("number");
  const next = original.optimizer_max_retryable_failures === 3 ? 4 : 3;

  try {
    await authenticatePage(page, manager.access_token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Asistente y optimizador" }).click();
    const optimizerSection = page.locator("section").filter({
      has: page.getByRole("heading", { name: /^Optimizador\b/ }),
    });
    await expect(optimizerSection).toBeVisible();
    await optimizerSection
      .locator("div")
      .filter({ has: page.getByText("Reintentos ante fallos reintentables", { exact: true }) })
      .last()
      .locator('input[type="number"]')
      .fill(String(next));
    await optimizerSection.getByRole("button", { name: "Guardar sección" }).click();

    await expect
      .poll(async () => (await settings(request, manager.access_token)).optimizer_max_retryable_failures)
      .toBe(next);
  } finally {
    const restored = await request.put("/api/v0/assistant-optimizer-settings", {
      headers,
      data: { settings: original },
    });
    expect(restored.ok(), `restauración H2: ${await restored.text()}`).toBeTruthy();
  }
});
