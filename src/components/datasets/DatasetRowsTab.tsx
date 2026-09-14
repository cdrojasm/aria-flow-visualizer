import { Braces, Download, ListPlus, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { useHiddenColumns } from "@/components/ColumnVisibilityMenu";
import { DatasetColumnVisibilityMenu } from "./DatasetColumnVisibilityMenu";
import {
  appendDatasetRows,
  downloadDatasetTemplate,
  getDatasetRows,
  type DatasetRowsResponse,
} from "@/lib/api/datasets.functions";
import { truncateCellValue } from "@/lib/tableCell";
import { PickDatasetRecordsModal } from "./PickDatasetRecordsModal";
import { RowJsonModal } from "./RowJsonModal";

const PAGE_SIZE = 25;

export function DatasetRowsTab({ datasetName }: { datasetName: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  // Persists per dataset (localStorage, see useHiddenColumns) - same hook
  // Histórico de fraude/Cola use, keyed by dataset name since each dataset
  // has a different column set.
  const { hidden: hiddenColumns, toggle: toggleColumn } = useHiddenColumns<string>(
    `datasetRows.${datasetName}`,
  );
  const [rowsJson, setRowsJson] = useState('[\n  {\n    "campo": "valor"\n  }\n]');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [jsonRow, setJsonRow] = useState<Record<string, unknown> | null>(null);

  const rowsQuery = useQuery({
    queryKey: ["datasetRows", datasetName, page],
    queryFn: () =>
      getDatasetRows({
        data: { name: datasetName, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      }),
    placeholderData: (prev: DatasetRowsResponse | undefined) => prev,
  });

  const appendMutation = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) =>
      appendDatasetRows({ data: { name: datasetName, rows } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasetRows", datasetName] });
      queryClient.invalidateQueries({ queryKey: ["datasetSummary", datasetName] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setAddOpen(false);
      setRowsJson('[\n  {\n    "campo": "valor"\n  }\n]');
    },
  });

  const columns = useMemo(() => {
    const rows = rowsQuery.data?.rows ?? [];
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [rowsQuery.data]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c)),
    [columns, hiddenColumns],
  );

  const total = rowsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function submitAppend() {
    setJsonError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rowsJson);
    } catch {
      setJsonError("JSON inválido.");
      return;
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((r) => typeof r === "object" && r !== null)
    ) {
      setJsonError("Debe ser un array con al menos un objeto ({ campo: valor }).");
      return;
    }
    appendMutation.mutate(parsed as Record<string, unknown>[]);
  }

  async function handleDownloadTemplate() {
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadDatasetTemplate(datasetName);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-text-secondary">{total} filas totales.</p>
        <div className="flex items-center gap-2">
          {columns.length > 0 && (
            <DatasetColumnVisibilityMenu
              columns={columns}
              hidden={hiddenColumns}
              onToggle={toggleColumn}
            />
          )}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={downloading}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-40"
            title="Descargar plantilla CSV (encabezados del dataset)"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Plantilla CSV
          </button>
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <ListPlus className="h-3.5 w-3.5" /> Elegir de otro dataset
          </button>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar filas (JSON)
          </button>
        </div>
      </div>

      {downloadError && <p className="text-[12px] text-danger">{downloadError}</p>}

      {addOpen && (
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-text-secondary">
            Pega un array JSON de objetos (una fila por objeto, claves = columnas). Usa la plantilla
            CSV como referencia de nombres de columna.
          </p>
          <textarea
            value={rowsJson}
            onChange={(e) => setRowsJson(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border px-3 py-2 text-[12px] font-mono focus:outline-none focus:border-primary resize-y"
          />
          {jsonError && <p className="text-[12px] text-danger">{jsonError}</p>}
          {appendMutation.isError && (
            <p className="text-[12px] text-danger">{(appendMutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-3 py-1.5 rounded-md text-[12px] text-text-secondary hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitAppend}
              disabled={appendMutation.isPending}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-white disabled:opacity-50"
            >
              {appendMutation.isPending ? "Agregando…" : "Agregar filas"}
            </button>
          </div>
        </div>
      )}

      {rowsQuery.isLoading && <p className="text-[13px] text-text-secondary">Cargando filas…</p>}
      {rowsQuery.isError && (
        <p className="text-[13px] text-danger">No se pudieron cargar las filas del dataset.</p>
      )}

      {rowsQuery.data && (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Bounded, independently-scrolling table body (sticky header)
              instead of letting the table grow the whole tab - keeps the
              toolbar above (Columnas/Plantilla/Elegir de otro dataset) and
              the pagination footer below always in view without relying on
              the outer modal's own scroll. */}
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-text-secondary">
                  <th className="sticky top-0 z-10 px-3 py-2 font-medium bg-surface border-b border-border w-8" />
                  {visibleColumns.map((c) => (
                    <th
                      key={c}
                      className="sticky top-0 z-10 px-3 py-2 font-medium whitespace-nowrap bg-surface border-b border-border"
                    >
                      {c}
                    </th>
                  ))}
                  {visibleColumns.length === 0 && (
                    <th className="sticky top-0 z-10 px-3 py-2 font-medium bg-surface border-b border-border">
                      —
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rowsQuery.data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={Math.max(1, visibleColumns.length) + 1}
                      className="px-3 py-6 text-center text-text-secondary"
                    >
                      Sin filas todavía.
                    </td>
                  </tr>
                )}
                {rowsQuery.data.rows.length > 0 && visibleColumns.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-text-secondary">
                      Todas las columnas están ocultas.
                    </td>
                  </tr>
                )}
                {rowsQuery.data.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setJsonRow(row)}
                        title="Ver fila como JSON"
                        className="text-text-secondary hover:text-primary"
                      >
                        <Braces className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    {visibleColumns.map((c) => {
                      const cell = truncateCellValue(row[c]);
                      return (
                        <td
                          key={c}
                          className="px-3 py-2 whitespace-nowrap text-text-primary"
                          title={cell.truncated ? cell.full : undefined}
                        >
                          {cell.display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationFooter
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="fila"
          />
        </div>
      )}

      <PickDatasetRecordsModal
        targetName={datasetName}
        open={pickOpen}
        onClose={() => setPickOpen(false)}
      />

      <RowJsonModal row={jsonRow} onClose={() => setJsonRow(null)} />
    </div>
  );
}
