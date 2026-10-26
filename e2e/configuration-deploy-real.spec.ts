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

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: "aria.auth.accessToken",
    value: token,
  });
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
  expect(
    response.ok(),
    `configuración ${configurationId}:v${version}: ${await response.text()}`,
  ).toBeTruthy();
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
  expect(
    versionsResponse.ok(),
    `historial de versiones: ${await versionsResponse.text()}`,
  ).toBeTruthy();
  const versions = (await versionsResponse.json()) as Configuration[];

  expect(
    versions.some((entry) => entry.version === version),
    "la versión objetivo debe estar en el historial",
  ).toBeTruthy();
  expect(
    target.ever_tested,
    "la versión objetivo debe tener una prueba E2E previa aprobada",
  ).toBeTruthy();
  expect(
    target.active,
    "la versión objetivo debe estar inactiva antes de solicitar el despliegue",
  ).toBe(false);
  expect(
    originalActive.ever_tested,
    "la versión activa anterior debe poder reactivarse para restaurar el entorno",
  ).toBeTruthy();

  const channelManager = await login(request, channelManagerEmail!, channelManagerPassword!);
  const previewResponse = await request.get(
    `/api/v0/configuration-deploy-requests/preview?target_configuration_id=${encodeURIComponent(configurationId!)}&target_version=${version}`,
    { headers: { Authorization: `Bearer ${channelManager.access_token}` } },
  );
  expect(
    previewResponse.ok(),
    `vista previa por API: HTTP ${previewResponse.status()} ${await previewResponse.text()}`,
  ).toBeTruthy();
  const preview = (await previewResponse.json()) as { changes: unknown[] };
  expect(
    preview.changes.length,
    "la API debe devolver cambios para la versión candidata",
  ).toBeGreaterThan(0);

  const requestTitle = `E01 E2E despliegue ${Date.now()}`;
  const requestMessage = `Solicitud real de prueba para ${configurationId}:v${version}`;

  try {
    await authenticatePage(page, channelManager.access_token);
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
    await expect(
      page.getByText(`${target.name}:v${version}`, { exact: true }).first(),
    ).toBeVisible();

    await page.getByRole("button", { name: "Solicitar despliegue" }).click();
    await expect(page.getByRole("heading", { name: "Solicitar despliegue" })).toBeVisible();
    await expect(page.getByText(/Cambios frente a producción/)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("Título").fill(requestTitle);
    await page.getByLabel("Mensaje").fill(requestMessage);
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(page.getByRole("heading", { name: "Solicitar despliegue" })).toHaveCount(0);

    const approverPage = await browser.newPage();
    try {
      await authenticatePage(approverPage, manager.access_token);
      await approverPage.goto("/configuracion");
      await expect(
        approverPage.getByRole("heading", { name: "Solicitudes de despliegue" }),
      ).toBeVisible();

      const requestCard = approverPage
        .getByText(requestTitle, { exact: true })
        .locator("xpath=../..");
      await expect(requestCard.getByText(requestMessage, { exact: true })).toBeVisible();
      const approvalResponsePromise = approverPage.waitForResponse(
        (response) =>
          response.url().includes("/configuration-deploy-requests/") &&
          response.url().endsWith("/approve"),
      );
      await requestCard.getByRole("button", { name: "Aprobar y desplegar" }).click();
      const approvalResponse = await approvalResponsePromise;
      expect(
        approvalResponse.ok(),
        `aprobación API: HTTP ${approvalResponse.status()} ${await approvalResponse.text()}`,
      ).toBeTruthy();
      await expect
        .poll(async () => {
          const response = await request.get("/api/v0/configuration-deploy-requests", {
            headers: { Authorization: `Bearer ${manager.access_token}` },
          });
          expect(response.ok(), `solicitudes: ${await response.text()}`).toBeTruthy();
          const requests = (await response.json()) as Array<{
            title: string;
            status: string;
          }>;
          return requests.find((item) => item.title === requestTitle)?.status;
        })
        .toBe("approved");

      await expect
        .poll(async () => {
          const active = await activeConfiguration(request, manager.access_token);
          return `${active.configuration_id}:v${active.version}`;
        })
        .toBe(`${configurationId}:v${version}`);

      // El grafo de versiones muestra el comentario de la versión promovida.
      const graphResponse = await request.get("/api/v0/configurations/graph", {
        headers: { Authorization: `Bearer ${manager.access_token}` },
      });
      expect(graphResponse.ok(), `grafo: ${await graphResponse.text()}`).toBeTruthy();
      const graph = (await graphResponse.json()) as Array<{
        configuration_id: string;
        version: number;
        promotion_comment: string | null;
      }>;
      expect(
        graph.find((node) => node.configuration_id === configurationId && node.version === version)
          ?.promotion_comment,
      ).toBe(requestMessage);

      await approverPage.goto("/configuracion");
      const graphView = approverPage.getByTestId("configuration-version-graph");
      await expect(graphView).toBeVisible();
      await graphView.getByText(`${target.name} v${version}`, { exact: false }).first().click();
      await expect(approverPage.getByTestId("configuration-graph-detail")).toContainText(
        `Comentario de promoción: ${requestMessage}`,
      );
    } finally {
      await approverPage.close();
    }
  } finally {
    await restoreActiveConfiguration(request, manager.access_token, originalActive);
  }
});
