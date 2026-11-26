import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Settings = Record<string, unknown> & { agent_traffic_pct: number };

async function login(api: APIRequestContext, email: string, password: string) {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as { access_token: string };
}

async function settings(api: APIRequestContext, token: string): Promise<Settings> {
  const response = await api.get("/api/v0/operational-settings", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `lectura de ajustes: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Settings>;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: "aria.auth.accessToken",
    value: token,
  });
}

test("Llave de paso real: prepara, anuncia, confirma y queda en el historial", async ({
  page,
  request,
}) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  test.skip(!email || !password, "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.");

  const manager = await login(request, email!, password!);
  const headers = { Authorization: `Bearer ${manager.access_token}` };
  const original = await settings(request, manager.access_token);
  // Start from a known value so the test is repeatable.
  const base = { ...original, agent_traffic_pct: 100 };
  const seed = await request.put("/api/v0/operational-settings", {
    headers,
    data: { settings: base, changed_by: email },
  });
  expect(seed.ok(), `semilla: ${await seed.text()}`).toBeTruthy();

  try {
    await authenticatePage(page, manager.access_token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Operación (inmediata)" }).click();

    const gate = page.getByTestId("traffic-gate");
    await expect(gate).toBeVisible();
    await expect(gate.getByTestId("traffic-current")).toContainText(
      "ARIA recibe 100 % del tráfico",
    );
    const apply = gate.getByRole("button", { name: /Aplicar porcentaje/ });
    await expect(apply).toBeDisabled();

    // 1. Preparing the value and cancelling the announcement changes nothing.
    await gate.getByRole("button", { name: "25 %" }).click();
    await apply.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("100 % → 25 %");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect((await settings(request, manager.access_token)).agent_traffic_pct).toBe(100);
    await expect(gate.getByTestId("traffic-current")).toContainText("100 %");

    // 2. Confirming applies it for real, without touching the other settings.
    await apply.click();
    await dialog.getByRole("button", { name: "Confirmar y aplicar" }).click();
    await expect(dialog).toBeHidden();
    await expect(gate.getByTestId("traffic-current")).toContainText("ARIA recibe 25 % del tráfico");
    const applied = await settings(request, manager.access_token);
    expect(applied.agent_traffic_pct).toBe(25);
    expect(applied.agent_enabled).toBe(base.agent_enabled);
    expect(applied.maturing_days).toBe(base.maturing_days);

    // The permanent banner now reminds everyone the gate is below 100 %.
    await expect(page.getByTestId("traffic-gate-banner")).toContainText("ARIA recibe 25 %");

    // 3. The change is audited and survives a reload.
    const history = await request.get("/api/v0/operational-settings/history?limit=1", { headers });
    const [latest] = (await history.json()) as Array<{
      changed_by: string | null;
      changes: { path: string; previous: number; new: number }[];
    }>;
    expect(latest.changed_by).toBe(email);
    expect(latest.changes).toEqual([{ path: "agent_traffic_pct", previous: 100, new: 25 }]);
    await page.reload();
    await page.getByRole("button", { name: "Operación (inmediata)" }).click();
    await expect(page.getByTestId("traffic-current")).toContainText("ARIA recibe 25 % del tráfico");
    await expect(page.getByTestId("traffic-gate-banner")).toBeVisible();

    // 4. Raising it back is announced as additive.
    await page.getByTestId("traffic-gate").getByRole("button", { name: "100 %" }).click();
    await page.getByRole("button", { name: /Aplicar porcentaje/ }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Las alertas que ARIA ya tenía asignadas se mantienen",
    );
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("traffic-gate-banner")).toBeVisible();
  } finally {
    const restore = await request.put("/api/v0/operational-settings", {
      headers,
      data: { settings: original, changed_by: email },
    });
    expect(restore.ok(), `restauración: ${await restore.text()}`).toBeTruthy();
  }
});
