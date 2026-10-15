import { expect, test, type Page } from "@playwright/test";

const instance = {
  id: "vector-store-v1",
  version: 1,
  name: "Control inicial",
  description: "Cobertura de fraude digital",
  created_at: "2026-09-22T10:00:00Z",
  created_by: "Andrea Analista",
  updated_at: null,
  updated_by: null,
};

async function mockKnowledgeApi(page: Page) {
  let relations: Array<{
    relation_id: string;
    asset_type: string;
    asset_id: string;
    asset_version: number;
  }> = [];
  await page.route("**/api/v0/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/v0/auth/me")
      return json({ name: "Andrea Analista", email: "andrea@example.com", role: "data_analyst" });
    if (path === "/api/v0/vector-store-instances" && request.method() === "GET")
      return json([instance]);
    if (path.endsWith("/documents") && request.method() === "GET") return json(relations);
    if (path.endsWith("/documents/preflight"))
      return json({
        instance_id: instance.id,
        will_add: [
          { asset_type: "taxonomy", asset_id: "taxonomy-1", origin: "selected" },
          { asset_type: "modus_operandi", asset_id: "mo-1", origin: "taxonomy" },
        ],
      });
    if (path.endsWith("/documents") && request.method() === "POST") {
      relations = [
        {
          relation_id: "v1:taxonomy:taxonomy-1",
          asset_type: "taxonomy",
          asset_id: "taxonomy-1",
          asset_version: 1,
        },
        {
          relation_id: "v1:modus_operandi:mo-1",
          asset_type: "modus_operandi",
          asset_id: "mo-1",
          asset_version: 1,
        },
      ];
      return json(relations);
    }
    if (path.includes("/documents/") && request.method() === "DELETE") {
      const relationId = decodeURIComponent(path.split("/").at(-1) ?? "");
      relations = relations.filter((relation) => relation.relation_id !== relationId);
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/v0/library/taxonomies")
      return json([
        {
          id: "taxonomy-1",
          code: "SUP",
          name: "Suplantación digital",
          description: "Uso de identidad ajena",
          variables: [],
          examples: [],
          active: true,
          created_at: "2026-09-22T10:00:00Z",
          updated_at: "2026-09-22T10:00:00Z",
        },
      ]);
    if (path === "/api/v0/library/modus-operandi")
      return json([
        {
          id: "mo-1",
          title: "Captura de credenciales",
          narrative: "Engaño",
          taxonomy_library_id: "taxonomy-1",
          evolved_variables: [],
          active: true,
          created_at: "2026-09-22T10:00:00Z",
          updated_at: "2026-09-22T10:00:00Z",
        },
      ]);
    if (
      [
        "/api/v0/library/flags",
        "/api/v0/library/similar-cases",
        "/api/v0/library/channels",
        "/api/v0/tag-catalog",
      ].includes(path)
    )
      return json([]);
    return json([]);
  });
}

test("agrega la expansión de una taxonomía y quita sólo su relación", async ({ page }) => {
  await mockKnowledgeApi(page);
  await page.addInitScript(() => localStorage.setItem("aria.auth.accessToken", "test-token"));
  await page.goto("/biblioteca");
  await expect(page.getByRole("heading", { name: "v1 · Control inicial" })).toBeVisible();
  await page.getByPlaceholder("Nombre o expresión regular").fill("Suplantación");
  await page.getByRole("button", { name: "Agregar Suplantación digital a la instancia" }).click();
  await expect(
    page.getByRole("heading", { name: "Agregar documentos a la instancia" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agregar documentos" }).click();

  await expect(
    page.getByRole("button", { name: "Agregar Suplantación digital a la instancia" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Quitar Suplantación digital de la instancia" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expandir Suplantación digital" }).click();
  await page.getByRole("button", { name: "Quitar Suplantación digital de la instancia" }).click();
  await expect(
    page.getByRole("button", { name: "Quitar Suplantación digital de la instancia" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Quitar Captura de credenciales de la instancia" })
    .click();
  await expect(page.getByText("Aún no hay documentos relacionados.")).toBeVisible();
  await expect(page.getByText("Suplantación digital")).toBeVisible();
});
