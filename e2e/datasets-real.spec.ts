import { expect, test, type APIRequestContext, type Playwright } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);

const PARTITION_SIZES = [25, 100, 300, 900] as const;
const BASE_URL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const PARTITIONS_DIR = process.env.E2E_DATASET_PARTITIONS_DIR ?? "/private/tmp/aria-e04-partitions";
const API_LOCATION =
  process.env.E2E_AUTH_API_URL ?? `http://localhost:${process.env.LOCAL_API_PORT ?? "8000"}`;

type Dataset = { name: string; row_count: number };
type AsyncOperation = { id: string; status: string; error: string | null };
type PreparedPartition = { rows: number; name: string; path: string; bytes: number };

let api: APIRequestContext | undefined;
let bootstrapApi: APIRequestContext | undefined;
let accessToken: string | undefined;
let temporaryDirectory: string | undefined;
const datasetsCreated: string[] = [];
const timings: Array<Record<string, number | string>> = [];

function authHeaders() {
  return { Authorization: `Bearer ${accessToken}` };
}

async function responseJson<T>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
  label: string,
) {
  const body = await response.text();
  expect(response.ok(), `${label}: HTTP ${response.status()} ${body.slice(0, 500)}`).toBeTruthy();
  return JSON.parse(body) as T;
}

