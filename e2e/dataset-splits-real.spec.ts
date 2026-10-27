import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

// #23: reproducible dataset splits from uploaded and catalog sources, the
// immutability of the copy and its use by the model-training worker. The
// production (mature-sample) source is covered in mature-sampler-real.spec.ts,
// right after the sampler creates the snapshot.
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);

const BASE_URL = process.env.ARIA_E2E_BASE_URL ?? "http://localhost";
const PROPORTIONS = { training: 0.6, validation: 0.2, calibration: 0.1, test: 0.1 };
const PARTITIONS = ["training", "validation", "calibration", "test"] as const;
const SOURCE_ROWS = 120;

type AsyncOperation = { id: string; status: string; error: string | null };
type SplitResponse = {
  dataset_name: string;
  snapshot_id: string;
  source_content_sha256: string;
  partition_field: string;
  partition_counts: Record<string, number>;
  strata_distribution: Record<string, Record<string, number>>;
  source_context: Record<string, unknown>;
  schema_context: Record<string, unknown>;
  warnings: string[];
};
type SplitPreview = Omit<SplitResponse, "dataset_name" | "snapshot_id" | "partition_field"> & {
  source_row_count: number;
  available_fields: string[];
};

let api: APIRequestContext | undefined;
let accessToken: string | undefined;
let runId = "";
let sourceName = "";
const datasetsCreated: string[] = [];
const modelsCreated: string[] = [];

const authHeaders = () => ({ Authorization: `Bearer ${accessToken}` });

async function responseJson<T>(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
  label: string,
) {
  const body = await response.text();
  expect(response.ok(), `${label}: HTTP ${response.status()} ${body.slice(0, 500)}`).toBeTruthy();
  return JSON.parse(body) as T;
}

