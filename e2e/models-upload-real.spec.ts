import { randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Carga de modelo entrenado desde la sección Modelos. API real vía nginx (/api/...).
 * Solo la hacen los roles que acceden a Modelos (data_analyst, channel_manager);
 * el manager no.
 */
const PASSWORD = process.env.E2E_UX_PASSWORD ?? "e2e-ux-password-123";
const ANALYST = {
  email: process.env.E2E_UX_ANALYST_EMAIL ?? "e2e-ux-analyst@example.com",
  password: PASSWORD,
};
const MANAGER = {
  email: process.env.E2E_UX_MANAGER_EMAIL ?? "e2e-ux-manager@example.com",
  password: PASSWORD,
};

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

test("carga de modelo: pestaña en Modelos para el analista, vetada al manager", async ({
  page,
  request,
}) => {
  const analystToken = await token(request, ANALYST);
  const managerToken = await token(request, MANAGER);
  const bundle = Buffer.concat([Buffer.from([0x80, 0x04]), randomBytes(64)]);
  const modelTag = `e11-upload-${randomBytes(4).toString("hex")}`;

  // El manager no puede cargar modelos (API) ni llega a la sección Modelos.
  const denied = await request.post("/api/v0/backups/models", {
    headers: { Authorization: `Bearer ${managerToken}` },
    multipart: {
      file: { name: "m.joblib", mimeType: "application/octet-stream", buffer: bundle },
      tag: `${modelTag}-mgr`,
    },
  });
  expect(denied.status(), await denied.text()).toBe(403);

  // Respaldos ya no ofrece la carga.
  await signIn(page, managerToken, "/backups");
  await expect(page.getByRole("heading", { name: "Respaldos" })).toBeVisible();
  await expect(page.getByTestId("model-bundle-file")).toHaveCount(0);

  // El analista la hace desde Modelos.
  await signIn(page, analystToken, "/modelos");
  await page.getByRole("button", { name: "Cargar modelo", exact: true }).click();
  await page.getByTestId("model-bundle-file").setInputFiles({
    name: "e11.joblib",
    mimeType: "application/octet-stream",
    buffer: bundle,
  });
  await page.getByLabel("Etiqueta (única)").fill(modelTag);
  await page.getByLabel("Dataset de origen").fill("e11-dataset");
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/backups/models") && response.request().method() === "POST",
  );
  await page.locator("form").getByRole("button", { name: "Cargar modelo" }).click();
  const uploaded = await uploadResponse;
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  await expect(page.getByRole("status").filter({ hasText: modelTag })).toBeVisible();

  const list = await request.get("/api/v0/models", {
    headers: { Authorization: `Bearer ${analystToken}` },
  });
  expect(list.ok(), await list.text()).toBeTruthy();
  const registered = ((await list.json()) as Array<Record<string, unknown>>).find(
    (item) => item.tag === modelTag,
  );
  expect(registered).toMatchObject({ status: "READY", active: false, created_by: ANALYST.email });
  expect(String(registered!.storage_ref)).toMatch(/^models\/sha256\/[\da-f]{64}\.joblib$/);

  // Un bundle repetido se rechaza (409) y un archivo que no es joblib también (422).
  const auth = { Authorization: `Bearer ${analystToken}` };
  const duplicate = await request.post("/api/v0/backups/models", {
    headers: auth,
    multipart: {
      file: { name: "e11.joblib", mimeType: "application/octet-stream", buffer: bundle },
      tag: `${modelTag}-b`,
    },
  });
  expect(duplicate.status(), await duplicate.text()).toBe(409);
  const notJoblib = await request.post("/api/v0/backups/models", {
    headers: auth,
    multipart: {
      file: { name: "x.joblib", mimeType: "application/octet-stream", buffer: Buffer.from("zzz") },
      tag: `${modelTag}-c`,
    },
  });
  expect(notJoblib.status(), await notJoblib.text()).toBe(422);

  // Limpieza del modelo creado.
  const removed = await request.delete(`/api/v0/models/${registered!.id as string}`, {
    headers: auth,
  });
  expect(removed.ok(), await removed.text()).toBeTruthy();
});
