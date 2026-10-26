import { expect, test } from "@playwright/test";

test("E2E real: la ayuda de ARIA aparece junto a cada tema", async ({ page }) => {
  const email = process.env.E2E_CHANNEL_MANAGER_EMAIL;
  const password = process.env.E2E_CHANNEL_MANAGER_PASSWORD;
  test.skip(!email || !password, "Define E2E_CHANNEL_MANAGER_EMAIL y E2E_CHANNEL_MANAGER_PASSWORD.");

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole("button", { name: "Información: ciclo de una alerta" }).click();
  await expect(page.getByRole("heading", { name: "Del evento al aprendizaje" })).toBeVisible();

  await page.getByRole("link", { name: "Configuración" }).click();
  await expect(page).toHaveURL(/\/configuracion$/);
  await page.getByRole("button", { name: "Información: flujo de revisión" }).click();
  await expect(page.getByRole("heading", { name: "Las diez etapas de revisión" })).toBeVisible();

  await page.getByRole("navigation", { name: "Secciones de configuración" }).getByRole("button", { name: "Agente" }).click();
  await page.getByRole("button", { name: "Detector" }).click();
  await page.getByRole("button", { name: "Información: puntuación XGBoost" }).click();
  await expect(page.getByRole("heading", { name: "Cómo puntúa el modelo" })).toBeVisible();

  await page.getByRole("button", { name: "Analista" }).click();
  await page.getByRole("button", { name: "Información: rutas de resolución" }).click();
  await expect(page.getByRole("heading", { name: "Cómo se resuelve una alerta" })).toBeVisible();
});
