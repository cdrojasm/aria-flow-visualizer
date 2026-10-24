import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

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

  await page.addInitScript((value) => localStorage.setItem("aria.auth.accessToken", value), token);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  for (const route of ["/dashboard", "/monitor"]) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
    expect(new URL(page.url()).pathname).toBe(route);
    // Voicebot and Bidi are disabled for now: no section for them in the monitor.
    if (route === "/monitor") {
      await expect(page.getByRole("heading", { name: /^(Voicebot|Bidi)$/ })).toHaveCount(0);
    }
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
