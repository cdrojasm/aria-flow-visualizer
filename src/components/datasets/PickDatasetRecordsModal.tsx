import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import { SideDrawer } from "@/components/ui/side-drawer";
import { PaginationFooter } from "@/components/ui/PaginationFooter";
import { appendDatasetRows, getDatasetRows, getDatasets } from "@/lib/api/datasets.functions";

const PAGE_SIZE = 25;

/* ─── "Elegir de otro dataset" (spreadsheet-style pick) ─────────────────
   The 4th ingestion mode from the user's brief: browse an existing
   dataset's rows, search/select specific records, add exactly those to
   the target dataset. Distinct from DatasetRowsTab's "Agregar filas" (raw
   JSON paste of brand-new rows) - this reuses real rows instead of typing
   them. Search is client-side over the currently loaded page only: the
   backend's GET /datasets/{name}/rows has no field filter yet (see
   DATASETS_LIBRARY_DESIGN.md §6.5), so this is a look-at-a-page-at-a-time
   tool, not a full-dataset search - fine at today's dataset sizes, called
   out via the hint text below so it doesn't read as a bug. */

export function PickDatasetRecordsModal({
  targetName,
  open,
  onClose,
}: {
  targetName: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [sourceName, setSourceName] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, Record<string, unknown>>>(new Map());

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const sourceOptions = (datasetsQuery.data ?? []).filter((d) => d.name !== targetName);

  const rowsQuery = useQuery({
    queryKey: ["datasetRows", sourceName, page],
    queryFn: () =>
      getDatasetRows({
        data: { name: sourceName, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
      }),
    enabled: !!sourceName,
  });

  const columns = useMemo(() => {
    const rows = rowsQuery.data?.rows ?? [];
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [rowsQuery.data]);

  const filteredRows = useMemo(() => {
    const rows = rowsQuery.data?.rows ?? [];
    if (!search.trim()) return rows.map((r, i) => ({ row: r, key: (page - 1) * PAGE_SIZE + i }));
    const needle = search.trim().toLowerCase();
    return rows
      .map((r, i) => ({ row: r, key: (page - 1) * PAGE_SIZE + i }))
      .filter(({ row }) =>
        Object.values(row).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(needle),
        ),
      );
  }, [rowsQuery.data, search, page]);

  const total = rowsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const appendMutation = useMutation({
    mutationFn: () =>
      appendDatasetRows({ data: { name: targetName, rows: Array.from(selected.values()) } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasetRows", targetName] });
      queryClient.invalidateQueries({ queryKey: ["datasetSummary", targetName] });
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      reset();
      onClose();
    },
  });

  const reset = () => {
    setSourceName("");
    setPage(1);
    setSearch("");
    setSelected(new Map());
  };

  function toggleRow(key: number, row: Record<string, unknown>) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, row);
      return next;
    });
  }

  return (
    <SideDrawer
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      size="xl"
      title="Elegir registros de otro dataset"
      description={
        <>Busca y selecciona filas de un dataset existente para agregarlas a "{targetName}".</>
      }
      footer={
        <>
          <span className="text-[12px] text-text-secondary">
            {selected.size} fila{selected.size !== 1 ? "s" : ""} seleccionada
            {selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className="px-3 py-2 rounded-md text-[13px] text-text-secondary hover:text-text-primary"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || appendMutation.isPending}
              onClick={() => appendMutation.mutate()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
            >
              {appendMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Agregar seleccionadas a "{targetName}"
            </button>
          </div>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <select
          value={sourceName}
          onChange={(e) => {
            setSourceName(e.target.value);
            setPage(1);
            setSelected(new Map());
          }}
          className="flex-1 h-9 rounded-md border border-border px-3 text-[13px] bg-background"
        >
          <option value="">Selecciona un dataset fuente…</option>
          {sourceOptions.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} ({d.row_count} filas)
            </option>
          ))}
        </select>
        {sourceName && (
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en esta página…"
              className="w-full h-9 rounded-md border border-border pl-8 pr-3 text-[13px] focus:outline-none focus:border-primary"
            />
          </div>
        )}
      </div>
      {sourceName && (
        <p className="text-[11px] text-text-secondary -mt-2">
          La búsqueda filtra solo la página cargada (25 filas). Cambia de página para revisar más.
        </p>
      )}

      {!sourceName && (
        <p className="text-[12px] text-text-secondary py-6 text-center">
          Elige un dataset fuente para empezar a buscar registros.
        </p>
      )}

      {sourceName && rowsQuery.isLoading && (
        <p className="text-[13px] text-text-secondary">Cargando filas…</p>
      )}
      {sourceName && rowsQuery.isError && (
        <p className="text-[13px] text-danger">No se pudieron cargar las filas del dataset.</p>
      )}

      {sourceName && rowsQuery.data && (
        <div className="border border-border rounded-lg overflow-x-auto min-w-0">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-text-secondary border-b border-border bg-surface">
                <th className="px-3 py-2 w-8"></th>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-6 text-center text-text-secondary"
                  >
                    Sin coincidencias en esta página.
                  </td>
                </tr>
              )}
              {filteredRows.map(({ row, key }) => (
                <tr
                  key={key}
                  onClick={() => toggleRow(key, row)}
                  className={`border-b border-border last:border-0 cursor-pointer ${selected.has(key) ? "bg-primary/5" : "hover:bg-surface"}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleRow(key, row)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 whitespace-nowrap text-text-primary">
                      {row[c] === undefined || row[c] === null ? "—" : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationFooter
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => {
              setPage(p);
              setSearch("");
            }}
            itemLabel="fila"
          />
        </div>
      )}

      {appendMutation.isError && (
        <p className="text-[12px] text-danger">{(appendMutation.error as Error).message}</p>
      )}
    </SideDrawer>
  );
}
