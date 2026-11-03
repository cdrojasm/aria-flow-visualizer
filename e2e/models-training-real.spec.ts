import { expect, test, type APIRequestContext, type Playwright } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);

const BASE_URL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const API_LOCATION = process.env.E2E_AUTH_API_URL ?? "http://localhost:8000";
const TRAINING_DATASET =
  process.env.E2E_MODEL_DATASET_PATH ??
  "/private/tmp/aria-e04-partitions/e04_actual_sanitized_100.csv";

type AsyncOperation = { id: string; status: string; error: string | null };
type Model = {
  id: string;
  tag: string;
  status: string;
  active: boolean;
  feature_transforms: { field: string; kind: string }[];
};

let api: APIRequestContext | undefined;
let bootstrapApi: APIRequestContext | undefined;
let accessToken: string | undefined;
let managerAccessToken: string | undefined;
let datasetName: string | undefined;
let modelId: string | undefined;
let previousActiveModelId: string | undefined;

const authHeaders = () => ({ Authorization: `Bearer ${accessToken}` });

async function expectJson<T>(
  response: { ok(): boolean; status(): number; text(): Promise<string> },
  label: string,
): Promise<T> {
  const body = await response.text();
  expect(response.ok(), `${label}: HTTP ${response.status()} ${body.slice(0, 500)}`).toBeTruthy();
  return JSON.parse(body) as T;
}

async function uploadDatasetInParts(
  request: APIRequestContext,
  filename: string,
  content: Buffer,
  headers: Record<string, string>,
) {
  const started = await expectJson<{
    upload_id: string;
    part_size_bytes: number;
    total_parts: number;
  }>(
    await request.post("/api/v0/datasets/uploads", {
      headers,
      data: { filename, total_size_bytes: content.byteLength },
    }),
    "iniciar carga fragmentada de E05",
  );
  for (let part = 1; part <= started.total_parts; part += 1) {
    const start = (part - 1) * started.part_size_bytes;
    const end = Math.min(start + started.part_size_bytes, content.byteLength);
    const response = await request.put(
      `/api/v0/datasets/uploads/${encodeURIComponent(started.upload_id)}/parts/${part}`,
      {
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        data: content.subarray(start, end),
      },
    );
    expect(response.status(), `subir parte E05 ${part}: ${await response.text()}`).toBe(204);
  }
  return request.post(
    `/api/v0/datasets/uploads/${encodeURIComponent(started.upload_id)}/complete`,
    { headers },
  );
}