async function waitForOperation(operationId: string, timeout = 480_000) {
  await expect
    .poll(
      async () => {
        const response = await api!.get(
          `/api/v0/async-operations/${encodeURIComponent(operationId)}`,
          { headers: authHeaders() },
        );
        if (!response.ok()) return `HTTP ${response.status()}`;
        const operation = (await response.json()) as AsyncOperation;
        if (operation.status === "FAILED") {
          throw new Error(`La operación ${operationId} falló: ${operation.error ?? "sin detalle"}`);
        }
        return operation.status;
      },
      { timeout, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe("SUCCEEDED");
}

function sourceCsv() {
  const header = "alert_id,channel,eventtype,amount_value,biocatch_score,marcacion_final";
  const lines = Array.from({ length: SOURCE_ROWS }, (_, index) => {
    const fraud = index % 2 === 0;
    const channel = ["web", "app", "pse"][index % 3];
    const eventtype = index % 4 < 2 ? "transferencia" : "pago";
    const amount = 10_000 + ((index * 7_919) % 900_000) + (fraud ? 400_000 : 0);
    const biocatch = fraud ? 600 + (index % 300) : 100 + (index % 300);
    return `E23-${runId}-${index},${channel},${eventtype},${amount},${biocatch},${
      fraud ? "risk" : "legit"
    }`;
  });
  return Buffer.from([header, ...lines].join("\n") + "\n", "utf8");
}

async function uploadDataset(filename: string, content: Buffer) {
  const started = await responseJson<{
    upload_id: string;
    part_size_bytes: number;
    total_parts: number;
  }>(
    await api!.post("/api/v0/datasets/uploads", {
      headers: authHeaders(),
      data: { filename, total_size_bytes: content.byteLength },
    }),
    "iniciar carga del dataset #23",
  );
  for (let part = 1; part <= started.total_parts; part += 1) {
    const start = (part - 1) * started.part_size_bytes;
    const end = Math.min(start + started.part_size_bytes, content.byteLength);
    const response = await api!.put(
      `/api/v0/datasets/uploads/${encodeURIComponent(started.upload_id)}/parts/${part}`,
      {
        headers: { ...authHeaders(), "Content-Type": "application/octet-stream" },
        data: content.subarray(start, end),
      },
    );
    expect(response.status(), `subir parte ${part}: ${await response.text()}`).toBe(204);
  }
  return responseJson<{ name: string; async_operation_id: string | null }>(
    await api!.post(`/api/v0/datasets/uploads/${encodeURIComponent(started.upload_id)}/complete`, {
      headers: authHeaders(),
    }),
    "completar carga del dataset #23",
  );
}

async function allRows(name: string) {
  const page = await responseJson<{ rows: Record<string, unknown>[]; total: number }>(
    await api!.get(`/api/v0/datasets/${encodeURIComponent(name)}/rows?offset=0&limit=500`, {
      headers: authHeaders(),
    }),
    `leer filas de ${name}`,
  );
  expect(page.rows).toHaveLength(page.total);
  return page.rows;
}

function assignment(rows: Record<string, unknown>[]) {
  return Object.fromEntries(
    rows.map((row) => [String(row.alert_id), String(row.__aria_split_partition)]),
  );
}

async function createSplit(source: string, target: string, seed: number, strata: string[]) {
  const response = await api!.post(`/api/v0/datasets/${encodeURIComponent(source)}/splits`, {
    headers: authHeaders(),
    data: { target_name: target, proportions: PROPORTIONS, seed, stratify_fields: strata },
  });
  if (!datasetsCreated.includes(target)) datasetsCreated.push(target);
  expect(response.status(), `crear split ${target}: ${await response.text()}`).toBe(201);
  return (await response.json()) as SplitResponse;
}

async function deleteDataset(name: string) {
  const response = await api!.delete(`/api/v0/datasets/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  if (response.status() === 404) return;
  const deletion = await responseJson<{ async_operation_id: string | null }>(
    response,
    `borrar ${name}`,
  );
  if (deletion.async_operation_id) await waitForOperation(deletion.async_operation_id);
}

test.beforeAll(async ({ playwright }) => {
  test.skip(
    !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
    "Define E2E_MANAGER_EMAIL y E2E_MANAGER_PASSWORD.",
  );
  api = await playwright.request.newContext({ baseURL: BASE_URL });
  const session = await responseJson<{ access_token: string }>(
    await api.post("/api/v0/auth/login", {
      data: { email: process.env.E2E_MANAGER_EMAIL, password: process.env.E2E_MANAGER_PASSWORD },
    }),
    "login manager para #23",
  );
  accessToken = session.access_token;
  runId = `${Date.now()}${randomBytes(2).toString("hex")}`;
  sourceName = `e23_split_source_${runId}`;
  datasetsCreated.push(sourceName);
  const upload = await uploadDataset(`${sourceName}.csv`, sourceCsv());
  expect(upload.name).toBe(sourceName);
  if (upload.async_operation_id) await waitForOperation(upload.async_operation_id);
});

test.afterAll(async () => {
  try {
    if (api && accessToken) {
      for (const id of modelsCreated) {
        await api.delete(`/api/v0/models/${encodeURIComponent(id)}`, { headers: authHeaders() });
      }
      for (const name of [...datasetsCreated].reverse()) await deleteDataset(name);
    }
  } finally {
    await api?.dispose();
  }
});

test("#23 dataset cargado: la UI muestra distribución y origen; la copia es disjunta, reproducible e inmutable", async ({
  page,
}) => {
  const splitName = `${sourceName}_split`;
  datasetsCreated.push(splitName);
  await page.addInitScript((token: string) => {
    localStorage.setItem("aria.auth.accessToken", token);
    localStorage.setItem(
      "aria.biblioteca.activeTab.v1",
      JSON.stringify({ activeTab: "datasets", activeKnowledgeTab: "vector-store" }),
    );
  }, accessToken!);
  await page.goto("/biblioteca");
  const sourceRow = page.getByRole("row").filter({ hasText: sourceName });
  await expect(sourceRow).toBeVisible();

  const firstPreview = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/splits/preview"),
  );
  await sourceRow.getByRole("button", { name: "Particionar" }).click();
  const unstratified = await responseJson<SplitPreview>(await firstPreview, "vista previa");
  expect(unstratified.source_row_count).toBe(SOURCE_ROWS);
  expect(unstratified.source_context).toMatchObject({ kind: "uploaded", origin: "UPLOADED" });
  expect(unstratified.strata_distribution).toEqual({});
  const previewRegion = page.getByRole("region", { name: "Vista previa de particiones" });
  await expect(previewRegion.getByRole("group", { name: "Origen de la partición" })).toContainText(
    "Dataset cargado",
  );

  const stratifiedPreview = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/splits/preview") &&
      (response.request().postData() ?? "").includes("marcacion_final"),
  );
  await page.getByRole("checkbox", { name: "marcacion_final" }).check();
  const preview = await responseJson<SplitPreview>(await stratifiedPreview, "vista estratificada");
  expect(Object.keys(preview.strata_distribution).sort()).toEqual(["legit", "risk"]);
  for (const counts of Object.values(preview.strata_distribution)) {
    expect(counts).toEqual({ training: 36, validation: 12, calibration: 6, test: 6 });
  }
  const strataTable = previewRegion.getByRole("table", { name: "Distribución por estrato" });
  await expect(strataTable.getByRole("row", { name: /risk/ })).toContainText("36");
  await expect(strataTable.getByRole("row", { name: /legit/ })).toContainText("12");
  // A free-form CSV carries no schema mapping: if the active schema has
  // mandatory fields the copy is flagged instead of silently trusted.
  if (preview.warnings.length > 0) {
    await expect(
      previewRegion.getByRole("list", { name: "Avisos de compatibilidad" }),
    ).toBeVisible();
    expect(preview.schema_context).toMatchObject({ compatible: false });
  }

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/v0/datasets/${encodeURIComponent(sourceName)}/splits`,
  );
  await page.getByRole("button", { name: "Confirmar y crear copia" }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const split = (await createdResponse.json()) as SplitResponse;
  expect(split.partition_counts).toEqual({
    training: 72,
    validation: 24,
    calibration: 12,
    test: 12,
  });
  expect(split.strata_distribution).toEqual(preview.strata_distribution);

  // Every source record lands in exactly one partition.
  const sourceRows = await allRows(sourceName);
  const splitRows = await allRows(splitName);
  const ids = splitRows.map((row) => String(row.alert_id));
  expect(new Set(ids).size).toBe(SOURCE_ROWS);
  expect(new Set(ids)).toEqual(new Set(sourceRows.map((row) => String(row.alert_id))));
  for (const name of PARTITIONS) {
    const partitionIds = splitRows.filter((row) => row.__aria_split_partition === name);
    expect(partitionIds).toHaveLength(split.partition_counts[name]);
  }

  // Same name + same parameters is idempotent; same seed under another name
  // reproduces the assignment row by row; another seed changes it.
  const repeated = await createSplit(sourceName, splitName, 42, ["marcacion_final"]);
  expect(repeated.snapshot_id).toBe(split.snapshot_id);
  expect(await allRows(splitName)).toHaveLength(SOURCE_ROWS);
  const replay = await createSplit(sourceName, `${sourceName}_replay`, 42, ["marcacion_final"]);
  expect(replay.snapshot_id).toBe(split.snapshot_id);
  expect(replay.source_content_sha256).toBe(split.source_content_sha256);
  expect(assignment(await allRows(replay.dataset_name))).toEqual(assignment(splitRows));
  const reseeded = await createSplit(sourceName, `${sourceName}_seed7`, 7, ["marcacion_final"]);
  expect(reseeded.snapshot_id).not.toBe(split.snapshot_id);
  expect(assignment(await allRows(reseeded.dataset_name))).not.toEqual(assignment(splitRows));

  const conflicting = await api!.post(`/api/v0/datasets/${encodeURIComponent(sourceName)}/splits`, {
    headers: authHeaders(),
    data: { target_name: splitName, proportions: PROPORTIONS, seed: 7, stratify_fields: [] },
  });
  expect(conflicting.status()).toBe(409);

  // The partitioned copy is immutable.
  const append = await api!.post(`/api/v0/datasets/${encodeURIComponent(splitName)}/rows`, {
    headers: authHeaders(),
    data: { rows: [{ ...splitRows[0], alert_id: `E23-${runId}-leak` }] },
  });
  expect(append.status(), await append.text()).toBe(409);
  expect(await allRows(splitName)).toHaveLength(SOURCE_ROWS);

  const summary = await responseJson<{
    origin: string;
    split_metadata: { source_context: Record<string, unknown>; warnings: string[] };
  }>(
    await api!.get(`/api/v0/datasets/${encodeURIComponent(splitName)}/summary`, {
      headers: authHeaders(),
    }),
    "resumen del split",
  );
  expect(summary.origin).toBe("PARTITIONED");
  expect(summary.split_metadata.source_context).toMatchObject({ kind: "uploaded" });
  expect(summary.split_metadata.warnings).toEqual(split.warnings);

  await page.reload();
  const partitionedRow = page.getByRole("row").filter({ hasText: splitName });
  await partitionedRow.getByRole("button", { name: "Visualizar" }).click();
  await expect(page.getByText("Configuración reproducible de particiones")).toBeVisible();
  await expect(page.getByRole("group", { name: "Origen de la partición" })).toContainText(
    "Dataset cargado",
  );
  await expect(page.getByRole("table", { name: "Distribución por estrato" })).toBeVisible();
});

test("#23 dataset del catálogo: un extraído se particiona registrando su procedencia", async () => {
  const extractedName = `${sourceName}_extract`;
  datasetsCreated.push(extractedName);
  const extracted = await responseJson<{ async_operation_id: string | null }>(
    await api!.post("/api/v0/datasets/extract", {
      headers: authHeaders(),
      data: {
        source_names: [sourceName],
        filters: { channel: "web" },
        percentage: 100,
        target_name: extractedName,
      },
    }),
    "extraer dataset del catálogo",
  );
  if (extracted.async_operation_id) await waitForOperation(extracted.async_operation_id);
  // The extraction's analysis runs after the rows are written; the row total
  // is reported from the summary once it is READY.
  await expect
    .poll(
      async () => {
        const response = await api!.get(
          `/api/v0/datasets/${encodeURIComponent(extractedName)}/summary`,
          { headers: authHeaders() },
        );
        if (!response.ok()) return `HTTP ${response.status()}`;
        const summary = (await response.json()) as { status: string; total_rows: number };
        return `${summary.status}:${summary.total_rows}`;
      },
      { timeout: 180_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(`READY:${SOURCE_ROWS / 3}`);
  const extractedRows = await allRows(extractedName);
  expect(extractedRows).toHaveLength(SOURCE_ROWS / 3);

  const split = await createSplit(extractedName, `${extractedName}_split`, 42, []);
  expect(split.source_context).toMatchObject({
    kind: "catalog",
    origin: "EXTRACTED",
    source_dataset_names: [sourceName],
  });
  expect(Object.values(split.partition_counts).reduce((a, b) => a + b, 0)).toBe(
    extractedRows.length,
  );
  const ids = (await allRows(split.dataset_name)).map((row) => String(row.alert_id));
  expect(new Set(ids)).toEqual(new Set(extractedRows.map((row) => String(row.alert_id))));
});

test("#23 entrenamiento: el worker de modelos usa exactamente las particiones del split", async () => {
  const splitName = `${sourceName}_split`;
  const split = await responseJson<{
    split_metadata: { partition_counts: Record<string, number> };
  }>(
    await api!.get(`/api/v0/datasets/${encodeURIComponent(splitName)}/summary`, {
      headers: authHeaders(),
    }),
    "metadatos del split para entrenar",
  );
  const model = await responseJson<{ id: string }>(
    await api!.post("/api/v0/models", {
      headers: authHeaders(),
      data: {
        tag: `e23-split-${runId}`,
        description: "#23 E2E: entrenamiento sobre particiones reproducibles",
        dataset_name: splitName,
        target_field: "marcacion_final",
        positive_labels: ["risk"],
        feature_transforms: [
          { field: "eventtype", kind: "categorical", reference_field: null, top_n: 30 },
          { field: "channel", kind: "categorical", reference_field: null, top_n: 30 },
          { field: "amount_value", kind: "numeric", reference_field: null, top_n: 30 },
          { field: "biocatch_score", kind: "numeric", reference_field: null, top_n: 30 },
        ],
        training_config: {
          n_estimators: 30,
          max_depth: 3,
          learning_rate: 0.1,
          subsample: 1,
          colsample_bytree: 1,
          reg_lambda: 1,
          min_child_weight: 1,
          scale_pos_weight: null,
          early_stopping_rounds: 5,
          split_strategy: "stratified",
          timezone: "America/Bogota",
        },
      },
    }),
    "crear modelo sobre el split",
  );
  modelsCreated.push(model.id);
  const training = await responseJson<{ async_operation_id: string }>(
    await api!.post(`/api/v0/models/${encodeURIComponent(model.id)}/train`, {
      headers: authHeaders(),
    }),
    "encolar entrenamiento sobre el split",
  );
  await waitForOperation(training.async_operation_id, 720_000);
  const trained = await responseJson<{ status: string; metrics: Record<string, number> | null }>(
    await api!.get(`/api/v0/models/${encodeURIComponent(model.id)}`, { headers: authHeaders() }),
    "leer modelo entrenado",
  );
  expect(trained.status).toBe("READY");
  const counts = split.split_metadata.partition_counts;
  expect(trained.metrics).toMatchObject({
    n_samples: SOURCE_ROWS,
    n_training: counts.training,
    n_validation: counts.validation,
    n_calibration: counts.calibration,
    n_test: counts.test,
  });
});
