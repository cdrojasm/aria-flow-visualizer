import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Auth = { access_token: string };
type Settings = Record<string, unknown> & {
  maturing_days: number;
  expected_coverage_pct: number;
  stable_months: number;
};

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
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

test("H1 real: guarda la ventana de maduración y aplica los valores del servidor", async ({
  page,
  request,
}) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  test.skip(!email || !password, "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.");

  const manager = await login(request, email!, password!);
  const original = await settings(request, manager.access_token);
  const headers = { Authorization: `Bearer ${manager.access_token}` };
  const updated = {
    ...original,
    maturing_days: original.maturing_days === 8 ? 9 : 8,
    expected_coverage_pct: original.expected_coverage_pct === 97 ? 96.5 : 97,
    stable_months: original.stable_months === 11 ? 10 : 11,
  };

  try {
    await authenticatePage(page, manager.access_token);
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración del Agente" })).toBeVisible();
    await page.getByRole("button", { name: "Operación (inmediata)" }).click();

    const maturitySection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Maduración del fraude" }) });
    await expect(maturitySection).toBeVisible();
    await maturitySection
      .locator('input[type="number"]')
      .nth(0)
      .fill(String(updated.maturing_days));
    await maturitySection
      .locator('input[type="number"]')
      .nth(1)
      .fill(String(updated.expected_coverage_pct));
    await maturitySection
      .locator('input[type="number"]')
      .nth(2)
      .fill(String(updated.stable_months));
    await page.getByRole("button", { name: "Guardar y aplicar" }).click();

    await expect
      .poll(async () => {
        const saved = await settings(request, manager.access_token);
        return [saved.maturing_days, saved.expected_coverage_pct, saved.stable_months];
      })
      .toEqual([updated.maturing_days, updated.expected_coverage_pct, updated.stable_months]);

    const historyResponse = await request.get("/api/v0/operational-settings/history?limit=1", {
      headers,
    });
    expect(historyResponse.ok(), `historial: ${await historyResponse.text()}`).toBeTruthy();
    const [latest] = (await historyResponse.json()) as Array<{
      changed_by: string | null;
      changes: { path: string }[];
    }>;
    expect(latest.changed_by).toBe(email);
    expect(new Set(latest.changes.map((change) => change.path))).toEqual(
      new Set(["maturing_days", "expected_coverage_pct", "stable_months"]),
    );
  } finally {
    const restoreResponse = await request.put("/api/v0/operational-settings", {
      headers,
      data: { settings: original, changed_by: email },
    });
    expect(
      restoreResponse.ok(),
      `restauración de OperationalSettings: ${await restoreResponse.text()}`,
    ).toBeTruthy();
  }
});
