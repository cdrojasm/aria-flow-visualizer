import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.setTimeout(120_000);

type Configuration = {
  configuration_id: string;
  version: number;
  name: string;
  description: string;
  general: Record<string, unknown>;
  infra: Record<string, unknown>;
  test: Record<string, unknown>;
  segments: Record<string, unknown>;
  parent_ref: { configuration_id: string; version: number } | null;
  promotion_comment?: string | null;
};

async function login(api: APIRequestContext, email: string, password: string) {
  const response = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(response.ok(), `login API: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as { access_token: string };
}

async function createConfiguration(
  api: APIRequestContext,
  token: string,
  payload: Record<string, unknown>,
) {
  const response = await api.post("/api/v0/configurations", {
    headers: { Authorization: `Bearer ${token}` },
    data: payload,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Configuration;
}

test("grafo de versiones real: familias, ramas, raíz y detalle", async ({ page, request }) => {
  const managerEmail = process.env.E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  test.skip(
    !managerEmail || !managerPassword,
    "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD para un usuario manager real.",
  );

  const manager = await login(request, managerEmail!, managerPassword!);
  const activeResponse = await request.get("/api/v0/configurations/active", {
    headers: { Authorization: `Bearer ${manager.access_token}` },
  });
  expect(activeResponse.ok(), await activeResponse.text()).toBeTruthy();
  const active = (await activeResponse.json()) as Configuration;
  const base = {
    general: active.general,
    infra: active.infra,
    test: active.test,
    segments: active.segments,
  };

  const suffix = randomUUID().slice(0, 8);
  const rootName = `E2E grafo raiz ${suffix}`;
  const branchName = `E2E grafo rama ${suffix}`;
  const otherName = `E2E grafo aparte ${suffix}`;

  // Una familia: raíz v1 -> v2, con una rama que nace de v1. Otra familia
  // independiente: una raíz sin relación.
  const root1 = await createConfiguration(request, manager.access_token, {
    ...base,
    name: rootName,
    description: "Versión raíz del grafo.",
  });
  const root2 = await createConfiguration(request, manager.access_token, {
    ...base,
    name: rootName,
    configuration_id: root1.configuration_id,
    based_on_version: root1.version,
    description: "Segunda versión del mismo linaje.",
  });
  const branch = await createConfiguration(request, manager.access_token, {
    ...base,
    name: branchName,
    parent_ref: { configuration_id: root1.configuration_id, version: root1.version },
    description: "Rama que nace de la primera versión.",
  });
  await createConfiguration(request, manager.access_token, { ...base, name: otherName });
  expect(root2.version).toBe(2);
  expect(branch.parent_ref).toEqual({
    configuration_id: root1.configuration_id,
    version: root1.version,
  });

  // El API entrega el comentario de promoción solo para versiones promovidas.
  const graphResponse = await request.get("/api/v0/configurations/graph", {
    headers: { Authorization: `Bearer ${manager.access_token}` },
  });
  expect(graphResponse.ok(), await graphResponse.text()).toBeTruthy();
  const graph = (await graphResponse.json()) as Configuration[];
  const mine = graph.filter((node) => [rootName, branchName, otherName].includes(node.name));
  expect(mine).toHaveLength(4);
  expect(mine.every((node) => node.promotion_comment === null)).toBe(true);

  await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
    key: "aria.auth.accessToken",
    value: manager.access_token,
  });
  await page.goto("/configuracion");
  await expect(page.getByRole("heading", { name: "Grafo de versiones" })).toBeVisible();

  const configSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Configuraciones" }) });
  const pickConfiguration = async (name: string) => {
    const picker = configSection
      .getByRole("button", { name: "Configuración", exact: true })
      .locator("..");
    await picker.getByRole("button", { name: "Configuración", exact: true }).click();
    const row = picker.getByRole("button").filter({ hasText: name }).last();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await picker.getByRole("button", { name: "Configuración", exact: true }).click();
  };

  const graphView = page.getByTestId("configuration-version-graph");
  const detail = page.getByTestId("configuration-graph-detail");

  // Elegir la raíz muestra su familia: sus dos versiones y la rama que nace
  // de v1. La configuración sin relación no aparece en el dibujo.
  await pickConfiguration(rootName);
  await expect(graphView).toBeVisible();
  for (const label of [`${rootName} v1`, `${rootName} v2`, `${branchName} v1`]) {
    await expect(graphView.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(graphView.getByText(`${otherName} v1`, { exact: true })).toHaveCount(0);

  // Clic en un nodo de la rama: el detalle muestra su origen y el selector
  // pasa a esa configuración.
  await graphView.getByText(`${branchName} v1`, { exact: true }).click();
  await expect(detail).toContainText(`${branchName} · v1`);
  await expect(detail).toContainText(`Deriva de ${rootName} v1`);
  await expect(detail).toContainText("Borrador");
  await expect(detail).not.toContainText("Comentario de promoción");
  await expect(configSection.getByText(branchName).first()).toBeVisible();
  // La familia sigue siendo la misma al moverse por sus ramas.
  await expect(graphView.getByText(`${rootName} v2`, { exact: true })).toBeVisible();

  await graphView.getByText(`${rootName} v2`, { exact: true }).click();
  await expect(detail).toContainText(`${rootName} · v2`);
  await expect(detail).toContainText(`Deriva de ${rootName} v1`);

  // Elegir la configuración aparte cambia el gráfico a su propia familia.
  await pickConfiguration(otherName);
  await expect(graphView.getByText(`${otherName} v1`, { exact: true })).toBeVisible();
  await expect(graphView.getByText(`${rootName} v1`, { exact: true })).toHaveCount(0);
  await expect(detail).toContainText("Versión raíz");
});
