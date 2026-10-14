import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type Dataset = { name: string; row_count: number };

type DatasetApiOptions = { initialDatasets?: Dataset[] };

async function mockDatasetApi(page: Page, options: DatasetApiOptions = {}) {
  await page.route("**/health", (route) => route.fulfill({ status: 200, body: "ok" }));
  const datasets: Dataset[] = [...(options.initialDatasets ?? [])];
  const rowsByName = new Map<string, Record<string, unknown>[]>();
  const mappings = new Map<string, Record<string, string>>();
  const summaries = new Map<string, unknown>();
  const audit = {
    uploadAttempts: 0,
    uploadPolls: 0,
    mappingWrites: 0,
    templateDownloads: 0,
    deletePolls: 0,
  };
  const deleteOperationId = "delete-empty-operation";
  let deleteOperationPolls = 0;

  if (options.initialDatasets) {
    for (const dataset of options.initialDatasets) {
      rowsByName.set(dataset.name, [{ cliente_id: "KEEP-001", resultado: "fraude", monto: 500 }]);
      summaries.set(dataset.name, {
        dataset_name: dataset.name,
        status: "READY",
        total_rows: dataset.row_count,
        field_distributions: {},
        available_fields: ["cliente_id", "resultado", "monto"],
        uploaded_at: "2026-10-14T12:00:00Z",
        updated_at: null,
        error: null,
        origin: "UPLOADED",
        source_dataset_names: [],
        extraction_filter: null,
        fraud_marking_analysis: null,
      });
    }
  }

  await page.route("**/api/v0/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/api/v0/auth/me")
      return json({ name: "E2E Manager", email: "manager@example.com", role: "manager" });
    if (path === "/api/v0/metrics/overview") return json({ distributions: {} });
    if (path === "/api/v0/operational-settings")
      return json({ amountTiers: [], channelTargets: {}, updated_at: null });
    if (path === "/api/v0/operational-settings/history") return json([]);
    if (path === "/api/v0/datasets" && request.method() === "GET") return json(datasets);
    if (path === "/api/v0/datasets" && request.method() === "POST") {
      audit.uploadAttempts += 1;
      const body = request.postDataBuffer()?.toString("latin1") ?? "";
      const filename = /filename="([^"]+)"/.exec(body)?.[1] ?? "";
      if (!filename.toLowerCase().endsWith(".csv")) return json({ detail: "CSV requerido" }, 400);
      const name = filename.replace(/\.csv$/i, "");
      if (datasets.some((dataset) => dataset.name === name))
        return json({ detail: "duplicado" }, 409);
      if (!body.includes("cliente_id") || !body.includes("resultado"))
        return json({ detail: "Columnas incompatibles" }, 422);
      const rows = [
        { cliente_id: "C-001", resultado: "fraude", monto: 1250 },
        { cliente_id: "C-002", resultado: "legitimo", monto: 300 },
      ];
      datasets.push({ name, row_count: rows.length });
      rowsByName.set(name, rows);
      summaries.set(name, {
        dataset_name: name,
        status: "READY",
        total_rows: rows.length,
        field_distributions: { resultado: [{ value: "fraude", count: 1, percentage: 50 }] },
        available_fields: ["cliente_id", "resultado", "monto"],
        uploaded_at: "2026-10-14T12:00:00Z",
        updated_at: null,
        error: null,
        origin: "UPLOADED",
        source_dataset_names: [],
        extraction_filter: null,
        fraud_marking_analysis: null,
      });
      return json({ name, status: "PENDING", async_operation_id: "upload-operation" }, 202);
    }
    if (path === "/api/v0/datasets/empty" && request.method() === "POST") {
      const input = request.postDataJSON() as { name: string; fields: string[] };
      datasets.push({ name: input.name, row_count: 0 });
      rowsByName.set(input.name, []);
      summaries.set(input.name, {
        dataset_name: input.name,
        status: "READY",
        total_rows: 0,
        field_distributions: {},
        available_fields: input.fields,
        uploaded_at: null,
        updated_at: null,
        error: null,
        origin: "EMPTY",
        source_dataset_names: [],
        extraction_filter: null,
        fraud_marking_analysis: null,
      });
      return json({ name: input.name, status: "READY", async_operation_id: null });
    }
    if (path === "/api/v0/datasets/extract" && request.method() === "POST") {
      const input = request.postDataJSON() as {
        source_names: string[];
        filters: Record<string, string>;
        percentage: number;
        target_name: string;
      };
      const sourceRows = input.source_names.flatMap((name) => rowsByName.get(name) ?? []);
      const extracted = sourceRows.filter((row) =>
        Object.entries(input.filters).every(([field, value]) => String(row[field]) === value),
      );
      datasets.push({ name: input.target_name, row_count: extracted.length });
      rowsByName.set(input.target_name, extracted);
      summaries.set(input.target_name, {
        dataset_name: input.target_name,
        status: "READY",
        total_rows: extracted.length,
        field_distributions: {},
        available_fields: ["cliente_id", "resultado", "monto"],
        uploaded_at: null,
        updated_at: null,
        error: null,
        origin: "EXTRACTED",
        source_dataset_names: input.source_names,
        extraction_filter: input.filters,
        fraud_marking_analysis: null,
      });
      return json({ name: input.target_name, status: "READY" }, 201);
    }
    const match = /^\/api\/v0\/datasets\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (match) {
      const name = decodeURIComponent(match[1]);
      const resource = match[2] ?? "";
      if (resource === "summary" && request.method() === "GET")
        return json(
          summaries.get(name) ?? { detail: "not found" },
          summaries.has(name) ? 200 : 404,
        );
      if (resource === "rows" && request.method() === "GET")
        return json({
          rows: rowsByName.get(name) ?? [],
          total: (rowsByName.get(name) ?? []).length,
        });
      if (resource === "alert-field-mapping" && request.method() === "GET")
        return json({ dataset_name: name, mappings: mappings.get(name) ?? {}, updated_at: null });
      if (resource === "alert-field-mapping" && request.method() === "PUT") {
        const input = request.postDataJSON() as { mappings: Record<string, string> };
        audit.mappingWrites += 1;
        mappings.set(name, input.mappings);
        return json({
          dataset_name: name,
          mappings: input.mappings,
          updated_at: "2026-10-14T12:00:00Z",
        });
      }
      if (resource === "template" && request.method() === "GET") {
        audit.templateDownloads += 1;
        return route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          headers: { "content-disposition": `attachment; filename="${name}_template.csv"` },
          body: "cliente_id,resultado,monto\n",
        });
      }
      if (!resource && request.method() === "DELETE") {
        return json({ name, deleted: false, async_operation_id: deleteOperationId }, 202);
      }
    }
    if (path === "/api/v0/variables") return json([]);
    if (path === `/api/v0/async-operations/${deleteOperationId}`) {
      audit.deletePolls += 1;
      deleteOperationPolls += 1;
      const completed = deleteOperationPolls >= 2;
      if (completed) {
        const index = datasets.findIndex((dataset) => dataset.name === "e04_empty");
        if (index >= 0) datasets.splice(index, 1);
        rowsByName.delete("e04_empty");
        summaries.delete("e04_empty");
        mappings.delete("e04_empty");
      }
      return json({
        id: deleteOperationId,
        operation_type: "dataset_delete",
        status: completed ? "SUCCEEDED" : "RUNNING",
        payload: { dataset_name: "e04_empty" },
        result: {
          progress_pct: completed ? 100 : 50,
          stage: completed ? "done" : "removing_dataset",
        },
        error: null,
        created_at: "2026-10-14T12:00:00Z",
        updated_at: "2026-10-14T12:00:00Z",
        created_by: "e2e",
        dispatched_at: null,
        execution_backend: null,
        external_id: null,
      });
    }
    if (path === "/api/v0/async-operations/upload-operation") {
      audit.uploadPolls += 1;
      const completed = audit.uploadPolls >= 2;
      return json({
        id: "upload-operation",
        operation_type: "dataset_upload",
        status: completed ? "SUCCEEDED" : "RUNNING",
        payload: { dataset_name: "e04_fixture" },
        result: {
          progress_pct: completed ? 100 : 45,
          stage: completed ? "done" : "streaming_rows",
          processed_rows: completed ? 2 : 1,
          total_rows: 2,
        },
        error: null,
        created_at: "2026-10-14T12:00:00Z",
        updated_at: "2026-10-14T12:00:00Z",
        created_by: "e2e",
        dispatched_at: null,
        execution_backend: null,
        external_id: null,
      });
    }
    return json([]);
  });
  return audit;
}

