import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The monitor splits its indicators in tabs; each one owns its own content.
async function expectMonitorTabs(page: Page) {
  const tabs = [
    {
      name: "Indicadores generales",
      content: ["Fraude no detectado", "Falsos positivos", "Errores LLM"],
    },
    { name: "Indicadores de área", content: ["Procesado por ARIA", "Latencia LLM media"] },
    { name: "Analistas y otros canales", content: ["Procesado por analistas"] },
    { name: "Explicabilidad", content: ["Alucinaciones", "Uso correcto de datos"] },
    {
      name: "Indicadores técnicos",
      content: [
        "Pasos del workflow",
        "Llamadas LLM por modelo",
        "Investigación delegada por fuente",
      ],
    },
    { name: "% Recomendaciones", content: ["% Recomendaciones"] },
  ];
  await expect(page.getByRole("tab")).toHaveCount(tabs.length);
  // Opens on the first tab (nothing stored yet) and shows one tab's content at a time.
  await expect(page.getByRole("tab", { name: tabs[0].name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Pasos del workflow" })).toHaveCount(0);
  for (const tab of tabs) {
    await page.getByRole("tab", { name: tab.name }).click();
    await expect(page.getByRole("tab", { name: tab.name })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
    for (const text of tab.content)
      await expect(
        page.getByRole("tabpanel").getByText(text, { exact: false }).first(),
      ).toBeVisible();
    // The other tabs' content is not on screen.
    for (const other of tabs.filter((t) => t.name !== tab.name))
      for (const text of other.content.filter((t) => !tab.content.includes(t)))
        await expect(page.getByRole("tabpanel").getByText(text, { exact: true })).toHaveCount(0);
    // Voicebot and Bidi are disabled for now: no section for them in any tab.
    await expect(page.getByRole("heading", { name: /^(Voicebot|Bidi)$/ })).toHaveCount(0);
    // The scope note and range warnings stay above the tabs whichever one is open.
    await expect(page.getByText("Sólo medidas acumulativas sobre el periodo")).toBeVisible();
  }

  // Arrow keys move between tabs.
  await page.getByRole("tab", { name: tabs[0].name }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: tabs[1].name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: tabs[0].name })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Changing the range keeps the open tab and refreshes its data.
  await page.getByRole("tab", { name: "Indicadores técnicos" }).click();
  const week = page.waitForResponse(
    (response) => response.url().includes("/api/v0/metrics/technical") && response.ok(),
  );
  await page.getByRole("button", { name: "Semana" }).click();
  await week;
  await expect(page.getByRole("tab", { name: "Indicadores técnicos" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Pasos del workflow" })).toBeVisible();

  // The report exports from any tab, not only the first one.
  await expect(page.getByRole("button", { name: "Exportar reporte" })).toBeEnabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar reporte" }).click();
  expect((await download).suggestedFilename()).toMatch(/^reporte-monitor-.*\.csv$/);

  // At tablet width the tab list wraps inside its container instead of overflowing it
  // (the app's fixed sidebar means phone widths are out of scope for the whole layout).
  await page.setViewportSize({ width: 800, height: 800 });
  const listBox = (await page.getByRole("tablist").boundingBox())!;
  for (const tab of tabs) {
    const box = await page.getByRole("tab", { name: tab.name }).boundingBox();
    expect(box, tab.name).toBeTruthy();
    expect(box!.x + box!.width, tab.name).toBeLessThanOrEqual(listBox.x + listBox.width + 1);
    expect(box!.x + box!.width, tab.name).toBeLessThanOrEqual(800);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // The last tab survives a reload.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Indicadores técnicos" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: tabs[0].name }).click();
}

test("observability pages, metrics reads, audit trail, and expired rollup cleanup", async ({
  page,
  request,
}) => {
  const baseURL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  test.skip(!email || !password, "Local E2E runner supplies temporary manager credentials.");

  const login = await request.post(`${baseURL}/api/v0/auth/login`, {
    data: { email, password },
  });
  expect(login.status(), await login.text()).toBe(200);
  const { access_token: token } = (await login.json()) as { access_token: string };

  const backend = resolve(process.cwd(), "../backend");
  const compose = (...args: string[]) =>
    execFileSync(
      "docker",
      [
        "compose",
        "-p",
        process.env.LOCAL_DOCKER_PROJECT ?? "aria-local",
        "-f",
        "deploy/local/docker/docker-compose.yml",
        ...args,
      ],
      { cwd: backend, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );

  const from = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  const auditIds: string[] = [];
  for (const endpoint of ["overview", "agent", "technical"]) {
    const correlationId = randomUUID();
    auditIds.push(correlationId);
    const response = await request.get(
      `${baseURL}/api/v0/metrics/${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Correlation-ID": correlationId,
        },
      },
    );
    expect(response.status(), await response.text()).toBe(200);
    const result = await response.json();
    expect(result.range.from).toBeTruthy();
    if (endpoint === "overview") expect(result.distributions).toBeTruthy();
  }

  const auditQuery = await request.get(`${baseURL}/api/v0/audit-logs?from_date=${encodeURIComponent(from.slice(0, 10))}&to_date=${encodeURIComponent(to.slice(0, 10))}&limit=10000`, { headers: { Authorization: `Bearer ${token}` } });
  expect(auditQuery.status(), await auditQuery.text()).toBe(200);
  const auditRows = (await auditQuery.json()) as Array<{ correlation_id?: string; entidad_tipo?: string }>;
  for (const correlationId of auditIds) expect(auditRows.some((row) => row.correlation_id === correlationId && row.entidad_tipo === "http_endpoint")).toBe(true);
  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const route of ["/dashboard", "/monitor"]) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe(route);
    // The scope note is one line; its detail only appears on demand.
    const scopeNote = page.getByText("Sólo medidas acumulativas sobre el periodo");
    await expect(scopeNote).toBeVisible();
    const detail = page.getByText(/no fotos de un instante/);
    await expect(detail).toHaveCount(0);
    await scopeNote.locator("xpath=..").getByRole("button", { name: "Ver más" }).click();
    await expect(detail).toBeVisible();
    if (route === "/monitor") await expectMonitorTabs(page);
    await expect(page.locator("body")).not.toBeEmpty();
  }
  expect(pageErrors).toEqual([]);

  const auditCheck = String.raw`
import json
from datetime import UTC, datetime
from boto3.dynamodb.conditions import Attr, Key
from src.infrastructure.persistence.database.dynamodb.client import get_dynamodb_resource
table = get_dynamodb_resource().Table("audit_log")
ids = json.loads(${JSON.stringify(JSON.stringify(auditIds))})
partition = datetime.now(UTC).date().isoformat()
for correlation_id in ids:
    response = table.query(
        KeyConditionExpression=Key("partition").eq(partition),
        FilterExpression=Attr("correlation_id").eq(correlation_id),
        ProjectionExpression="correlation_id, accion, entidad_tipo, entidad_id",
    )
    assert any(item.get("entidad_tipo") == "http_endpoint" and item.get("entidad_id", "").startswith("/api/v0/metrics/") for item in response.get("Items", [])), correlation_id
print("http-audit-ok")
`;
  expect(compose("exec", "-T", "api", "python", "-c", auditCheck)).toContain("http-audit-ok");

  const cleanupCheck = String.raw`
from datetime import UTC, datetime
from uuid import uuid4
from src.infrastructure.persistence.database.dynamodb.client import get_dynamodb_resource
from src.infrastructure.entrypoint.worker.celery.tasks import cleanup_expired_metric_rollups
table = get_dynamodb_resource().Table("metrics_rollups")
key = {"pk": "e2e-cleanup#" + str(uuid4()), "sk": "expired"}
table.put_item(Item={**key, "expires_at": int(datetime.now(UTC).timestamp()) - 60})
for _ in range(100):
    cleanup_expired_metric_rollups()
    if "Item" not in table.get_item(Key=key):
        print("expired-rollup-cleanup-ok")
        break
else:
    table.delete_item(Key=key)
    raise AssertionError("Expired rollup survived 100 cleanup task runs")
`;
  expect(compose("exec", "-T", "api", "python", "-c", cleanupCheck)).toContain(
    "expired-rollup-cleanup-ok",
  );
});