async function waitForOperation(operationId: string) {
  await expect
    .poll(
      async () => {
        const response = await api!.get(
          `/api/v0/async-operations/${encodeURIComponent(operationId)}`,
          {
            headers: authHeaders(),
          },
        );
        if (!response.ok()) return `HTTP ${response.status()}`;
        const operation = (await response.json()) as AsyncOperation;
        if (operation.status === "FAILED") {
          throw new Error(`La operación ${operationId} falló: ${operation.error ?? "sin detalle"}`);
        }
        return operation.status;
      },
      { timeout: 480_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe("SUCCEEDED");
}

async function createManagerThroughLocalAuth(playwright: Playwright) {
  const hostname = new URL(BASE_URL).hostname;
  if (hostname !== "localhost") {
    throw new Error(
      "No se recibieron credenciales y el aprovisionamiento automático sólo se permite contra API local.",
    );
  }

  const jwtSecret = randomBytes(48).toString("base64url");
  const bootstrapToken = randomBytes(48).toString("base64url");
  const make = spawnSync(
    "make",
    [
      "-C",
      resolve(process.cwd(), "../backend"),
      "local-auth-up",
      `LOCAL_API_PORT=${new URL(API_LOCATION).port || "8000"}`,
      `API_URL=${API_LOCATION}`,
    ],
    {
      input: `${jwtSecret}\n${bootstrapToken}\n`,
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (make.error || make.status !== 0) {
    const reason = make.error?.code ?? `exit ${make.status ?? "unknown"}`;
    throw new Error(`make -C ../backend local-auth-up no pudo completar (${reason}).`);
  }

  bootstrapApi = await playwright.request.newContext({ baseURL: API_LOCATION });
  const bootstrapHeaders = { "X-Bootstrap-Token": bootstrapToken };
  await expect
    .poll(
      async () => {
        try {
          return (await bootstrapApi!.get("/health")).ok();
        } catch {
          // `local-auth-up` returns once Docker starts the container; Uvicorn
          // may still be restarting and briefly reset the health connection.
          return false;
        }
      },
      { timeout: 180_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(true);

  const usersResponse = await bootstrapApi.get("/api/v0/auth/users", {
    headers: bootstrapHeaders,
  });
  const users = await responseJson<
    Array<{ id: string; email: string; role: string; is_active: boolean }>
  >(usersResponse, "listar usuarios locales para aprovisionar E04");
  const email = process.env.E2E_DATASET_AUTO_EMAIL ?? "e04-datasets-e2e@example.com";
  const existing = users.find((user) => user.email === email);
  if (existing && existing.role !== "manager") {
    throw new Error(
      `El usuario reutilizable ${email} existe con rol ${existing.role}, se requiere manager.`,
    );
  }
  if (existing && !existing.is_active) {
    throw new Error(
      `El usuario reutilizable ${email} está inactivo; actívalo antes de ejecutar E04.`,
    );
  }

  const password = `E04-${randomBytes(36).toString("base64url")}-Aa9!`;
  const provisioned = existing
    ? await bootstrapApi.put(`/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`, {
        headers: bootstrapHeaders,
        data: { password },
      })
    : await bootstrapApi.post("/api/v0/auth/users", {
        headers: bootstrapHeaders,
        data: { name: "E04 Datasets E2E", email, role: "manager", password },
      });
  await responseJson(provisioned, "aprovisionar usuario local manager para E04");
  return { email, password };
}

async function deleteTemporaryDataset(name: string) {
  const current = await api!.get("/api/v0/datasets", { headers: authHeaders() });
  const existing = await responseJson<Dataset[]>(current, "consultar datasets antes de limpiar");
  if (!existing.some((dataset) => dataset.name === name)) return;

  const response = await api!.delete(`/api/v0/datasets/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  const deletion = await responseJson<{
    name: string;
    deleted: boolean;
    async_operation_id: string | null;
  }>(response, `solicitar borrado de ${name}`);
  if (deletion.async_operation_id) await waitForOperation(deletion.async_operation_id);

  await expect
    .poll(
      async () => {
        const listed = await api!.get("/api/v0/datasets", { headers: authHeaders() });
        const datasets = await responseJson<Dataset[]>(listed, "verificar borrado de dataset");
        return datasets.some((dataset) => dataset.name === name);
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(false);
}

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(660_000);
  api = await playwright.request.newContext({ baseURL: BASE_URL });
  let email = process.env.E2E_MANAGER_EMAIL;
  let password = process.env.E2E_MANAGER_PASSWORD;
  if (!email || !password) {
    const generated = await createManagerThroughLocalAuth(playwright);
    email = generated.email;
    password = generated.password;
  }
  const login = await api.post("/api/v0/auth/login", { data: { email, password } });
  const session = await responseJson<{ access_token: string }>(login, "login para E04 real");
  accessToken = session.access_token;

  const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  temporaryDirectory = await mkdtemp(join(tmpdir(), "aria-e04-real-"));
  for (const rows of PARTITION_SIZES) {
    const source = join(PARTITIONS_DIR, `e04_actual_sanitized_${rows}.csv`);
    const filename = `e04_real_${runId}_${rows}.csv`;
    const target = join(temporaryDirectory, filename);
    await copyFile(source, target);
    datasetsCreated.push(filename.replace(/\.csv$/i, ""));
    timings.push({
      rows,
      name: filename.replace(/\.csv$/i, ""),
      path: target,
      bytes: (await stat(target)).size,
    });
  }
});

test.afterAll(async () => {
  try {
    if (api && accessToken) {
      for (const name of [...datasetsCreated].reverse()) {
        await deleteTemporaryDataset(name);
      }
    }
  } finally {
    await bootstrapApi?.dispose();
    await api?.dispose();
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("E04 API/UI real: carga particiones ARIA de 25, 100, 300 y 900 filas", async ({ page }) => {
  expect(api).toBeDefined();
  expect(accessToken).toBeTruthy();

  await page.addInitScript((token: string) => {
    localStorage.setItem("aria.auth.accessToken", token);
    localStorage.setItem(
      "aria.biblioteca.activeTab.v1",
      JSON.stringify({ activeTab: "datasets", activeKnowledgeTab: "vector-store" }),
    );
  }, accessToken!);
  await page.goto("/biblioteca");
  await expect(page.getByRole("button", { name: "Subir CSV" })).toBeVisible();

  for (const rows of PARTITION_SIZES) {
    const prepared = timings.find((item) => item.rows === rows)!;
    const name = String(prepared.name);
    const filePath = String(prepared.path);
    const uploadStartedAt = Date.now();

    await page.getByRole("button", { name: "Subir CSV" }).click();
    await page.locator('input[type="file"]').setInputFiles(filePath);
    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/complete") &&
        new URL(response.url()).pathname.includes("/api/v0/datasets/uploads/"),
    );
    await page.getByRole("button", { name: "Subir dataset" }).click();
    const uploadResponse = await uploadResponsePromise;
    const upload = await responseJson<{
      name: string;
      async_operation_id: string | null;
    }>(uploadResponse, `subir partición de ${rows} filas`);
    expect(uploadResponse.status()).toBe(202);
    expect(upload.name).toBe(name);
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    const uploadedAt = Date.now();
    if (upload.async_operation_id) await waitForOperation(upload.async_operation_id);
    const operationFinishedAt = Date.now();

    const summaryResponse = await api!.get(`/api/v0/datasets/${encodeURIComponent(name)}/summary`, {
      headers: authHeaders(),
    });
    const summary = await responseJson<{
      dataset_name: string;
      status: string;
      total_rows: number;
      available_fields: string[];
    }>(summaryResponse, `resumen de ${name}`);
    expect(summary).toMatchObject({ dataset_name: name, status: "READY", total_rows: rows });
    for (const field of [
      "eventid",
      "eventtype",
      "channel",
      "integrationpoint",
      "amount_value",
      "customerid",
      "transactionid",
    ]) {
      expect(summary.available_fields).toContain(field);
    }

    const rowsStartedAt = Date.now();
    const rowResponse = await api!.get(
      `/api/v0/datasets/${encodeURIComponent(name)}/rows?offset=0&limit=1`,
      { headers: authHeaders() },
    );
    const pageOfRows = await responseJson<{ rows: Record<string, unknown>[]; total: number }>(
      rowResponse,
      `leer filas de ${name}`,
    );
    expect(pageOfRows.total).toBe(rows);
    expect(pageOfRows.rows).toHaveLength(1);
    expect(Object.keys(pageOfRows.rows[0] ?? {})).toEqual(
      expect.arrayContaining(summary.available_fields),
    );

    timings.find((item) => item.rows === rows)!.upload_ms = uploadedAt - uploadStartedAt;
    timings.find((item) => item.rows === rows)!.analysis_ms = operationFinishedAt - uploadedAt;
    timings.find((item) => item.rows === rows)!.row_query_ms = Date.now() - rowsStartedAt;

    if (rows === PARTITION_SIZES[0]) {
      const uploadedDatasetRow = page.getByRole("row").filter({ hasText: name });
      await uploadedDatasetRow.getByRole("button", { name: "Visualizar" }).click();
      await expect(
        page.getByRole("tabpanel", { name: "Resumen" }).getByText("READY", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("tabpanel", { name: "Resumen" }).getByText("25", { exact: true }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Filas" }).click();
      await expect(page.getByText("25 filas totales.")).toBeVisible();
      await expect(page.getByRole("cell", { name: /^E04-25-/ }).first()).toBeVisible();

      const templateDownloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Plantilla CSV" }).click();
      const templateDownload = await templateDownloadPromise;
      expect(templateDownload.suggestedFilename()).toBe(`${name}_template.csv`);
      const uploaded = await readFile(filePath, "utf8");
      const downloaded = await readFile((await templateDownload.path())!, "utf8");
      expect(downloaded.split(/\r?\n/, 1)[0]).toBe(uploaded.split(/\r?\n/, 1)[0]);
      await page.getByRole("button", { name: "Cerrar panel" }).click();
    }
  }

  await test.info().attach("E04 real scale timings", {
    body: Buffer.from(JSON.stringify(timings, null, 2)),
    contentType: "application/json",
  });

  for (const name of datasetsCreated) await deleteTemporaryDataset(name);
  datasetsCreated.length = 0;
});