test("E04: gestiona datasets CSV, resumen, filas, mapping, extracción, plantilla y borrado", async ({
  page,
}) => {
  const apiAudit = await mockDatasetApi(page);
  await page.addInitScript(() => {
    localStorage.setItem("aria.auth.accessToken", "e2e-token");
    localStorage.setItem(
      "aria.biblioteca.activeTab.v1",
      JSON.stringify({ activeTab: "datasets", activeKnowledgeTab: "vector-store" }),
    );
  });
  await page.goto("/biblioteca");
  await expect(page.getByRole("button", { name: "Subir CSV" })).toBeVisible();

  await page.getByRole("button", { name: "Subir CSV" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e04_fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("cliente_id,resultado,monto\nC-001,fraude,1250\nC-002,legitimo,300\n"),
  });
  await page.getByRole("button", { name: "Subir dataset" }).click();
  await expect(page.getByText("e04_fixture", { exact: true })).toBeVisible();
  await expect.poll(() => apiAudit.uploadPolls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Procesos en segundo plano")).toHaveCount(0);
  expect(apiAudit.uploadAttempts).toBe(1);

  await page.getByRole("button", { name: "Visualizar" }).click();
  await expect(page.getByText("READY", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Resumen" }).getByText("2", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Subido (CSV)")).toBeVisible();
  await page.getByRole("tab", { name: "Filas" }).click();
  await expect(page.getByRole("cell", { name: "C-001" })).toBeVisible();
  await page.getByTitle("Ver fila como JSON").first().click();
  await expect(page.getByText(/"cliente_id": "C-001"/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("tab", { name: "Mapeo de alertas" }).click();
  await page.getByRole("button", { name: "Agregar mapeo" }).click();
  await page.getByPlaceholder("ej: transaccion.monto").fill("transaccion.monto");
  await page.getByPlaceholder("ej: monto").fill("monto");
  await page.getByRole("button", { name: "Guardar mapeo" }).click();
  await expect(page.getByText("Mapeo guardado.")).toBeVisible();
  expect(apiAudit.mappingWrites).toBe(1);
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Visualizar" }).click();
  await page.getByRole("tab", { name: "Mapeo de alertas" }).click();
  await expect(page.getByPlaceholder("ej: transaccion.monto")).toHaveValue("transaccion.monto");
  await expect(page.getByPlaceholder("ej: monto")).toHaveValue("monto");
  await page.getByRole("button", { name: "Close" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTitle("Descargar plantilla CSV (solo encabezados)").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("e04_fixture_template.csv");
  expect(await readFile((await download.path())!, "utf8")).toBe("cliente_id,resultado,monto\n");
  expect(apiAudit.templateDownloads).toBe(1);

  await page.getByRole("button", { name: "Extraer / derivar" }).click();
  await page.getByRole("button", { name: "e04_fixture (2)" }).click();
  await page.getByRole("button", { name: "Agregar filtro" }).click();
  await page.getByPlaceholder("campo").fill("resultado");
  await page.getByPlaceholder("valor").fill("fraude");
  await page.getByPlaceholder("Ej: muestra_validacion_q1").fill("e04_subset");
  await page.getByRole("button", { name: "Extraer dataset" }).click();
  await expect(page.getByText("e04_subset", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "e04_subset" }).getByRole("cell").nth(1),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Visualizar" }).last().click();
  await expect(page.getByText("Extraído de otro(s) dataset(s)")).toBeVisible();
  await page.getByRole("tab", { name: "Filas" }).click();
  await expect(page.getByRole("cell", { name: "C-001" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Dataset vacío" }).click();
  await page.getByPlaceholder("Ej: casos_revision_manual").fill("e04_empty");
  const columnsInput = page.getByPlaceholder("Ej: id_transaccion");
  await columnsInput.fill("id_transaccion");
  await columnsInput.press("Enter");
  await page.getByRole("button", { name: "Crear dataset" }).click();
  await expect(page.getByText("e04_empty", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "e04_empty" }).getByRole("cell").nth(1),
  ).toHaveText("0");

  await page
    .getByTitle("Eliminar")
    .filter({ has: page.locator("svg") })
    .last()
    .click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText("e04_empty", { exact: true })).toHaveCount(0);
  await expect.poll(() => apiAudit.deletePolls).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("e04_fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("e04_subset", { exact: true })).toBeVisible();
});

test("E04: rechaza CSV incompatible sin alterar datasets existentes", async ({ page }) => {
  const existingDataset = { name: "existing_keep", row_count: 1 };
  const apiAudit = await mockDatasetApi(page, { initialDatasets: [existingDataset] });
  await page.addInitScript(() => {
    localStorage.setItem("aria.auth.accessToken", "e2e-token");
    localStorage.setItem(
      "aria.biblioteca.activeTab.v1",
      JSON.stringify({ activeTab: "datasets", activeKnowledgeTab: "vector-store" }),
    );
  });
  await page.goto("/biblioteca");
  await expect(page.getByRole("button", { name: "Subir CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Subir CSV" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e04_invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("columna_desconocida\nvalor\n"),
  });
  await page.getByRole("button", { name: "Subir dataset" }).click();
  await expect(
    page.getByText("No se pudo subir el dataset. Verifica el archivo e inténtalo nuevamente."),
  ).toBeVisible();
  await expect(page.getByText("e04_invalid", { exact: true })).toHaveCount(0);
  await expect(page.getByText("existing_keep", { exact: true })).toBeVisible();
  expect(apiAudit.uploadAttempts).toBe(1);
});