async function provisionDataAnalyst(playwright: Playwright) {
  const hostname = new URL(BASE_URL).hostname;
  if (hostname !== "localhost")
    throw new Error(
      "El aprovisionamiento automático de usuarios sólo se permite contra API local.",
    );
  const jwtSecret = randomBytes(48).toString("base64url");
  const bootstrapToken = randomBytes(48).toString("base64url");
  const result = spawnSync(
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
  if (result.error || result.status !== 0)
    throw new Error(
      `No se pudo habilitar auth local (${result.error?.code ?? result.status}): ${result.stderr.slice(-1600)}`,
    );
  bootstrapApi = await playwright.request.newContext({ baseURL: API_LOCATION });
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
      { timeout: 180_000 },
    )
    .toBe(true);
  const webRefresh = spawnSync("docker", ["compose", "up", "-d", "--force-recreate", "web"], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (webRefresh.error || webRefresh.status !== 0) {
    throw new Error(
      `No se pudo refrescar nginx tras reconstruir la API: ${webRefresh.stderr.slice(-1200)}`,
    );
  }
  const users = await expectJson<
    Array<{ id: string; email: string; role: string; is_active: boolean }>
  >(await bootstrapApi.get("/api/v0/auth/users", { headers }), "consultar usuarios para E05");
  const email = process.env.E2E_MODEL_EMAIL ?? "e05-models-e2e@example.com";
  const existing = users.find((user) => user.email === email);
  if (existing && (existing.role !== "data_analyst" || !existing.is_active))
    throw new Error(
      `El usuario E05 debe estar activo con rol data_analyst; tiene ${existing.role}.`,
    );
  const password = `E05-${randomBytes(36).toString("base64url")}-Aa9!`;
  const response = existing
    ? await bootstrapApi.put(`/api/v0/auth/users/${encodeURIComponent(existing.id)}/password`, {
        headers,
        data: { password },
      })
    : await bootstrapApi.post("/api/v0/auth/users", {
        headers,
        data: { name: "E05 Modelos E2E", email, role: "data_analyst", password },
      });
  await expectJson(response, "aprovisionar usuario E05 data_analyst");
  return { email, password };
}

async function waitForOperation(id: string) {
  await expect
    .poll(
      async () => {
        const response = await api!.get(`/api/v0/async-operations/${encodeURIComponent(id)}`, {
          headers: authHeaders(),
        });
        if (!response.ok()) return `HTTP ${response.status()}`;
        const operation = (await response.json()) as AsyncOperation;
        if (operation.status === "FAILED")
          throw new Error(`Operación ${id} falló: ${operation.error ?? "sin detalle"}`);
        return operation.status;
      },
      { timeout: 720_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe("SUCCEEDED");
}

async function cleanResources() {
  if (!api || !accessToken) return;
  if (modelId) {
    if (previousActiveModelId && managerAccessToken) {
      await api.post(`/api/v0/models/${encodeURIComponent(previousActiveModelId)}/activate`, {
        headers: { Authorization: `Bearer ${managerAccessToken}` },
      });
    }
    const response = await api.delete(`/api/v0/models/${encodeURIComponent(modelId)}`, {
      headers: authHeaders(),
    });
    if (response.ok()) modelId = undefined;
  }
  if (datasetName) {
    const response = await api.delete(`/api/v0/datasets/${encodeURIComponent(datasetName)}`, {
      headers: authHeaders(),
    });
    if (response.ok()) {
      const deletion = (await response.json()) as { async_operation_id: string | null };
      if (deletion.async_operation_id) await waitForOperation(deletion.async_operation_id);
      datasetName = undefined;
    }
  }
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext({ baseURL: BASE_URL });
  let email = process.env.E2E_MODEL_EMAIL;
  let password = process.env.E2E_MODEL_PASSWORD;
  if (!email || !password) ({ email, password } = await provisionDataAnalyst(playwright));
  await expect
    .poll(
      async () => {
        try {
          return (await api!.get("/health")).ok();
        } catch {
          return false;
        }
      },
      { timeout: 120_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
  const login = await expectJson<{ access_token: string }>(
    await api.post("/api/v0/auth/login", { data: { email, password } }),
    "login real para E05",
  );
  accessToken = login.access_token;
  const managerEmail = process.env.E2E_MANAGER_EMAIL;
  const managerPassword = process.env.E2E_MANAGER_PASSWORD;
  if (managerEmail && managerPassword) {
    const managerLogin = await expectJson<{ access_token: string }>(
      await api.post("/api/v0/auth/login", {
        data: { email: managerEmail, password: managerPassword },
      }),
      "login manager para activar el modelo E05",
    );
    managerAccessToken = managerLogin.access_token;
  }
});

test.afterAll(async () => {
  try {
    await cleanResources();
  } finally {
    await bootstrapApi?.dispose();
    await api?.dispose();
  }
});

test("E05 API/UI real: entrena, activa y prueba un modelo con su contrato versionado", async ({
  page,
  playwright,
}) => {
  // Keep the 20-minute budget for real model training, but fail quickly when
  // a UI control is missing instead of letting a click/fill wait the whole test.
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  expect(accessToken).toBeTruthy();
  const existingModels = await expectJson<Model[]>(
    await api!.get("/api/v0/models", { headers: authHeaders() }),
    "consultar modelos antes de E05",
  );
  previousActiveModelId = existingModels.find((model) => model.active)?.id;
  const source = await readFile(TRAINING_DATASET);
  const filename = `e05_model_${Date.now()}_${randomBytes(3).toString("hex")}.csv`;
  datasetName = filename.replace(/\.csv$/i, "");
  const upload = await expectJson<{ name: string; async_operation_id: string | null }>(
    await uploadDatasetInParts(api!, filename, source, authHeaders()),
    "subir dataset sanitizado real de E05",
  );
  expect(upload.name).toBe(datasetName);
  if (upload.async_operation_id) await waitForOperation(upload.async_operation_id);
  const summary = await expectJson<{
    status: string;
    total_rows: number;
    available_fields: string[];
  }>(
    await api!.get(`/api/v0/datasets/${encodeURIComponent(datasetName)}/summary`, {
      headers: authHeaders(),
    }),
    "verificar dataset listo para E05",
  );
  expect(summary.status).toBe("READY");
  expect(summary.total_rows).toBeGreaterThanOrEqual(100);
  expect(summary.available_fields).toEqual(
    expect.arrayContaining([
      "marcacion_final",
      "eventtype",
      "channel",
      "amount_value",
      "biocatch_score",
    ]),
  );

  const tag = `e05-real-${Date.now()}`;
  const created = await expectJson<Model>(
    await api!.post("/api/v0/models", {
      headers: authHeaders(),
      data: {
        tag,
        description: "E05 E2E entrenamiento y scoring real",
        dataset_name: datasetName,
        target_field: "marcacion_final",
        positive_labels: ["risk", "risk-suspected"],
        feature_transforms: [
          { field: "eventtype", kind: "categorical", reference_field: null, top_n: 30 },
          { field: "channel", kind: "categorical", reference_field: null, top_n: 30 },
          { field: "amount_value", kind: "numeric", reference_field: null, top_n: 30 },
          { field: "biocatch_score", kind: "numeric", reference_field: null, top_n: 30 },
        ],
        training_config: {
          n_estimators: 60,
          max_depth: 3,
          learning_rate: 0.08,
          subsample: 0.8,
          colsample_bytree: 0.8,
          reg_lambda: 1,
          min_child_weight: 1,
          scale_pos_weight: null,
          early_stopping_rounds: 8,
          split_strategy: "stratified",
          time_field: "fecha_transaccion",
          timezone: "America/Bogota",
        },
      },
    }),
    "crear modelo con contrato E05",
  );
  modelId = created.id;
  expect(created.feature_transforms.map((field) => field.field)).toEqual([
    "eventtype",
    "channel",
    "amount_value",
    "biocatch_score",
  ]);

  const training = await expectJson<{ async_operation_id: string }>(
    await api!.post(`/api/v0/models/${encodeURIComponent(modelId)}/train`, {
      headers: authHeaders(),
    }),
    "encolar entrenamiento real E05",
  );
  await waitForOperation(training.async_operation_id);
  await expect
    .poll(
      async () =>
        (
          (await (
            await api!.get(`/api/v0/models/${encodeURIComponent(modelId)}`, {
              headers: authHeaders(),
            })
          ).json()) as Model
        ).status,
      { timeout: 120_000 },
    )
    .toBe("READY");
  expect(managerAccessToken, "E05 requiere un usuario manager para activar el modelo").toBeTruthy();
  const active = await expectJson<Model>(
    await api!.post(`/api/v0/models/${encodeURIComponent(modelId)}/activate`, {
      headers: { Authorization: `Bearer ${managerAccessToken}` },
    }),
    "activar modelo E05",
  );
  expect(active.active).toBe(true);

  const sampleResponse = await api!.get(
    `/api/v0/datasets/${encodeURIComponent(datasetName)}/rows?offset=0&limit=1`,
    { headers: authHeaders() },
  );
  const sampleBody = await expectJson<{ rows: Record<string, unknown>[] }>(
    sampleResponse,
    "leer registro real de prueba E05",
  );
  const sample = sampleBody.rows[0];
  await page.addInitScript(
    (token: string) => localStorage.setItem("aria.auth.accessToken", token),
    accessToken!,
  );
  await page.goto("/modelos");
  await expect(page.getByRole("heading", { name: "Modelos", level: 1 })).toBeVisible();
  const modelRow = page.getByRole("row").filter({ hasText: tag });
  await expect(modelRow).toBeVisible();
  await modelRow.getByRole("button", { name: "Ver" }).click();
  await page.getByRole("button", { name: "Probar contrato" }).click();
  await expect(page.getByRole("heading", { name: "Prueba del contrato del modelo" })).toBeVisible();
  for (const field of ["eventtype", "channel", "amount_value", "biocatch_score"]) {
    await page.getByLabel(field).fill(String(sample[field] ?? ""));
  }
  await page.getByRole("button", { name: "Puntuar registro" }).click();
  await expect(page.getByText(/Score calibrado/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/%/).first()).toBeVisible();
  const scored = await expectJson<{ score: number; model_id: string }>(
    await api!.post(`/api/v0/models/${encodeURIComponent(modelId)}/score`, {
      headers: authHeaders(),
      data: { row: sample },
    }),
    "puntuar por contrato usando el API real",
  );
  expect(scored.model_id).toBe(modelId);
  expect(scored.score).toBeGreaterThanOrEqual(0);
  expect(scored.score).toBeLessThanOrEqual(1);

  await test.info().attach("E05 modelo real", {
    body: Buffer.from(
      JSON.stringify(
        {
          dataset: datasetName,
          rows: summary.total_rows,
          model_id: modelId,
          status: active.status,
          active: active.active,
          score: scored.score,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  await cleanResources();
});
