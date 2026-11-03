import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BASE_URL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const API = "/api/v0";
const STATUS_LABELS: Record<string, string> = {
  queued: "En cola",
  running: "En curso",
  succeeded: "Completado",
  failed: "Fallido",
};

type Backup = {
  backup_id: string;
  directory: string;
  requested_by: string;
  created_at: string;
  updated_at: string;
  status: "queued" | "running" | "succeeded" | "failed";
  error: string | null;
  dynamodb_items: number | null;
  opensearch_documents: number | null;
  object_storage_objects: number | null;
};

test("E11 API/UI real: manager crea respaldo, worker completa y rol no autorizado recibe 403", async ({
  page,
  playwright,
}) => {
  test.setTimeout(240_000);
  test.skip(process.env.ARIA_E2E_REAL !== "1", "E11 requiere nginx y API reales.");
  if (new URL(BASE_URL).hostname !== "localhost")
    throw new Error("E11 sólo puede crear respaldos en el stack local aislado.");

  const bootstrapUrl = process.env.E2E_AUTH_API_URL ?? "http://localhost:8000";
  const bootstrap = await playwright.request.newContext({ baseURL: bootstrapUrl });
  const jwtSecret = randomBytes(48).toString("base64url");
  const bootstrapToken = process.env.E2E_BOOTSTRAP_TOKEN ?? randomBytes(48).toString("base64url");
  const managerEmail = "e11-backups-manager@example.com";
  const analystEmail = "e11-backups-analyst@example.com";
  const managerPassword = `E11-${randomBytes(32).toString("base64url")}-Aa9!`;
  const analystPassword = `E11-${randomBytes(32).toString("base64url")}-Bb8!`;
  let managerToken = "";
  let analystToken = "";

  try {
    if (!process.env.E2E_BOOTSTRAP_TOKEN) {
      const auth = spawnSync(
        "make",
        [
          "-C",
          resolve(process.cwd(), "../backend"),
          "local-auth-up",
          `LOCAL_API_PORT=${new URL(bootstrapUrl).port || "8000"}`,
          `API_URL=${bootstrapUrl}`,
        ],
        {
          input: `${jwtSecret}\n${bootstrapToken}\n`,
          encoding: "utf8",
          timeout: 600_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      if (auth.error || auth.status !== 0)
        throw new Error(`No se pudo habilitar auth local para E11: ${auth.stderr.slice(-1200)}`);
    }
    const authHeaders = { "X-Bootstrap-Token": bootstrapToken };
    await expect
      .poll(
        async () => {
          try {
            return (await bootstrap.get("/health")).ok();
          } catch {
            return false;
          }
        },
        { timeout: 180_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe(true);
    const listed = await bootstrap.get(`${API}/auth/users`, { headers: authHeaders });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const users = (await listed.json()) as Array<{ id: string; email: string; role: string }>;
    for (const user of [
      {
        name: "E11 Manager",
        email: managerEmail,
        role: "manager",
        password: managerPassword,
      },
      {
        name: "E11 Data Analyst",
        email: analystEmail,
        role: "data_analyst",
        password: analystPassword,
      },
    ]) {
      const existing = users.find((candidate) => candidate.email === user.email);
      if (existing && existing.role !== user.role)
        throw new Error(`El usuario E11 ${user.email} debe tener rol ${user.role}.`);
      const saved = existing
        ? await bootstrap.put(`${API}/auth/users/${encodeURIComponent(existing.id)}/password`, {
            headers: authHeaders,
            data: { password: user.password },
          })
        : await bootstrap.post(`${API}/auth/users`, { headers: authHeaders, data: user });
      expect(saved.ok(), await saved.text()).toBeTruthy();
    }

    if (!process.env.E2E_BOOTSTRAP_TOKEN) {
      const web = spawnSync("docker", ["compose", "up", "-d", "--force-recreate", "web"], {
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      if (web.error || web.status !== 0)
        throw new Error(`No se pudo refrescar nginx para E11: ${web.stderr.slice(-1200)}`);
    }

    const managerLogin = await bootstrap.post(`${API}/auth/login`, {
      data: { email: managerEmail, password: managerPassword },
    });
    expect(managerLogin.ok(), await managerLogin.text()).toBeTruthy();
    managerToken = ((await managerLogin.json()) as { access_token: string }).access_token;
    const analystLogin = await bootstrap.post(`${API}/auth/login`, {
      data: { email: analystEmail, password: analystPassword },
    });
    expect(analystLogin.ok(), await analystLogin.text()).toBeTruthy();
    analystToken = ((await analystLogin.json()) as { access_token: string }).access_token;
  } finally {
    await bootstrap.dispose();
  }

  const managerApi = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${managerToken}` },
  });
  const analystApi = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${analystToken}` },
  });

  try {
    const deniedList = await analystApi.get(`${API}/backups`);
    expect(deniedList.status(), await deniedList.text()).toBe(403);
    const deniedCreate = await analystApi.post(`${API}/backups`);
    expect(deniedCreate.status(), await deniedCreate.text()).toBe(403);

    await page.addInitScript((token: string) => {
      if (sessionStorage.getItem("e11-role") !== "analyst")
        localStorage.setItem("aria.auth.accessToken", token);
    }, managerToken);
    await page.goto("/backups");
    await expect(page.getByRole("heading", { name: "Respaldos" })).toBeVisible();
    let created: Backup | undefined;
    const priorHistory = await managerApi.get(`${API}/backups`);
    expect(priorHistory.ok(), await priorHistory.text()).toBeTruthy();
    const priorBackups = (await priorHistory.json()) as Backup[];
    created = priorBackups.find(
      (item) => item.requested_by === managerEmail && item.status === "queued",
    );
    if (!created) {
      await expect(page.getByRole("button", { name: "Crear respaldo" })).toBeEnabled();
      const createResponse = page.waitForResponse(
        (response) => response.url().includes(`${API}/backups`) && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Crear respaldo" }).click();
      const response = await createResponse;
      expect(response.status()).toBe(202);
      created = (await response.json()) as Backup;
      expect(created.status).toBe("queued");
      expect(created.requested_by).toBe(managerEmail);
      expect(created.directory).toMatch(/^backups\/\d{8}T\d{6}Z-[\da-f]{8}$/);
      expect(Number.isNaN(Date.parse(created.created_at))).toBe(false);
    }

    let terminal: Backup | undefined;
    await expect
      .poll(
        async () => {
          const list = await managerApi.get(`${API}/backups`);
          expect(list.ok(), await list.text()).toBeTruthy();
          const entries = (await list.json()) as Backup[];
          terminal = entries.find((item) => item.backup_id === created!.backup_id);
          return terminal?.status;
        },
        { timeout: 180_000, intervals: [500, 1_000, 2_000, 5_000] },
      )
      .toBe("succeeded");

    expect(terminal).toBeDefined();
    expect(terminal!.requested_by).toBe(managerEmail);
    expect(terminal!.directory).toBe(created.directory);
    if (terminal!.status === "succeeded") {
      expect(terminal!.dynamodb_items).toEqual(expect.any(Number));
      expect(terminal!.opensearch_documents).toEqual(expect.any(Number));
      expect(terminal!.object_storage_objects).toEqual(expect.any(Number));
    }

    await expect
      .poll(async () => page.getByText(STATUS_LABELS[terminal!.status], { exact: true }).count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    if (terminal!.status === "succeeded") {
      const backupRow = page.locator("article").filter({ hasText: terminal!.directory }).first();
      await expect(backupRow.getByText(`DynamoDB: ${terminal!.dynamodb_items} registros`)).toBeVisible();
      await expect(backupRow.getByText(`OpenSearch: ${terminal!.opensearch_documents} documentos`)).toBeVisible();
      await expect(backupRow.getByText(`Objetos: ${terminal!.object_storage_objects}`)).toBeVisible();
    }

    await page.evaluate(() => {
      sessionStorage.setItem("e11-role", "analyst");
      localStorage.removeItem("aria.auth.accessToken");
    });
    await page.reload();
    await page.goto("/login");
    await page.getByLabel("Correo").fill(analystEmail);
    await page.getByLabel("Contraseña").fill(analystPassword);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/monitor$/);
    await expect(page.getByRole("link", { name: "Respaldos", exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([managerApi.dispose(), analystApi.dispose()]);
  }
});
