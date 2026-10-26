import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type Playwright } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const email = "e2e-capability-help@aria.test";
let api: APIRequestContext | undefined;
let bootstrapToken = "";
let originalBootstrapToken = "";
let temporaryBootstrapToken = false;
let accessToken = "";

function readBootstrapToken() {
  const backendDirectory = resolve(process.cwd(), "../backend");
  const project = process.env.LOCAL_DOCKER_PROJECT ?? "aria-local";
  const containerId = execFileSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "deploy/local/docker/docker-compose.yml",
      "ps",
      "-q",
      "api",
    ],
    { cwd: backendDirectory, encoding: "utf8" },
  ).trim();
  if (!containerId) throw new Error("No está iniciado el contenedor API para E2E real.");
  const inspected = JSON.parse(execFileSync("docker", ["inspect", containerId], { encoding: "utf8" }))[0];
  const entry = inspected.Config.Env.find((value: string) =>
    value.startsWith("AUTH_BOOTSTRAP_TOKEN="),
  );
  originalBootstrapToken = entry?.split("=").slice(1).join("=") ?? "";
  return originalBootstrapToken;
}

async function waitForApi() {
  await expect
    .poll(
      async () => {
        try {
          return (await api!.get("/health", { timeout: 3_000 })).ok();
        } catch {
          return false;
        }
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
}

async function provisionChannelManager(playwright: Playwright) {
  const hostname = new URL(baseURL).hostname;
  if (hostname !== "localhost")
    throw new Error("El aprovisionamiento automático sólo se permite contra el API local.");

  api = await playwright.request.newContext({ baseURL });
  bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN || readBootstrapToken();
  if (!bootstrapToken) {
    bootstrapToken = randomUUID();
    temporaryBootstrapToken = true;
    const backendDirectory = resolve(process.cwd(), "../backend");
    const project = process.env.LOCAL_DOCKER_PROJECT ?? "aria-local";
    execFileSync(
      "docker",
      [
        "compose",
        "-p",
        project,
        "-f",
        "deploy/local/docker/docker-compose.yml",
        "up",
        "-d",
        "--force-recreate",
        "api",
      ],
      {
        cwd: backendDirectory,
        encoding: "utf8",
        env: { ...process.env, AUTH_BOOTSTRAP_TOKEN: bootstrapToken },
      },
    );
    execFileSync("docker", ["compose", "restart", "web"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    await waitForApi();
  }

  const headers = { "X-Bootstrap-Token": bootstrapToken };
  const usersResponse = await api.get("/api/v0/auth/users", { headers });
  expect(usersResponse.ok(), `listar usuarios: ${await usersResponse.text()}`).toBeTruthy();
  const users = (await usersResponse.json()) as Array<{
    id: string;
    email: string;
    role: string;
    is_active: boolean;
  }>;
  const existing = users.find((user) => user.email === email);
  if (existing && (existing.role !== "channel_manager" || !existing.is_active))
    throw new Error(`El usuario E2E debe ser channel_manager activo; tiene ${existing.role}.`);

  const password = `E2E-${randomBytes(36).toString("base64url")}-Aa9!`;
  const provisioned = existing
    ? await api.put(`/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`, {
        headers,
        data: { password },
      })
    : await api.post("/api/v0/auth/users", {
        headers,
        data: { name: "ARIA contextual help E2E", email, role: "channel_manager", password },
      });
  expect(provisioned.ok(), `aprovisionar channel_manager: ${await provisioned.text()}`).toBeTruthy();
  const login = await api.post("/api/v0/auth/login", { data: { email, password } });
  expect(login.ok(), `login E2E: ${await login.text()}`).toBeTruthy();
  accessToken = ((await login.json()) as { access_token: string }).access_token;
}

async function openAs(page: Page, path: string) {
  await page.addInitScript((token) => localStorage.setItem("aria.auth.accessToken", token), accessToken);
  await page.goto(path);
}

test.beforeAll(async ({ playwright }) => {
  await provisionChannelManager(playwright);
});

test.afterAll(async () => {
  try {
    if (temporaryBootstrapToken) {
      const backendDirectory = resolve(process.cwd(), "../backend");
      const project = process.env.LOCAL_DOCKER_PROJECT ?? "aria-local";
      execFileSync(
        "docker",
        [
          "compose",
          "-p",
          project,
          "-f",
          "deploy/local/docker/docker-compose.yml",
          "up",
          "-d",
          "--force-recreate",
          "api",
        ],
        {
          cwd: backendDirectory,
          encoding: "utf8",
          env: { ...process.env, AUTH_BOOTSTRAP_TOKEN: originalBootstrapToken },
        },
      );
      execFileSync("docker", ["compose", "restart", "web"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      await waitForApi();
    }
  } finally {
    await api?.dispose();
  }
});

test("E2E real: la ayuda de ARIA aparece junto a cada tema", async ({ page }) => {
  await openAs(page, "/dashboard");
  await page.getByRole("button", { name: "Información: ciclo de una alerta" }).click();
  await expect(page.getByRole("heading", { name: "Del evento al aprendizaje" })).toBeVisible();

  await openAs(page, "/configuracion");
  await page.getByRole("button", { name: "Información: flujo de revisión" }).click();
  await expect(page.getByRole("heading", { name: "Las diez etapas de revisión" })).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Secciones de configuración" });
  await sections.getByRole("button", { name: "Agente" }).click();
  await page.getByRole("button", { name: "Detector", exact: true }).click();
  await page.getByRole("button", { name: "Información: puntuación XGBoost" }).click();
  await expect(page.getByRole("heading", { name: "Cómo puntúa el modelo" })).toBeVisible();

  await page.getByRole("button", { name: "Analista", exact: true }).click();
  await page.getByRole("button", { name: "Información: rutas de resolución" }).click();
  await expect(page.getByRole("heading", { name: "Cómo se resuelve una alerta" })).toBeVisible();
});
