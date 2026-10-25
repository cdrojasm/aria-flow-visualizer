import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// PENDIENTES_MVC #17: every create/edit form opens in the same right-hand
// SideDrawer (fixed, overlay, close button, Esc / click-outside, unsaved-
// changes prompt). Real API through nginx; nothing is mocked.

async function login(api: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function authenticatePage(page: Page, token: string) {
  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: "aria.auth.accessToken",
    value: token,
  });
}

async function expectRightDrawer(page: Page, title: string) {
  const drawer = page.getByTestId("side-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: title })).toBeVisible();
  const box = await drawer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x + box!.width).toBeCloseTo(viewport.width, 0);
  expect(box!.height).toBeCloseTo(viewport.height, 0);
  return drawer;
}

test.describe("drawer lateral único", () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    const email = process.env.E2E_MANAGER_EMAIL;
    const password = process.env.E2E_MANAGER_PASSWORD;
    test.skip(!email || !password, "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.");
    token = await login(request, email!, password!);
    await authenticatePage(page, token);
  });

  test("Testing: Nueva prueba abre el drawer y cierra con el botón y con Esc", async ({ page }) => {
    await page.goto("/testing");
    await page.getByRole("button", { name: "Nueva prueba" }).click();
    const drawer = await expectRightDrawer(page, "Nueva prueba");
    await drawer.getByRole("button", { name: "Cerrar panel" }).click();
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Nueva prueba" }).click();
    await expectRightDrawer(page, "Nueva prueba");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("side-drawer")).toBeHidden();
  });

  test("Modelos: Nuevo modelo usa el mismo drawer", async ({ page }) => {
    await page.goto("/modelos");
    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    const drawer = await expectRightDrawer(page, "Nuevo modelo");
    await drawer.getByRole("button", { name: "Cerrar panel" }).click();
    await expect(drawer).toBeHidden();
  });

  test("Biblioteca: Dataset vacío usa el drawer y avisa de cambios sin guardar", async ({
    page,
  }) => {
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "Datasets", exact: true }).click();
    await page.getByRole("button", { name: "Dataset vacío" }).click();
    const drawer = await expectRightDrawer(page, "Crear dataset vacío");

    // Without edits it closes straight away.
    await drawer.getByRole("button", { name: "Cerrar panel" }).click();
    await expect(drawer).toBeHidden();

    // With edits, closing asks first; "Seguir editando" keeps the draft.
    await page.getByRole("button", { name: "Dataset vacío" }).click();
    await page.getByPlaceholder("Ej: casos_revision_manual").fill("borrador_e2e_drawer");
    await page.keyboard.press("Escape");
    const prompt = page.getByRole("alertdialog");
    await expect(prompt.getByText("¿Descartar los cambios?")).toBeVisible();
    await prompt.getByRole("button", { name: "Seguir editando" }).click();
    await expect(page.getByPlaceholder("Ej: casos_revision_manual")).toHaveValue(
      "borrador_e2e_drawer",
    );

    await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByTestId("side-drawer")).toBeHidden();
  });

  test("Configuración muestra el grafo real de versiones en solo lectura", async ({ page }) => {
    await page.goto("/configuracion");
    await expect(page.getByRole("heading", { name: "Grafo de versiones" })).toBeVisible();
    await expect(page.getByText(/Versión raíz|Derivada de/).first()).toBeVisible();
  });
});
