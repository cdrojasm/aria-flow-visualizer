import { expect, test, type Page } from "@playwright/test";

// Shared DataTable behaviour on the real stack (no API mocking): sticky
// left-hand actions, sortable headers, column menu, first/last pagination,
// internal scroll, and the draggable assistant launcher.

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;

test.skip(!email || !password, "E2E_CHANNEL_MANAGER_EMAIL/PASSWORD are required");

async function open(page: Page, path: string) {
  const response = await page.request.post(`${baseURL}/api/v0/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const { access_token: token } = (await response.json()) as { access_token: string };
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  await page.goto(path);
}

async function expectTableBasics(page: Page, firstActionName: RegExp) {
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  // Actions are the first column, ahead of every data column.
  // (a leading checkbox column may come first when the table is selectable).
  const headers = await table.getByRole("columnheader").allInnerTexts();
  expect(headers.slice(0, 2).map((h) => h.trim().toLowerCase())).toContain("acciones");
  await expect(
    table
      .getByRole("row")
      .nth(1)
      .getByRole("button", { name: firstActionName })
      .or(table.getByRole("row").nth(1).getByRole("link", { name: firstActionName }))
      .first(),
  ).toBeVisible();
  // The table scrolls inside its own container, capped at one viewport.
  const maxHeight = await table.evaluate((el) => {
    let node: HTMLElement | null = el.parentElement;
    while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
    return node ? node.getBoundingClientRect().height : -1;
  });
  expect(maxHeight).toBeGreaterThan(0);
  expect(maxHeight).toBeLessThanOrEqual(page.viewportSize()!.height + 1);

  // Clicking a sortable header flips aria-sort.
  const sortable = table
    .getByRole("columnheader")
    .filter({ has: page.getByRole("button") })
    .first();
  await sortable.getByRole("button").click();
  await expect(sortable).toHaveAttribute("aria-sort", /ascending|descending/);

  // Column menu lists the columns and sits in the table's own toolbar: right
  // aligned and stuck to the top edge of the table.
  const columnsButton = page.getByRole("button", { name: "Columnas" });
  const [columnsBox, tableBox, cardBox] = await Promise.all([
    columnsButton.boundingBox(),
    table.boundingBox(),
    // The table itself may be wider than the card (it scrolls inside it).
    table.locator("xpath=ancestor::section[1]").boundingBox(),
  ]);
  expect(columnsBox!.y + columnsBox!.height).toBeLessThanOrEqual(tableBox!.y + 1);
  expect(tableBox!.y - (columnsBox!.y + columnsBox!.height)).toBeLessThan(24);
  expect(columnsBox!.x + columnsBox!.width).toBeGreaterThan(cardBox!.x + cardBox!.width * 0.8);
  await columnsButton.click();
  await expect(page.getByRole("menuitemcheckbox").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Dragging the right edge of a header resizes the column; the width survives a reload.
  const handles = table.getByRole("separator", { name: /Redimensionar columna/ });
  const dragHandle = async (index: number, dx: number) => {
    const box = (await handles.nth(index).boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + dx, box.y + 4, { steps: 8 });
    await page.mouse.up();
  };
  const headerWidth = async (index: number) =>
    (await handles.nth(index).locator("xpath=..").boundingBox())!.width;

  const widthBefore = await headerWidth(0);
  await dragHandle(0, 90);
  const widthAfter = await headerWidth(0);
  expect(widthAfter).toBeGreaterThan(widthBefore + 60);
  // Dragging back to the left shrinks it, never below the minimum (60 px).
  await dragHandle(0, -2000);
  const widthMin = await headerWidth(0);
  expect(widthMin).toBeLessThan(widthAfter - 20);
  expect(widthMin).toBeGreaterThanOrEqual(59);
  expect(widthMin).toBeLessThanOrEqual(64);
  // Resizing another column leaves the first one alone.
  const secondBefore = await headerWidth(1);
  await dragHandle(1, 70);
  expect(await headerWidth(1)).toBeGreaterThan(secondBefore + 40);
  expect(Math.abs((await headerWidth(0)) - widthMin)).toBeLessThan(2);

  // A hidden column and the dragged widths both survive a reload.
  const headersBefore = await table.getByRole("columnheader").count();
  await page.getByRole("button", { name: "Columnas" }).click();
  await page.getByRole("menuitemcheckbox").last().click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader")).toHaveCount(headersBefore - 1);
  const firstWidth = await headerWidth(0);
  await page.reload();
  await expect(handles.first()).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole("columnheader")).toHaveCount(headersBefore - 1);
  expect(Math.abs((await headerWidth(0)) - firstWidth)).toBeLessThan(4);

  // Rows per page: 20 by default, 50 and 100 available; changing it returns to the
  // first page and shows as many rows as the new size allows.
  const pageSize = page.getByRole("combobox", { name: "Filas por página" });
  await expect(pageSize).toHaveValue("20");
  expect(await pageSize.locator("option").allInnerTexts()).toEqual(["20", "50", "100"]);
  const summary = page.getByText(/^\d+–\d+ de \d+/).first();
  const range = async () => {
    const [, from, to, total] = (await summary.innerText()).match(/^(\d+)–(\d+) de (\d+)/)!;
    return { from: Number(from), to: Number(to), total: Number(total) };
  };
  const total = (await range()).total;
  expect((await range()).to).toBe(Math.min(20, total));
  const lastPage = page.getByRole("button", { name: "Ir al final" });
  if (await lastPage.count()) {
    await lastPage.click();
    expect((await range()).from).toBeGreaterThan(1);
  }
  for (const size of [50, 100, 20]) {
    await pageSize.selectOption(String(size));
    await expect(pageSize).toHaveValue(String(size));
    const shown = await range();
    expect(shown.from).toBe(1);
    expect(shown.to).toBe(Math.min(size, total));
    expect(await table.getByRole("row").count()).toBeGreaterThanOrEqual(Math.min(size, total) + 1);
  }

  // Pagination has jump-to-edge controls whenever there is more than one page.
  const last = page.getByRole("button", { name: "Ir al final" });
  if (await last.count()) {
    await last.click();
    await expect(page.getByText(/Página (\d+) de \1$/)).toBeVisible();
    await page.getByRole("button", { name: "Ir al inicio" }).click();
    await expect(page.getByText(/Página 1 de/)).toBeVisible();
  }
}

test("cola tables share the dense DataTable behaviour", async ({ page }) => {
  await open(page, "/cola");
  await expect(page.getByRole("heading", { name: "Pending Alerts for Analyst" })).toBeVisible();
  await expect(page.getByRole("table").first().getByRole("row").nth(1)).toBeVisible({
    timeout: 30_000,
  });
  await expectTableBasics(page, /Tomar|Seguir|Ver/);
  await page.getByRole("button", { name: "Alertas en proceso" }).click();
  await expect(page.getByRole("heading", { name: "Alertas en proceso" })).toBeVisible();
});

test("historico de fraude table is bounded, searchable and paginated", async ({ page }) => {
  await open(page, "/historico-fraude");
  await expect(page.getByRole("table").first().getByRole("row").nth(1)).toBeVisible({
    timeout: 30_000,
  });
  await expectTableBasics(page, /Revisar fraude|Auditoría|Ver/);
  const search = page.getByPlaceholder("Buscar en lo cargado por alerta, evento o cliente…");
  await search.fill("zzz-no-match-zzz");
  await expect(page.getByText("Ninguna alerta cargada coincide con la búsqueda.")).toBeVisible();
});

test("modelos catalog shows creation date and compact actions", async ({ page }) => {
  await open(page, "/modelos");
  await expect(page.getByRole("columnheader", { name: /Creado/ })).toBeVisible();
  await expect(page.getByRole("table").first().getByRole("row").nth(1)).toBeVisible({
    timeout: 30_000,
  });
  await expectTableBasics(page, /Ver/);
});

test("testing runs table uses the shared table with selection", async ({ page }) => {
  await open(page, "/testing");
  await expect(page.getByRole("heading", { name: "Últimas pruebas" })).toBeVisible();
  await expect(page.getByRole("table").first().getByRole("row").nth(1)).toBeVisible({
    timeout: 30_000,
  });
  await expectTableBasics(page, /Ver/);
});

test("assistant launcher can be dragged away and remembers its place", async ({ page }) => {
  await open(page, "/modelos");
  const launcher = page.getByRole("button", { name: "Abrir asistente ARIA" });
  await expect(launcher).toBeVisible();
  const before = (await launcher.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x - 300, before.y - 200, { steps: 8 });
  await page.mouse.up();
  const after = (await launcher.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 200);
  expect(after.y).toBeLessThan(before.y - 100);
  // A drag must not open the panel.
  await expect(page.getByRole("button", { name: "Abrir asistente ARIA" })).toBeVisible();
  await page.reload();
  const reloaded = (await page
    .getByRole("button", { name: "Abrir asistente ARIA" })
    .boundingBox())!;
  expect(Math.abs(reloaded.x - after.x)).toBeLessThan(2);
});

test("biblioteca tables put search at 70% and general actions at 30%", async ({ page }) => {
  await open(page, "/biblioteca");
  await page.getByRole("button", { name: "Canales", exact: true }).click();
  const createButton = page.getByRole("button", { name: "Nuevo canal" });
  await expect(createButton).toBeVisible();
  const search = page.getByRole("textbox", { name: "Buscar en la tabla" });
  const [searchBox, buttonBox, tableBox] = await Promise.all([
    search.boundingBox(),
    createButton.boundingBox(),
    page.getByRole("table").first().boundingBox(),
  ]);
  // Same line, actions to the right of the search bar, both above the header.
  expect(Math.abs(searchBox!.y - buttonBox!.y)).toBeLessThan(12);
  expect(buttonBox!.x).toBeGreaterThan(searchBox!.x + searchBox!.width);
  expect(buttonBox!.y).toBeLessThan(tableBox!.y);
  await expect(page.getByRole("table").first().getByRole("columnheader").nth(0)).toHaveText(
    /Acciones/i,
  );

  for (const tab of ["Datasets", "Listas negras/blancas"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Buscar en la tabla" })).toBeVisible();
  }
});

test("cells with more than two actions collapse to icon-only buttons with tooltips", async ({
  page,
}) => {
  await open(page, "/modelos");
  const firstRow = page.getByRole("table").first().getByRole("row").nth(1);
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  const train = firstRow.getByRole("button", { name: "Entrenar" });
  await expect(train).toHaveAttribute("title", "Entrenar");
  await expect(train).toHaveText("");

  // Two actions or fewer keep their labels.
  await page.goto(`${baseURL}/cola`);
  await page.getByRole("button", { name: "Alertas en proceso" }).click();
  const link = page.getByRole("table").first().getByRole("link", { name: "Ver" }).first();
  if (await link.count()) await expect(link).toHaveText("Ver");
});

test("test run detail lists cases in a compact table", async ({ page }) => {
  await open(page, "/testing");
  const firstRun = page.getByRole("table").first().getByRole("row").nth(1);
  await expect(firstRun).toBeVisible({ timeout: 30_000 });
  await firstRun.getByRole("link", { name: "Ver" }).click();
  const search = page.getByRole("textbox", { name: "Buscar por ID del caso o de la alerta" });
  await expect(search).toBeVisible({ timeout: 30_000 });
  const table = page.getByRole("table").first();
  const headers = (await table.getByRole("columnheader").allInnerTexts()).map((h) =>
    h.trim().toLowerCase(),
  );
  expect(headers).toEqual(["caso", "estado", "tiempo"]);
  // The id is trimmed hard, and no "#N" ordinal is shown.
  const firstCell = table.getByRole("row").nth(1).getByRole("cell").first();
  await expect(firstCell).toHaveText(/^[0-9a-f]{6}…$/);
});
