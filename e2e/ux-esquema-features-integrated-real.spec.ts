import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Prueba integrada única: Esquema -> Variables -> Asistente de modelos.
 * API real a través de nginx (/api/...), sin mocks ni fulfill.
 * Requisitos: docs/ux-esquema-features/REQ-{A..F}-*.md
 */
test.setTimeout(240_000);

const DATASET = process.env.E2E_UX_DATASET ?? "planner_sample_200";
const MANAGER = {
  email: process.env.E2E_UX_MANAGER_EMAIL ?? "e2e-ux-manager@example.com",
  password: process.env.E2E_UX_PASSWORD ?? "e2e-ux-password-123",
};
const ANALYST = {
  email: process.env.E2E_UX_ANALYST_EMAIL ?? "e2e-ux-analyst@example.com",
  password: process.env.E2E_UX_PASSWORD ?? "e2e-ux-password-123",
};
// Misma idea que suspectGuardForName: nombres que NUNCA deben quedar marcados por defecto.
const RISKY = /(^|[_.])(id|uuid|guid)$|[a-z]Id$|^[a-z]+id$|marcaci[oó]n|review|revisi[oó]n/i;
const NOT_RISKY = /(valid|paid|void|rapid|solid|fluid|android)$/i;

async function token(api: APIRequestContext, creds: { email: string; password: string }) {
  const res = await api.post("/api/v0/auth/login", { data: creds });
  expect(res.ok(), `login ${creds.email}: ${await res.text()}`).toBeTruthy();
  return (await res.json()).access_token as string;
}

async function signIn(page: Page, accessToken: string, path: string) {
  await page.goto("/login");
  await page.evaluate((v) => localStorage.setItem("aria.auth.accessToken", v), accessToken);
  await page.goto(path);
}

type SchemaField = {
  field: string;
  field_ds_loc: string;
  is_label: boolean;
  is_sensible: boolean;
  data_source: string;
};

