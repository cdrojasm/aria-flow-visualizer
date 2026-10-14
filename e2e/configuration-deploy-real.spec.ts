import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.setTimeout(180_000);

type Auth = { access_token: string };
type Configuration = {
  configuration_id: string;
  version: number;
  name: string;
  active: boolean;
  ever_tested: boolean;
};

async function login(api: APIRequestContext, email: string, password: string): Promise<Auth> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Auth>;
}

async function activeConfiguration(api: APIRequestContext, token: string) {
  const response = await api.get("/api/v0/configurations/active", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok(), `configuración activa: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Configuration>;
}

async function signInThroughUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$|\/monitor$|\/cola$/);
}

async function configurationDetail(
  api: APIRequestContext,
  token: string,
  configurationId: string,
  version: number,
) {
  const response = await api.get(
    `/api/v0/configurations/${encodeURIComponent(configurationId)}/versions/${version}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.ok(), `configuración ${configurationId}:v${version}: ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<Configuration>;
}

async function restoreActiveConfiguration(
  api: APIRequestContext,
  token: string,
  original: Configuration,
) {
  const current = await activeConfiguration(api, token);
  if (
    current.configuration_id === original.configuration_id &&
    current.version === original.version
  ) {
    return;
  }

  const response = await api.post(
    `/api/v0/configurations/${encodeURIComponent(original.configuration_id)}/versions/${original.version}/activate`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.ok(), `restauración de producción: ${await response.text()}`).toBeTruthy();
  await expect
    .poll(async () => {
      const active = await activeConfiguration(api, token);
      return `${active.configuration_id}:v${active.version}`;
    })
    .toBe(`${original.configuration_id}:v${original.version}`);
}

test("E01 real: consulta versiones y despliega una versión con aprobación", async ({
  page,
  browser,
  request,
}) => {
  const managerEmail = process.env.E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  const channelManagerEmail = process.env.E2E_CHANNEL_MANAGER_EMAIL;
  const channelManagerPassword = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
  const configurationId = process.env.E2E_DEPLOY_CONFIGURATION_ID;
  const version = Number(process.env.E2E_DEPLOY_VERSION);

  test.skip(
    !managerEmail ||
      !managerPassword ||
      !channelManagerEmail ||
      !channelManagerPassword ||
      !configurationId ||
      !Number.isInteger(version) ||
      version < 1,
    "Define credenciales de manager y channel_manager, E2E_DEPLOY_CONFIGURATION_ID y E2E_DEPLOY_VERSION para un entorno E2E aislado.",
  );

  const manager = await login(request, managerEmail!, managerPassword!);
  const originalActive = await activeConfiguration(request, manager.access_token);
  const target = await configurationDetail(
    request,
    manager.access_token,
    configurationId!,
    version,
  );
  const versionsResponse = await request.get(
    `/api/v0/configurations/${encodeURIComponent(configurationId!)}`,
    { headers: { Authorization: `Bearer ${manager.access_token}` } },
  );
  expect(versionsResponse.ok(), `historial de versiones: ${await versionsResponse.text()}`).toBeTruthy();
  const versions = (await versionsResponse.json()) as Configuration[];

  expect(versions.some((entry) => entry.version === version), "la versión objetivo debe estar en el historial").toBeTruthy();
  expect(target.ever_tested, "la versión objetivo debe tener una prueba E2E previa aprobada").toBeTruthy();
  expect(target.active, "la versión objetivo debe estar inactiva antes de solicitar el despliegue").toBe(false);
  expect(
    originalActive.ever_tested,
    "la versión activa anterior debe poder reactivarse para restaurar el entorno",
  ).toBeTruthy();

  const requestTitle = `E01 E2E despliegue ${Date.now()}`;
  const requestMessage = `Solicitud real de prueba para ${configurationId}:v${version}`;

  try {
    await signInThroughUi(page, channelManagerEmail!, channelManagerPassword!);
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Configuración del Agente" })).toBeVisible();

    const configSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Configuraciones" }) });
    const configPicker = configSection
      .getByRole("button", { name: "Configuración", exact: true })
      .locator("..");
    await configPicker.getByRole("button", { name: "Configuración", exact: true }).click();
    const configRow = configPicker.getByRole("button").filter({ hasText: target.name }).last();
    await expect(configRow).toBeVisible();
    await configRow.click();

    const versionPicker = configSection.getByRole("button", { name: /^Versión/ }).locator("..");
    await versionPicker.getByRole("button", { name: /^Versión/ }).click();
    const versionRow = versionPicker
      .getByRole("button", {
        name: new RegExp(`${target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:v${version}`),
      })
      .last();
    await expect(versionRow).toBeVisible();
    await versionRow.click();
    await expect(page.getByText(`${target.name}:v${version}`, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Solicitar despliegue" }).click();
    await expect(page.getByRole("heading", { name: "Solicitar despliegue" })).toBeVisible();
    await expect(page.getByText(/Cambios frente a producción/)).toBeVisible();
    await page.getByLabel("Título").fill(requestTitle);
    await page.getByLabel("Mensaje").fill(requestMessage);
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(page.getByRole("heading", { name: "Solicitar despliegue" })).toHaveCount(0);

    const approverPage = await browser.newPage();
    try {
      await signInThroughUi(approverPage, managerEmail!, managerPassword!);
      await approverPage.goto("/configuracion");
      await expect(
        approverPage.getByRole("heading", { name: "Solicitudes de despliegue" }),
      ).toBeVisible();

      const requestCard = approverPage.getByText(requestTitle, { exact: true }).locator("xpath=../..");
      await expect(requestCard.getByText(requestMessage, { exact: true })).toBeVisible();
      await requestCard.getByRole("button", { name: "Aprobar y desplegar" }).click();
      await expect(requestCard.getByText(/Aprobada por/)).toBeVisible();

      await expect
        .poll(async () => {
          const active = await activeConfiguration(request, manager.access_token);
          return `${active.configuration_id}:v${active.version}`;
        })
        .toBe(`${configurationId}:v${version}`);
    } finally {
      await approverPage.close();
    }
  } finally {
    await restoreActiveConfiguration(request, manager.access_token, originalActive);
  }
});
