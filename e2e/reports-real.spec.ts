import { expect, test, type Page } from "@playwright/test";
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
      email = "e10-reports-e2e@example.com";
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

// "Rango personalizado" is shared by Dashboard and Monitor: pick whole days in the
// calendar, apply, and check that the reads and the exported report follow that range.
async function pickCalendarDay(page: Page, iso: string) {
  const cell = page.locator(`td[data-day="${iso}"] button`);
  // The calendar opens on the current month; walk back until the day is on screen.
  for (let i = 0; i < 40 && (await cell.count()) === 0; i += 1)
    await page.getByRole("button", { name: "Go to the Previous Month" }).click();
  await cell.click();
}

for (const route of ["/dashboard", "/monitor"] as const) {
  test(`E10 rango personalizado en ${route}: valida, aplica y se refleja en lecturas y reporte`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value: string) => localStorage.setItem("aria.auth.accessToken", value),
      accessToken,
    );
    let channelFilter: string | undefined;
    const metricsEndpoint = route === "/dashboard" ? "overview" : "agent";
    await page.goto(route);
    const exportButton = page.getByRole("button", { name: "Exportar reporte" });
    await expect(exportButton).toBeEnabled({ timeout: 30_000 });

    // Whole local calendar days: the day before yesterday through yesterday.
    const days = await page.evaluate(() => {
      const iso = (offset: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      return { from: iso(-2), to: iso(-1), end: iso(0), tomorrow: iso(1) };
    });
    const day = (iso: string) => page.locator(`td[data-day="${iso}"] button`);
    const pickDay = (iso: string) => pickCalendarDay(page, iso);

    await page.getByRole("button", { name: "Rango personalizado" }).click();
    const apply = page.getByRole("button", { name: "Aplicar" });
    // Nothing picked yet: the range cannot be applied.
    await expect(apply).toBeDisabled();
    // Days after today cannot be picked.
    await expect(day(days.tomorrow)).toBeDisabled();
    // One day is already a valid range (that same day); the second click extends it.
    await pickDay(days.from);
    await expect(apply).toBeEnabled();
    await pickDay(days.to);
    await expect(apply).toBeEnabled();

    const rangeRequest = page.waitForRequest(
      (request) =>
        request.url().includes(`/api/v0/metrics/${metricsEndpoint}`) &&
        new URL(request.url()).searchParams.get("from") === `${days.from}T00:00:00`,
    );
    const rangeResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v0/metrics/${metricsEndpoint}`) &&
        response.url().includes(`${days.from}T00%3A00%3A00`) &&
        response.ok(),
    );
    await apply.click();
    // Whole days: [from 00:00, day after `to` 00:00), read in the operations timezone.
    const params = new URL((await rangeRequest).url()).searchParams;
    expect(params.get("to")).toBe(`${days.end}T00:00:00`);
    const metrics = (await (await rangeResponse).json()) as {
      range: { from: string; to: string; timezone: string };
    };
    expect(metrics.range.timezone).toBe("America/Bogota");
    expect(metrics.range.from).toMatch(new RegExp(`^${days.from}T00:00:00`));
    expect(metrics.range.to).toMatch(new RegExp(`^${days.end}T00:00:00`));
    // The trigger shows the chosen days and no preset stays highlighted.
    await expect(page.getByRole("button", { name: /\d+ \w+ – \d+ \w+/ })).toBeVisible();

    // The report follows the applied range (and, on the dashboard, the active filter).
    if (route === "/dashboard") {
      const filtered = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v0/metrics/overview") &&
          response.url().includes("CLOSED") &&
          response.ok(),
      );
      await page.getByRole("combobox", { name: "Estado" }).click();
      await page.getByRole("option", { name: "Cerrada" }).click();
      const filteredMetrics = (await (await filtered).json()) as typeof metrics;
      expect(filteredMetrics.range.from).toBe(metrics.range.from);
    }
    if (route === "/monitor") {
      // Channel options are the values observed in the range and segment options come
      // from the Biblioteca catalog; one of the two must offer a real value to filter by.
      let choice: { dimension: "channel" | "segment"; label: string; name: string } | undefined;
      for (const [dimension, label] of [
        ["channel", "Canal"],
        ["segment", "Segmento"],
      ] as const) {
        await page.getByRole("combobox", { name: label, exact: true }).click();
        const option = page
          .getByRole("option")
          .filter({ hasNotText: /^Todos/ })
          .first();
        if ((await option.count()) > 0) {
          choice = { dimension, label, name: ((await option.textContent()) ?? "").trim() };
          break;
        }
        await page.keyboard.press("Escape");
      }
      expect(choice, "ni Canal ni Segmento ofrecen un valor para filtrar el reporte").toBeTruthy();
      const channelName = choice!.name;
      const filtered = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v0/metrics/agent") &&
          decodeURIComponent(response.url()).includes(channelName) &&
          response.ok(),
      );
      await page.getByRole("option", { name: channelName, exact: true }).click();
      await filtered;
      await expect(exportButton).toBeEnabled();
      channelFilter = channelName;
    }
    await expect(exportButton).toBeEnabled();
    const download = page.waitForEvent("download");
    await exportButton.click();
    const csv = (await readFile((await (await download).path())!, "utf8")).replace("\uFEFF", "");
    expect(csv).toContain(metrics.range.from);
    expect(csv).toContain(metrics.range.to);
    if (route === "/dashboard") expect(csv).toMatch(/FILTROS APLICADOS\s+status,?"?CLOSED/);
    else expect(csv).toMatch(/FILTROS APLICADOS\s+(channel|segment),?"?/);
    if (route === "/monitor") expect(csv).toContain(channelFilter!);

    // Picking a preset leaves the custom range.
    await page.getByRole("button", { name: "Semana" }).click();
    await expect(page.getByRole("button", { name: "Rango personalizado" })).toBeVisible();
    await expect(page.getByRole("button", { name: /\d+ \w+ – \d+ \w+/ })).toHaveCount(0);
  });
}

test("E10 rango personalizado: la API rechaza rangos inválidos y devuelve vacío sin datos", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const read = (from: string, to: string) =>
    request.get(`${BASE_URL}/api/v0/metrics/overview?from=${from}&to=${to}`, { headers });
  // Reversed or malformed dates are a 422, never a silent empty report.
  expect((await read("2026-10-25T00:00:00", "2026-10-20T00:00:00")).status()).toBe(422);
  expect((await read("no-es-fecha", "2026-10-20T00:00:00")).status()).toBe(422);
  // A valid range with no alerts is a normal answer with zero totals.
  const empty = await read("2025-01-01T00:00:00", "2025-01-02T00:00:00");
  expect(empty.ok()).toBeTruthy();
  expect(((await empty.json()) as { totals: { alerts: number } }).totals.alerts).toBe(0);
});

test("E10 rango personalizado: cancelar no cambia el rango ni dispara lecturas", async ({
  page,
}) => {
  await page.addInitScript(
    (value: string) => localStorage.setItem("aria.auth.accessToken", value),
    accessToken,
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Exportar reporte" })).toBeEnabled({
    timeout: 30_000,
  });
  const customReads: string[] = [];
  page.on("request", (request) => {
    const from = new URL(request.url()).searchParams.get("from") ?? "";
    if (request.url().includes("/api/v0/metrics/overview") && from.endsWith("T00:00:00"))
      customReads.push(from);
  });
  await page.getByRole("button", { name: "Rango personalizado" }).click();
  await pickCalendarDay(page, "2025-01-10");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rango personalizado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Último día" })).toBeVisible();
  expect(customReads).toEqual([]);
});

test("E10 rango personalizado antiguo que cruza de mes: aviso de periodo parcial y reporte vacío", async ({
  page,
}) => {
  await page.addInitScript(
    (value: string) => localStorage.setItem("aria.auth.accessToken", value),
    accessToken,
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Exportar reporte" })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Rango personalizado" }).click();
  await pickCalendarDay(page, "2025-01-30");
  await pickCalendarDay(page, "2025-02-02");

  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/v0/metrics/overview") &&
      r.url().includes("2025-01-30T00%3A00%3A00") &&
      r.ok(),
  );
  await page.getByRole("button", { name: "Aplicar" }).click();
  const metrics = (await (await response).json()) as {
    range: { from: string; to: string };
    totals: { alerts: number };
    warnings: { code: string; periods: string[] }[];
  };
  // Crosses January and February; whole days up to the 3rd 00:00.
  expect(metrics.range.from).toMatch(/^2025-01-30T00:00:00/);
  expect(metrics.range.to).toMatch(/^2025-02-03T00:00:00/);
  expect(metrics.totals.alerts).toBe(0);
  expect(metrics.warnings.map((w) => w.code)).toContain("partial_period");

  // An empty range is a normal screen: the warning in short form, the detail on demand,
  // and no load error.
  await expect(page.getByText(/No se pudieron cargar/)).toHaveCount(0);
  const warning = page.getByRole("status").filter({ hasText: "Datos de más de 90 días" });
  await expect(warning).toBeVisible();
  await expect(page.getByText(/Los periodos? más antiguos?|más de 90 días atrás/)).toHaveCount(0);
  await warning.getByRole("button", { name: "Ver más" }).click();
  await expect(warning).toContainText("Periodos:");
  await warning.getByRole("button", { name: "Ver menos" }).click();
  await expect(warning).not.toContainText("Periodos:");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar reporte" }).click();
  const csv = (await readFile((await (await download).path())!, "utf8")).replace("\uFEFF", "");
  expect(csv).toContain(metrics.range.from);
  expect(csv).toContain(metrics.range.to);
});