test("integrado: esquema -> variables -> asistente de modelos (API real)", async ({
  page,
  request,
}) => {
  const managerToken = await token(request, MANAGER);
  const analystToken = await token(request, ANALYST);
  const schemaRes = await request.get("/api/v0/alert-schema/active", {
    headers: { Authorization: `Bearer ${managerToken}` },
  });
  expect(schemaRes.ok()).toBeTruthy();
  const schema = await schemaRes.json();
  const fields: SchemaField[] = schema.fields;
  const names = (pick: (f: SchemaField) => boolean) =>
    fields
      .filter(pick)
      .flatMap((f) => [f.field_ds_loc, f.field])
      .filter(Boolean);
  const labelFields = fields.filter((f) => f.is_label).map((f) => f.field);
  const labelNames = names((f) => f.is_label);
  const sensibleNames = names((f) => f.is_sensible);
  expect(labelFields.length, "el esquema activo debe tener una etiqueta").toBeGreaterThan(0);

  // ───────────── A. Esquema ─────────────
  await signIn(page, managerToken, "/configuracion");
  await page.getByRole("button", { name: "Esquema" }).click();

  const band = page.getByTestId("schema-status-band");
  await expect(band).toBeVisible();
  // sin parpadeo de falsa alarma: espera a que termine de cargar
  await expect(page.getByTestId("schema-chip-loading")).toHaveCount(0);
  await expect(page.getByTestId("schema-chip-version")).toContainText(`Activa v${schema.version}`);
  await expect(page.getByTestId("schema-chip-essentials")).toContainText("obligatorios");
  await expect(page.getByTestId("schema-chip-essentials")).toContainText("✓");
  await expect(page.getByTestId("schema-primary-action")).toBeVisible();

  // El esquema es global: no hereda el contexto de versionado de configuraciones
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/Viendo la versión/);
  expect(bodyText).not.toMatch(/Consultando configuración/);
  expect(bodyText).not.toMatch(/GRAFO DE VERSIONES/i);
  expect(bodyText).not.toMatch(/SOLICITUDES DE DESPLIEGUE/i);
  // ...y las pestañas del esquema se ven sin recorrer la página
  const tabsBox = await page.getByRole("button", { name: "Campos esenciales" }).boundingBox();
  expect(tabsBox!.y, "las pestañas del esquema deben quedar en la primera pantalla").toBeLessThan(
    700,
  );
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(pageHeight, "la página de Esquema no debe medir miles de píxeles").toBeLessThan(3000);

  await expect(page.getByTestId("essential-fields")).toBeVisible();
  const assigned = Object.entries(schema.field_roles as Record<string, string>).filter(
    ([, id]) => id,
  );
  expect(assigned.length).toBeGreaterThan(0);
  await expect(page.getByTestId(`essential-${assigned[0][0]}`)).toBeVisible();

  // Tabla en modo lectura: texto plano (no cajas editables), sin columna "Usado por" vacía
  await page.getByRole("button", { name: "Campos", exact: true }).click();
  await expect(page.locator('[data-testid^="field-text-"]').first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Campo / })).toHaveCount(0);
  // "Usado por" llega del backend (puede tardar unos segundos): con datos reales, aparece con chips
  await expect(page.locator('[data-testid^="usage-"]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Usado por").first()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^(Etiqueta|Historial)/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Detalles / })
    .first()
    .click();
  await expect(page.getByTestId("side-drawer")).toBeVisible();
  // las dos banderas nuevas viven en el panel de detalle
  await expect(page.getByText("Es un identificador")).toBeVisible();
  await expect(page.getByText("Disponible al momento de decidir")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar panel" }).click();
  await expect(page.getByTestId("side-drawer")).toHaveCount(0);

  await page.getByRole("button", { name: /^Por revisar/ }).click();
  await expect(page.getByText("Último análisis:")).toBeVisible();
  await page.getByRole("button", { name: "Propuestas", exact: true }).click();
  await expect(page.getByText("Comparación con la versión activa")).toBeVisible();
  const schemaText = await page.locator("main").innerText();
  expect(schemaText).not.toMatch(/\b(proposed|historical)\b/);
  await page.screenshot({ path: "test-results/ux-integrated-a-esquema.png" });

  // ───────────── B + C. Asistente de modelos ─────────────
  await signIn(page, analystToken, "/modelos");
  await page.getByRole("button", { name: "Nuevo modelo" }).click();

  const nav = page.getByRole("navigation", { name: "Pasos del entrenamiento" });
  for (const name of ["Datos y objetivo", "Variables", "XGBoost", "Revisión"]) {
    await expect(nav.getByRole("button", { name })).toBeVisible();
  }
  // El botón deshabilitado explica qué falta
  await expect(page.getByTestId("wizard-step0-hint")).toContainText("Falta");

  await page.getByPlaceholder("xgboost-historico-v1").fill(`e2e-ux-integrado-${Date.now()}`);
  await page.locator("select").filter({ hasText: "Selecciona un dataset" }).selectOption(DATASET);

  const target = page.getByLabel("Campo objetivo");
  await expect(target.locator("option").nth(1)).toBeAttached({ timeout: 60_000 });
  await expect(page.getByTestId("target-suggested").first()).toBeAttached();
  const values = await target
    .locator("option")
    .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
  const nonLabel = values.find((v) => !labelFields.includes(v));
  expect(nonLabel, "debe haber un campo que no sea etiqueta").toBeTruthy();
  await target.selectOption(nonLabel!);
  await expect(page.getByTestId("target-not-label")).toBeVisible();
  const goodTarget = values.find((v) => labelFields.includes(v));
  expect(goodTarget, "el dataset debe traer un campo de etiqueta").toBeTruthy();
  await target.selectOption(goodTarget!);
  await expect(page.getByTestId("target-not-label")).toHaveCount(0);

  await page
    .locator("label:has(input[type=checkbox])")
    .filter({ hasText: /^\s*risk\s*·/ })
    .first()
    .locator("input")
    .check();
  await expect(page.getByTestId("wizard-step0-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Continuar" }).click();

  const banner = page.getByTestId("fe-active-banner");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(banner).toContainText(`esquema v${schema.version}`);
  await expect(banner).toContainText("versión 2");

  // RB: el generador PROPONE, no crea nada por sí solo
  await page.getByTestId("fe-generate").click();
  const review = page.getByTestId("fe-generate-review");
  await expect(review).toBeVisible();
  await expect(page.locator('[data-testid^="fe-variable-item-"]')).toHaveCount(0);
  await expect(page.getByTestId("fe-gen-section-suspect")).toBeVisible();
  await expect(page.getByTestId("fe-gen-section-exclude")).toBeVisible();

  const items = await page.locator('[data-testid^="fe-gen-item-"]').evaluateAll((els) =>
    els.map((e) => ({
      route: e.getAttribute("data-testid")!.replace("fe-gen-item-", ""),
      level: e.getAttribute("data-level"),
      checked: e.getAttribute("data-checked"),
    })),
  );
  expect(items.length).toBeGreaterThan(10);
  // Nada que parezca identificador o posterior a la decisión llega marcado
  const riskyChecked = items.filter(
    (i) =>
      RISKY.test(i.route.split(".").at(-1)!) && !NOT_RISKY.test(i.route) && i.checked === "true",
  );
  expect(riskyChecked, "identificadores/posteriores marcados por defecto").toEqual([]);
  // Las etiquetas del esquema están excluidas de forma dura (no marcables)
  for (const label of labelNames) {
    const it = items.find((i) => i.route === label);
    if (it) {
      expect(it.level, `${label} debe ser exclude`).toBe("exclude");
      expect(it.checked).not.toBe("true");
    }
  }
  expect(items.some((i) => i.level === "suspect")).toBeTruthy();
  expect(items.filter((i) => i.checked === "true").length).toBeGreaterThan(5);

  // Un sensible que además es identificador (customer_id) tampoco llega marcado; se puede incluir a mano
  expect(sensibleNames.length, "el esquema activo debe tener un campo sensible").toBeGreaterThan(0);
  let forced: string | undefined;
  for (const candidate of sensibleNames) {
    const btn = page.getByTestId(`fe-gen-force-${candidate}`);
    if ((await btn.count()) > 0) {
      await btn.click();
      forced = candidate;
      break;
    }
  }
  expect(forced, `el campo sensible (${sensibleNames}) debía quedar como sospechoso`).toBeTruthy();

  await page.getByTestId("fe-gen-confirm").click();
  await expect(review).toHaveCount(0);
  const generated = await page
    .locator('[data-testid^="fe-variable-item-"]')
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-testid")!.replace("fe-variable-item-", "")),
    );
  expect(generated.length).toBeGreaterThan(5);
  for (const label of labelNames) {
    expect(generated, `la etiqueta ${label} no debe generarse`).not.toContain(label);
  }
  // Solo lo forzado a mano está; ningún otro riesgoso se coló
  const riskyCreated = generated.filter((g) => RISKY.test(g) && !NOT_RISKY.test(g));
  expect(riskyCreated.every((g) => sensibleNames.includes(g))).toBeTruthy();

  // ✓ solo tras validar: recién creadas están "sin validar"
  await expect(page.locator('[data-testid^="fe-validity-"][data-state="valid"]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid^="fe-validity-"][data-state="unvalidated"]').first(),
  ).toBeVisible();

  // El sensible incluido a mano muestra su aviso
  await page.getByTestId(`fe-variable-item-${forced}`).click();
  await expect(page.getByTestId("fe-sensitive-warning")).toBeVisible();

  // Menú ⋯ con las funciones secundarias
  await page.getByTestId("fe-menu-button").click();
  await expect(page.getByTestId("fe-menu").getByRole("menuitem")).toHaveCount(4);
  await page.getByTestId("fe-menu-json").click();
  await expect(page.getByTestId("fe-back-to-variables")).toBeVisible();
  await page.getByTestId("fe-back-to-variables").click();
  await expect(page.getByTestId("fe-variable-list")).toBeVisible();

  await page.screenshot({ path: "test-results/ux-integrated-b-variables.png" });
  await expect(page.getByTestId("wizard-variables-hint")).toBeVisible();
});
