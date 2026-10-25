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

// The drawer slides in, so poll until its right edge settles on the viewport.
async function expectRightDrawer(page: Page, title: string) {
  const drawer = page.getByTestId("side-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: title })).toBeVisible();
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await drawer.boundingBox();
      return box ? Math.round(box.x + box.width) : -1;
    })
    .toBe(viewport.width);
  const box = (await drawer.boundingBox())!;
  expect(Math.round(box.height)).toBe(viewport.height);
  return drawer;
}

async function closeWithButton(page: Page) {
  const drawer = page.getByTestId("side-drawer");
  await drawer.getByRole("button", { name: "Cerrar panel" }).click();
  await expect(drawer).toBeHidden();
}

async function openDatasetsTab(page: Page) {
  await page.goto("/biblioteca");
  await page.getByRole("button", { name: "Datasets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dataset vacío" })).toBeVisible();
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

  test("Testing: Nueva prueba abre el drawer y cierra con el botón, Esc y clic fuera", async ({
    page,
  }) => {
    await page.goto("/testing");
    await page.getByRole("button", { name: "Nueva prueba" }).click();
    await expectRightDrawer(page, "Nueva prueba");
    await closeWithButton(page);

    await page.getByRole("button", { name: "Nueva prueba" }).click();
    await expectRightDrawer(page, "Nueva prueba");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("side-drawer")).toBeHidden();

    await page.getByRole("button", { name: "Nueva prueba" }).click();
    await expectRightDrawer(page, "Nueva prueba");
    await page.mouse.click(10, 300); // overlay, far from the right-hand drawer
    await expect(page.getByTestId("side-drawer")).toBeHidden();
  });

  test("Testing: las tres estrategias de lanzamiento viven dentro del drawer", async ({ page }) => {
    await page.goto("/testing");
    await page.getByRole("button", { name: "Nueva prueba" }).click();
    const drawer = await expectRightDrawer(page, "Nueva prueba");
    for (const tab of ["Dataset", "Formulario", "Generador"]) {
      await drawer.getByRole("tab", { name: tab }).click();
      await expect(drawer.getByRole("tab", { name: tab })).toHaveAttribute("data-state", "active");
    }
  });

  test("Modelos: Nuevo modelo usa el drawer, valida y avisa de cambios sin guardar", async ({
    page,
  }) => {
    await page.goto("/modelos");
    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    const drawer = await expectRightDrawer(page, "Nuevo modelo");
    await expect(drawer.getByRole("button", { name: "Crear modelo" })).toBeDisabled();
    await closeWithButton(page); // pristine form closes without asking

    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    await page.getByPlaceholder("Ej: xus-v1").fill("borrador-e2e-drawer");
    await expect(
      page.getByTestId("side-drawer").getByRole("button", { name: "Crear modelo" }),
    ).toBeDisabled(); // still needs dataset, target, labels and transforms
    await page.keyboard.press("Escape");
    const prompt = page.getByRole("alertdialog");
    await expect(prompt.getByText("¿Descartar los cambios?")).toBeVisible();
    await prompt.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByTestId("side-drawer")).toBeHidden();

    // Discarding resets the draft.
    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    await expect(page.getByPlaceholder("Ej: xus-v1")).toHaveValue("");
  });

  test("Biblioteca: Dataset vacío crea el dataset desde el drawer y abre su detalle", async ({
    page,
    request,
  }) => {
    const name = `e2e_drawer_${Date.now()}`;
    const auth = { Authorization: `Bearer ${token}` };
    try {
      await openDatasetsTab(page);
      await page.getByRole("button", { name: "Dataset vacío" }).click();
      const drawer = await expectRightDrawer(page, "Crear dataset vacío");
      await expect(drawer.getByRole("button", { name: "Crear dataset" })).toBeDisabled();
      await page.getByPlaceholder("Ej: casos_revision_manual").fill(name);
      const columns = page.getByPlaceholder("Ej: id_transaccion");
      await columns.fill("id_transaccion");
      await columns.press("Enter");
      await columns.fill("monto");
      await columns.press("Enter");

      const created = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v0/datasets/empty",
      );
      await drawer.getByRole("button", { name: "Crear dataset" }).click();
      expect((await created).ok()).toBeTruthy();
      await expect(page.getByTestId("side-drawer")).toBeHidden();

      // The detail view is the same drawer, wider.
      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Visualizar" }).click();
      await expectRightDrawer(page, `Dataset: ${name}`);
      await page.getByTestId("side-drawer").getByRole("tab", { name: "Mapeo de alertas" }).click();
      await closeWithButton(page);
    } finally {
      await request.delete(`/api/v0/datasets/${encodeURIComponent(name)}`, { headers: auth });
    }
  });

  test("Biblioteca: Dataset vacío avisa de cambios sin guardar", async ({ page }) => {
    await openDatasetsTab(page);
    await page.getByRole("button", { name: "Dataset vacío" }).click();
    await expectRightDrawer(page, "Crear dataset vacío");
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

  test("Biblioteca: Subir CSV y Extraer / derivar usan el mismo drawer", async ({ page }) => {
    await openDatasetsTab(page);
    await page.getByRole("button", { name: "Subir CSV" }).click();
    const upload = await expectRightDrawer(page, "Subir dataset (CSV)");
    await expect(upload.getByRole("button", { name: "Subir dataset" })).toBeDisabled();
    await closeWithButton(page);

    await page.getByRole("button", { name: "Extraer / derivar" }).click();
    await expectRightDrawer(page, "Extraer / derivar dataset");
    await closeWithButton(page);
  });
});

test.describe("drawer lateral único: Configuración", () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    const email = process.env.E2E_RELEASE_MANAGER_EMAIL;
    const password = process.env.E2E_RELEASE_MANAGER_PASSWORD;
    test.skip(
      !email || !password,
      "Define E2E_RELEASE_MANAGER_EMAIL y E2E_RELEASE_MANAGER_PASSWORD.",
    );
    token = await login(request, email!, password!);
    await authenticatePage(page, token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Agente", exact: true }).click();
  });

  for (const catalog of [
    {
      trigger: "marcación",
      title: "Gestionar categorías de marcación",
      placeholder: "Nueva razón de marcación…",
      deleteLabel: "categoría",
      confirmTitle: "Eliminar categoría",
    },
    {
      trigger: "método de resolución",
      title: "Gestionar métodos de resolución",
      placeholder: "Nuevo método de resolución…",
      deleteLabel: "método",
      confirmTitle: "Eliminar método de resolución",
    },
  ]) {
    test(`catálogo de ${catalog.trigger}: alta y baja dentro del drawer`, async ({ page }) => {
      const value = `e2e drawer ${Date.now()}`;
      await page.getByRole("button", { name: catalog.trigger, exact: true }).click();
      const drawer = await expectRightDrawer(page, catalog.title);

      await drawer.getByPlaceholder(catalog.placeholder).fill(value);
      await drawer.getByRole("button", { name: "Agregar" }).click();
      await expect(drawer.getByRole("cell", { name: value })).toBeVisible();

      // The confirmation stacks above the drawer and the drawer survives it.
      await drawer
        .getByRole("button", { name: `Eliminar ${catalog.deleteLabel} ${value}` })
        .click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm.getByText(catalog.confirmTitle)).toBeVisible();
      await confirm.getByRole("button", { name: "Eliminar", exact: true }).click();
      await expect(drawer.getByRole("cell", { name: value })).toHaveCount(0);

      await closeWithButton(page);
    });
  }
});
