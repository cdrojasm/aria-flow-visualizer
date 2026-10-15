import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BASE_URL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
let accessToken: string;

test.beforeAll(async ({ playwright }) => {
  let email = process.env.E2E_MANAGER_EMAIL;
  let password = process.env.E2E_MANAGER_PASSWORD;
  let bootstrapApi: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
  try {
    if (!email || !password) {
      if (new URL(BASE_URL).hostname !== "localhost")
        throw new Error("El aprovisionamiento automático de manager sólo se permite en local.");
      const jwtSecret = randomBytes(48).toString("base64url");
      const bootstrapToken = randomBytes(48).toString("base64url");
      const apiUrl = process.env.E2E_AUTH_API_URL ?? "http://localhost:8000";
      const auth = spawnSync(
        "make",
        [
          "-C",
          resolve(process.cwd(), "../backend"),
          "local-auth-up",
          `LOCAL_API_PORT=${new URL(apiUrl).port || "8000"}`,
          `API_URL=${apiUrl}`,
        ],
        {
          input: `${jwtSecret}\n${bootstrapToken}\n`,
          encoding: "utf8",
          timeout: 600_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      if (auth.error || auth.status !== 0)
        throw new Error(`No se pudo habilitar auth local para E10: ${auth.stderr.slice(-1200)}`);
      bootstrapApi = await playwright.request.newContext({ baseURL: apiUrl });
      const headers = { "X-Bootstrap-Token": bootstrapToken };
      await expect
        .poll(
          async () => {
            try {
              return (await bootstrapApi!.get("/health")).ok();
            } catch {
              return false;
            }
          },
          { timeout: 180_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe(true);
      const list = await bootstrapApi.get("/api/v0/auth/users", { headers });
      expect(list.ok()).toBeTruthy();
      const users = (await list.json()) as { id: string; email: string; role: string }[];
      email = "e10-reports-e2e@aria.test";
      password = `E10-${randomBytes(32).toString("base64url")}-Aa9!`;
      const existing = users.find((user) => user.email === email);
      if (existing && existing.role !== "manager")
        throw new Error(`El usuario E10 existente debe ser manager; tiene ${existing.role}.`);
      const saved = existing
        ? await bootstrapApi.put(`/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`, {
            headers,
            data: { password },
          })
        : await bootstrapApi.post("/api/v0/auth/users", {
            headers,
            data: { name: "E10 Reportes E2E", email, role: "manager", password },
          });
      expect(saved.ok()).toBeTruthy();
      const web = spawnSync("docker", ["compose", "up", "-d", "--force-recreate", "web"], {
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      if (web.error || web.status !== 0)
        throw new Error(`No se pudo refrescar nginx para E10: ${web.stderr.slice(-1200)}`);
    }
    const login = await playwright.request.newContext({ baseURL: BASE_URL });
    try {
      await expect
        .poll(
          async () => {
            try {
              const response = await login.post("/api/v0/auth/login", {
                data: { email, password },
                timeout: 5_000,
              });
              if (!response.ok()) return false;
              accessToken = ((await response.json()) as { access_token: string }).access_token;
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 60_000, intervals: [500, 1_000, 2_000] },
        )
        .toBe(true);
    } finally {
      await login.dispose();
    }
  } finally {
    await bootstrapApi?.dispose();
  }
});

test("E10 API/UI real: exporta reportes de Dashboard y Monitor", async ({ page }) => {
  await page.addInitScript(
    (value: string) => localStorage.setItem("aria.auth.accessToken", value),
    accessToken,
  );

  for (const report of [
    {
      path: "/dashboard",
      endpoint: "/api/v0/metrics/overview",
      title: "REPORTE DE DASHBOARD ARIA",
      checks: ["INDICADORES", "PERIODOS", "PERFIL HORARIO", "DISTRIBUCIÓN"],
      countLabel: "Alertas",
    },
    {
      path: "/monitor",
      endpoint: "/api/v0/metrics/agent",
      title: "REPORTE DEL MONITOR ARIA",
      checks: [
        "INDICADORES DEL AGENTE",
        "MÉTODOS DE RESOLUCIÓN",
        "ADVERTENCIAS DEL RANGO",
        "PERIODOS DEL AGENTE",
        "PASOS DEL WORKFLOW",
        "LLAMADAS LLM",
        "EVALUACIONES",
      ],
      countLabel: "Alertas",
    },
  ]) {
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes(report.endpoint) && response.ok(),
    );
    const technicalPromise =
      report.path === "/monitor"
        ? page.waitForResponse(
            (response) => response.url().includes("/api/v0/metrics/technical") && response.ok(),
          )
        : undefined;
    await page.goto(report.path);
    const metricsResponse = await responsePromise;
    const metrics = (await metricsResponse.json()) as {
      range: { from: string; to: string; timezone: string };
      totals?: { alerts: number };
      fraud_quality?: { undetected_fraud: number };
    };
    const technical = technicalPromise ? await (await technicalPromise).json() : undefined;
    if (technical) {
      expect(technical.range.from).toBe(metrics.range.from);
      expect(technical.range.to).toBe(metrics.range.to);
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar reporte" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^reporte-(dashboard|monitor)-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/,
    );
    const path = await download.path();
    expect(path).toBeTruthy();
    const csv = (await readFile(path!, "utf8")).replace(/^\uFEFF/, "");
    expect(csv).toContain(report.title);
    expect(csv).toContain(metrics.range.from);
    expect(csv).toContain(metrics.range.to);
    expect(csv).toContain(metrics.range.timezone);
    for (const section of report.checks) expect(csv).toContain(section);
    if (report.path === "/dashboard") expect(csv).toContain(String(metrics.totals!.alerts));
    else {
      expect(csv).toContain(String(metrics.fraud_quality!.undetected_fraud));
      expect(csv).toContain(String(technical.workflow_steps.executions));
      expect(csv).toContain(String(technical.llm_calls.calls));
    }
    expect(csv).toContain(report.countLabel);
  }
});
