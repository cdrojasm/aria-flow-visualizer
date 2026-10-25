import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

// PENDIENTES_MVC #17: every create/edit form opens in the same right-hand
// SideDrawer (fixed, overlay, close button, Esc / click-outside, unsaved-
// changes prompt). Runs as channel_manager, the only role that reaches Testing,
// Modelos, Biblioteca and the Agente tab of Configuración. Real API through nginx; nothing is mocked.

async function login(api: APIRequestContext, email: string, password: string): Promise<string> {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return ((await response.json()) as { access_token: string }).access_token;
}

async function expectApiSuccess(response: APIResponse, operation: string) {
  if (!response.ok()) throw new Error(`${operation}: ${await response.text()}`);
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
    const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
    const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
    test.skip(
      !email || !password,
      "Define E2E_CHANNEL_MANAGER_EMAIL y E2E_CHANNEL_MANAGER_PASSWORD.",
    );
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

  test("Modelos: Nuevo modelo abre el asistente de entrenamiento en el drawer", async ({
    page,
  }) => {
    await page.goto("/modelos");
    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    const drawer = await expectRightDrawer(page, "Crear y entrenar modelo");
    await expect(drawer.getByRole("navigation", { name: "Pasos del entrenamiento" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await page.getByPlaceholder("xgboost-historico-v1").fill("borrador-e2e-drawer");
    await closeWithButton(page);

    await page.getByRole("button", { name: "Nuevo modelo" }).click();
    await expectRightDrawer(page, "Crear y entrenar modelo");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("side-drawer")).toBeHidden();
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
      // The tag input loses its placeholder after the first tag: use the last textbox.
      const columns = drawer.getByRole("textbox").last();
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
    await expect(page.getByRole("alertdialog")).toBeHidden();
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

  test("Biblioteca: crear y editar una lista usa el drawer y persiste por la API real", async ({
    page,
    request,
  }) => {
    const name = `e2e_drawer_watchlist_${Date.now()}`;
    const auth = { Authorization: `Bearer ${token}` };
    let createdId: string | undefined;
    try {
      await page.goto("/biblioteca");
      await page.getByRole("button", { name: "Listas negras/blancas", exact: true }).click();
      await page.getByRole("button", { name: "Nueva lista" }).click();
      const drawer = await expectRightDrawer(page, "Nueva lista");
      await drawer.getByPlaceholder("Cuentas mula conocidas").fill(name);
      await page.keyboard.press("Escape");
      const discardPrompt = page.getByRole("alertdialog");
      await expect(discardPrompt.getByText("¿Descartar los cambios?")).toBeVisible();
      await discardPrompt.getByRole("button", { name: "Seguir editando" }).click();
      await waitForAlertDialogAnimation(page);
      await expect(drawer.getByPlaceholder("Cuentas mula conocidas")).toHaveValue(name);
      await drawer.getByRole("textbox").nth(1).fill("Lista de prueba E2E");
      const createdResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/v0/watchlists",
      );
      await drawer.getByRole("button", { name: "Crear", exact: true }).click();
      const created = await createdResponse;
      expect(created.ok(), await created.text()).toBeTruthy();
      createdId = ((await created.json()) as { id: string }).id;
      await expect(page.getByTestId("side-drawer")).toBeHidden();

      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Editar" }).click();
      const editDrawer = await expectRightDrawer(page, "Editar lista");
      await editDrawer.getByPlaceholder("Cuentas mula conocidas").fill(`${name}_editada`);
      const updatedResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PATCH" &&
          new URL(response.url()).pathname === `/api/v0/watchlists/${createdId}`,
      );
      await editDrawer.getByRole("button", { name: "Guardar", exact: true }).click();
      expect((await updatedResponse).ok()).toBeTruthy();
      await expect(page.getByTestId("side-drawer")).toBeHidden();
      await expect(page.getByRole("row").filter({ hasText: `${name}_editada` })).toBeVisible();
    } finally {
      if (createdId) {
        await request.delete(`/api/v0/watchlists/${encodeURIComponent(createdId)}`, {
          headers: auth,
        });
      }
    }
  });

  test("Biblioteca: los formularios de conocimiento abren el drawer compartido", async ({
    page,
    request,
  }) => {
    const suffix = Date.now().toString();
    const auth = { Authorization: `Bearer ${token}` };
    let taxonomyId: string | undefined;
    try {
      const taxonomyResponse = await request.post("/api/v0/library/taxonomies", {
        headers: auth,
        data: {
          code: `E2E-SD-${suffix}`,
          name: `Taxonomía drawer ${suffix}`,
          description: "Fixture real para verificar formularios de Biblioteca.",
          examples: [],
        },
      });
      await expectApiSuccess(taxonomyResponse, "Crear taxonomía de fixture");
      taxonomyId = ((await taxonomyResponse.json()) as { id: string }).id;

      const modusOperandiResponse = await request.post("/api/v0/library/modus-operandi", {
        headers: auth,
        data: {
          title: `MO drawer ${suffix}`,
          narrative: "Fixture real para verificar los formularios de Biblioteca.",
          taxonomy_library_id: taxonomyId,
          evolved_variables: [],
        },
      });
      await expectApiSuccess(modusOperandiResponse, "Crear modus operandi de fixture");
      const modusOperandi = (await modusOperandiResponse.json()) as { title: string };

      await page.goto("/biblioteca");
      await page.getByRole("button", { name: "Canales", exact: true }).click();
      await page.getByRole("button", { name: "Nuevo canal" }).click();
      await expectRightDrawer(page, "Nuevo canal");
      await closeWithButton(page);

      await page.getByRole("button", { name: "Base de conocimiento", exact: true }).click();
      await page.getByRole("button", { name: "Taxonomías de fraude", exact: true }).click();
      await page.getByRole("button", { name: "Nueva taxonomía" }).click();
      await expectRightDrawer(page, "Nueva taxonomía");
      await closeWithButton(page);

      await page.getByRole("button", { name: "Modus operandi", exact: true }).click();
      await page.getByRole("button", { name: "Nuevo modus operandi" }).click();
      await expectRightDrawer(page, "Nuevo modus operandi");
      await closeWithButton(page);

      await page.getByRole("button", { name: "Red flags", exact: true }).click();
      await page.getByRole("button", { name: "Nueva flag" }).click();
      await expectRightDrawer(page, "Nueva flag");
      await closeWithButton(page);

      await page.getByRole("button", { name: "Casos similares", exact: true }).click();
      await page.getByRole("button", { name: "Nuevo caso", exact: true }).click();
      await expectRightDrawer(page, "Nuevo caso similar");
      await closeWithButton(page);

      await page.getByRole("button", { name: "Modus operandi", exact: true }).click();
      await page
        .getByRole("row")
        .filter({ hasText: modusOperandi.title })
        .getByRole("button", { name: `Playbook de ${modusOperandi.title}` })
        .click();
      await expectRightDrawer(page, "Playbook");
      await closeWithButton(page);
    } finally {
      if (taxonomyId) {
        await request.delete(`/api/v0/library/taxonomies/${encodeURIComponent(taxonomyId)}`, {
          headers: auth,
        });
      }
    }
  });

  test("Biblioteca: los tres catálogos de eventos crean valores desde el drawer", async ({
    page,
    request,
  }) => {
    const auth = { Authorization: `Bearer ${token}` };
    const createdTags: { category: string; id: string }[] = [];
    const catalogs = [
      { category: "integration_point", label: "Punto de integración" },
      { category: "triggered_rule", label: "Regla disparada" },
      { category: "event_type", label: "Tipo de evento" },
    ];
    try {
      await page.goto("/biblioteca");
      await page.getByRole("button", { name: "Catálogos de eventos", exact: true }).click();
      for (const catalog of catalogs) {
        const value = `e2e drawer ${catalog.category} ${Date.now()}`;
        await page.getByRole("button", { name: catalog.label, exact: true }).click();
        await page.getByRole("button", { name: "Nuevo valor", exact: true }).click();
        const drawer = await expectRightDrawer(page, `Nuevo valor de ${catalog.label}`);
        const valueInput = drawer.getByPlaceholder(
          `Nuevo valor de ${catalog.label.toLowerCase()}…`,
        );
        await expect(drawer.getByRole("button", { name: "Agregar valor" })).toBeDisabled();
        await valueInput.fill(value);
        const createResponse = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/api/v0/tag-catalog",
        );
        await drawer.getByRole("button", { name: "Agregar valor" }).click();
        const created = await createResponse;
        await expectApiSuccess(created, `Crear valor de ${catalog.label}`);
        const tag = (await created.json()) as { id: string };
        createdTags.push({ category: catalog.category, id: tag.id });
        await expect(page.getByTestId("side-drawer")).toBeHidden();
        await expect(page.getByRole("row").filter({ hasText: value })).toBeVisible();
      }
    } finally {
      for (const tag of createdTags) {
        await request.delete(`/api/v0/tag-catalog/${tag.category}/${encodeURIComponent(tag.id)}`, {
          headers: auth,
        });
      }
    }
  });
});

test.describe("drawer lateral único: Configuración", () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
    const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
    test.skip(
      !email || !password,
      "Define E2E_CHANNEL_MANAGER_EMAIL y E2E_CHANNEL_MANAGER_PASSWORD.",
    );
    token = await login(request, email!, password!);
    await authenticatePage(page, token);
    await page.goto("/configuracion");
    await page.getByRole("button", { name: "Agente", exact: true }).click();
    await page.getByRole("button", { name: "Analista", exact: true }).click();
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
      await expect(drawer.getByRole("cell", { name: value, exact: true })).toBeVisible();

      // The confirmation stacks above the drawer and the drawer survives it.
      await drawer
        .getByRole("button", { name: `Eliminar ${catalog.deleteLabel} ${value}` })
        .click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm.getByText(catalog.confirmTitle)).toBeVisible();
      await confirm.getByRole("button", { name: "Eliminar", exact: true }).click();
      await expect(drawer.getByRole("cell", { name: value, exact: true })).toHaveCount(0);

      await closeWithButton(page);
    });
  }
});
