import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

test.setTimeout(180_000);

let api: APIRequestContext | undefined;
let bootstrapToken = "";
let originalBootstrapToken = "";
let temporaryBootstrapToken = false;
let managerToken = "";
let channelManagerToken = "";
let originalSettings: Record<string, unknown> | undefined;
let createdSessionId = "";

function readBootstrapToken() {
  const backendDirectory = resolve(process.cwd(), "../aria-wt-A-fp4-fp5");
  const project = process.env.LOCAL_DOCKER_PROJECT ?? "aria-local";
  const containerId = execFileSync(
    "docker",
    ["compose", "-p", project, "-f", "deploy/local/docker/docker-compose.yml", "ps", "-q", "api"],
    { cwd: backendDirectory, encoding: "utf8" },
  ).trim();
  if (!containerId)
    throw new Error("No está iniciado el contenedor API para el E2E real del optimizador.");
  const inspected = JSON.parse(
    execFileSync("docker", ["inspect", containerId], { encoding: "utf8" }),
  )[0];
  const entry = inspected.Config.Env.find((value: string) =>
    value.startsWith("AUTH_BOOTSTRAP_TOKEN="),
  );
  originalBootstrapToken = entry?.split("=").slice(1).join("=") ?? "";
  return originalBootstrapToken;
}

async function checked(response: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  expect(response.ok(), `${label}: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function createUser(role: string) {
  const email = `fp45-${role}-${randomUUID()}@aria.test`;
  const password = `Aria-${randomUUID()}-Aa9!`;
  const created = await api!.post("/api/v0/auth/users", {
    headers: { "X-Bootstrap-Token": bootstrapToken },
    data: { email, password, name: `FP4 FP5 ${role}`, role },
  });
  expect(created.status(), `crear ${role}: ${await created.text()}`).toBe(201);
  const login = await checked(
    await api!.post("/api/v0/auth/login", { data: { email, password } }),
    `login ${role}`,
  );
  return login.access_token as string;
}

async function signIn(page: Page) {
  await page.addInitScript(
    ({ accessToken }) => {
      localStorage.setItem("aria.auth.accessToken", accessToken);
    },
    { accessToken: channelManagerToken },
  );
  await page.goto("/configuracion");
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: "http://localhost" });
  bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN || readBootstrapToken();
  if (!bootstrapToken) {
    bootstrapToken = randomUUID();
    temporaryBootstrapToken = true;
    const backendDirectory = resolve(process.cwd(), "../aria-wt-A-fp4-fp5");
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
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const healthy = await api.get("/health").catch(() => undefined);
      if (healthy?.ok()) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
    }
  }
  const users = await api.get("/api/v0/auth/users", {
    headers: { "X-Bootstrap-Token": bootstrapToken },
  });
  expect(users.ok(), `verificar bootstrap: ${users.status()} ${await users.text()}`).toBeTruthy();
  managerToken = await createUser("manager");
  channelManagerToken = await createUser("channel_manager");
  const managerAuth = { headers: { Authorization: `Bearer ${managerToken}` } };
  originalSettings = await checked(
    await api.get("/api/v0/assistant-optimizer-settings", managerAuth),
    "leer configuración del optimizador",
  );
  if (originalSettings.optimizer_enabled !== true) {
    await checked(
      await api.put("/api/v0/assistant-optimizer-settings", {
        ...managerAuth,
        data: { settings: { ...originalSettings, optimizer_enabled: true } },
      }),
      "habilitar temporalmente el optimizador",
    );
  }
  const blocked = await api.post("/api/v0/agent/sessions", {
    headers: { Authorization: `Bearer ${managerToken}` },
    data: { mode: "optimization", scope: ["library"] },
  });
  expect(blocked.status(), `manager no debe crear optimizador: ${await blocked.text()}`).toBe(403);
});

test.afterAll(async () => {
  if (api && managerToken && originalSettings) {
    if (createdSessionId && channelManagerToken) {
      await api
        .post(`/api/v0/agent/sessions/${encodeURIComponent(createdSessionId)}/cancel`, {
          headers: { Authorization: `Bearer ${channelManagerToken}` },
        })
        .catch(() => undefined);
    }
    await api
      .put("/api/v0/assistant-optimizer-settings", {
        headers: { Authorization: `Bearer ${managerToken}` },
        data: { settings: originalSettings },
      })
      .catch(() => undefined);
  }
  if (temporaryBootstrapToken && api) {
    try {
      const backendDirectory = resolve(process.cwd(), "../aria-wt-A-fp4-fp5");
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
    } catch {
      console.error("No se pudo restaurar el token bootstrap original del API local.");
    }
  }
  await api?.dispose();
});

test("FP4/FP5 real: revisión, inicio, presupuesto, pausa, conversación y cancelación", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    pageErrors.push(
      `REQUEST_FAILED ${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      pageErrors.push(`HTTP_${response.status()} ${response.url()}`);
    }
  });
  await signIn(page);
  await page.getByRole("button", { name: "Abrir asistente ARIA" }).click();
  const objectiveResponse = page.waitForResponse((response) =>
    response.url().includes("/agent/objectives/active"),
  );
  await page.getByRole("button", { name: "Optimizador", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lanzar optimizador" })).toBeVisible();
  await page.getByLabel("Biblioteca", { exact: true }).check();
  await page
    .getByLabel("Notas iniciales")
    .fill("Analiza oportunidades de mejora y explica cada hipótesis.");
  await page.getByRole("button", { name: "Revisar objetivo y presupuesto" }).click();
  expect((await objectiveResponse).ok()).toBeTruthy();
  await expect(page.getByText("Presupuesto asignado por el servidor.")).toBeVisible();
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions/") && response.url().endsWith("/start"),
  );
  await page.getByRole("button", { name: "Confirmar e iniciar" }).click();
  const started = await startResponse;
  expect(
    started.ok(),
    `iniciar optimizador: ${started.status()} ${await started.text()}`,
  ).toBeTruthy();
  const startedSession = (await started.json()) as {
    session_id: string;
    created_at: string;
    updated_at: string;
  };
  createdSessionId = startedSession.session_id;
  await expect(
    page.getByRole("tablist", { name: "Historial de sesiones del optimizador" }),
  ).toBeVisible();
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  const sessionHistory = page.getByText(/Historial · creada/);
  await expect(sessionHistory).toContainText(
    `creada ${new Date(startedSession.created_at).toLocaleString("es-CO")}`,
  );
  await expect(sessionHistory).toContainText(
    `actualización ${new Date(startedSession.updated_at).toLocaleString("es-CO")}`,
  );
  await expect(page.getByText("Gastado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Restante", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Pausar optimizador" }).click();
  await expect(page.getByText("En pausa", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page
    .getByLabel("Mensaje para el optimizador")
    .fill("Prioriza los hallazgos con evidencia global.");
  const messageResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions/") &&
      response.url().includes("/messages") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Enviar", exact: true }).last().click();
  const messageResult = await messageResponse;
  expect(
    messageResult.ok(),
    `mensaje de optimización: ${messageResult.status()} ${await messageResult.text()}`,
  ).toBeTruthy();
  await expect(page.getByText("Prioriza los hallazgos con evidencia global.")).toBeVisible();
  const cancelResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v0/agent/sessions/") && response.url().endsWith("/cancel"),
  );
  await page.getByRole("button", { name: "Cancelar optimizador" }).click();
  const cancelResult = await cancelResponse;
  expect(
    cancelResult.ok(),
    `cancelar optimizador: ${cancelResult.status()} ${await cancelResult.text()}`,
  ).toBeTruthy();
  await expect(page.getByText("Cancelado", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nueva", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
