import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, BarChart3, Loader2, Plus, Trash2 } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { AlertFieldMappingEditor } from "@/components/biblioteca/AlertFieldMappingEditor";
import {
  deleteDataset,
  getDatasetSummary,
  getDatasets,
  uploadDataset,
  type DatasetRecord,
} from "@/lib/api/datasets.functions";

/* ─── Dataset library, Biblioteca's canonical dataset manager ────────────
   Consolidates dataset upload/delete/list that used to be duplicated
   between Modelos' ModelFormModal and Testing's NewTestRunModal /
   DatasetDetailModal - those still call the same 4 backend endpoints
   directly today, this is just the one place meant to grow into the
   central admin view. Query key stays ["datasets"], same one those other
   flows already invalidate/read, so nothing else needs to change for this
   to stay in sync.

   Same "don't load heavy child data eagerly" principle as
   WatchlistManager (which defers elements to a separate modal): status
   requires a per-dataset summary fetch, so this table shows it as "—"
   until "Ver estadísticas" is opened for that row - no N+1 eager fetch of
   every dataset's summary on page load. */

const DATASET_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  READY: "Listo",
  FAILED: "Fallido",
};

const DATASET_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning",
  PROCESSING: "bg-primary/10 text-primary",
  READY: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const DATASET_FIELD_LABELS: Record<string, string> = {
  razon_marcacion: "Razón de marcación",
  marcacion_final: "Marcación final",
  integration_point: "Punto de integración",
  tipo: "Tipo",
  triggered_rules: "Reglas activadas",
};

// razon_marcacion and triggered_rules are multi-value ("[A, B]") - a row
// can count toward several values at once, so their bars/percentages can
// add up to more than the total/100%. Flagged in the UI so that isn't read
// as a bug.
const MULTI_VALUE_FIELDS = new Set(["razon_marcacion", "triggered_rules"]);

// Above this many distinct values, a field's distribution list gets capped
// to a scrollable max height with a "ver más" toggle instead of growing the
// card indefinitely.
const FIELD_VALUES_COLLAPSE_THRESHOLD = 10;

export function DatasetLibraryManager() {
  const queryClient = useQueryClient();
  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const datasets = datasetsQuery.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["datasets"] });

  const [deletingDataset, setDeletingDataset] = useState<DatasetRecord | null>(null);
  const [statsDataset, setStatsDataset] = useState<string | null>(null);
  const [mappingDataset, setMappingDataset] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadDataset({ data: formData });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteDataset({ data: { name } }),
    onSuccess: (_res, name) => {
      invalidate();
      queryClient.removeQueries({ queryKey: ["datasetSummary", name] });
      setDeletingDataset(null);
    },
  });

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadMutation.mutate(file);
  }

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Datasets</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Archivos CSV usados para probar configuraciones (Testing) y entrenar/evaluar modelos
            (Modelos). Abre "Ver estadísticas" para inspeccionar el estado y la distribución de
            campos de un dataset.
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Cargar dataset
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelected}
          className="hidden"
        />
      </div>

      {uploadMutation.isError && (
        <p className="px-6 pt-3 text-[12px] text-danger">
          {(uploadMutation.error as Error).message}
        </p>
      )}

      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-secondary text-left border-b border-border">
            <th className="px-6 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium">Filas</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium w-72"></th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((ds) => (
            <tr
              key={ds.name}
              className="border-b border-border last:border-0 hover:bg-surface align-top"
            >
              <td className="px-6 py-3 font-medium text-text-primary">{ds.name}</td>
              <td className="px-3 py-3 font-mono text-[12px] text-text-secondary">
                {ds.row_count.toLocaleString("es-CO")}
              </td>
              <td className="px-3 py-3 text-text-secondary">—</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatsDataset(ds.name)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Ver estadísticas
                  </button>
                  <button
                    onClick={() => setMappingDataset(ds.name)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Mapeo de alertas
                  </button>
                  <button
                    onClick={() => {
                      deleteMutation.reset();
                      setDeletingDataset(ds);
                    }}
                    className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {datasetsQuery.isSuccess && datasets.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-text-secondary">
                Sin datasets en la biblioteca.
              </td>
            </tr>
          )}
          {datasetsQuery.isLoading && (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-text-secondary">
                Cargando datasets…
              </td>
            </tr>
          )}
          {datasetsQuery.isError && (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-danger">
                No se pudieron cargar los datasets.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <DatasetStatsModal datasetName={statsDataset} onClose={() => setStatsDataset(null)} />

      <AlertFieldMappingEditor
        datasetName={mappingDataset}
        open={!!mappingDataset}
        onClose={() => setMappingDataset(null)}
      />

      <ConfirmDeleteDialog
        open={!!deletingDataset}
        onOpenChange={(open) => !open && setDeletingDataset(null)}
        itemName={`dataset "${deletingDataset?.name ?? ""}"`}
        consequence="Se borran también sus datos de análisis. Las pruebas y modelos que ya lo usaron no se ven afectados, pero no podrá volver a seleccionarse."
        pending={deleteMutation.isPending}
        error={deleteMutation.isError ? (deleteMutation.error as Error).message : undefined}
        onConfirm={() => deletingDataset && deleteMutation.mutate(deletingDataset.name)}
      />
    </section>
  );
}

function DatasetStatsModal({
  datasetName,
  onClose,
}: {
  datasetName: string | null;
  onClose: () => void;
}) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const summaryQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName! } }),
    enabled: !!datasetName,
  });

  function toggleFieldExpanded(field: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <Dialog open={!!datasetName} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset: {datasetName}</DialogTitle>
          <DialogDescription>
            Totales y distribución de campos del dataset seleccionado.
          </DialogDescription>
        </DialogHeader>

        {summaryQuery.data && (
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                DATASET_STATUS_STYLE[summaryQuery.data.status]
              }`}
            >
              {DATASET_STATUS_LABELS[summaryQuery.data.status] ?? summaryQuery.data.status}
            </span>
          </div>
        )}

        {summaryQuery.isLoading && (
          <p className="text-[13px] text-text-secondary">Cargando resumen…</p>
        )}
        {summaryQuery.isError && (
          <p className="text-[13px] text-danger">No se pudo cargar el resumen del dataset.</p>
        )}

        {(summaryQuery.data?.status === "PENDING" || summaryQuery.data?.status === "PROCESSING") && (
          <p className="text-[13px] text-text-secondary flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analizando dataset…
          </p>
        )}

        {summaryQuery.data?.status === "FAILED" && (
          <p className="text-[13px] text-danger">
            {summaryQuery.data.error ?? "El análisis del dataset falló."}
          </p>
        )}

        {summaryQuery.data?.status === "READY" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-border rounded-lg p-3">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Total de muestras
                </p>
                <p className="text-[18px] font-semibold text-text-primary tabular-nums">
                  {summaryQuery.data.total_rows}
                </p>
              </div>
              <div className="border border-border rounded-lg p-3 col-span-2 md:col-span-3">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Última actualización
                </p>
                <p className="text-[13px] text-text-primary">
                  {summaryQuery.data.updated_at
                    ? new Date(summaryQuery.data.updated_at).toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(summaryQuery.data.field_distributions).map(([field, values]) => {
                const isLong = values.length > FIELD_VALUES_COLLAPSE_THRESHOLD;
                const isExpanded = expandedFields.has(field);
                return (
                  <div key={field} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                        {DATASET_FIELD_LABELS[field] ?? field}
                      </p>
                      {MULTI_VALUE_FIELDS.has(field) && (
                        <span className="text-[9px] text-text-secondary shrink-0">multi-valor</span>
                      )}
                    </div>
                    <div
                      className={`space-y-1.5 ${isLong && !isExpanded ? "max-h-48 overflow-y-auto pr-1" : ""}`}
                    >
                      {values.map((v) => (
                        <div key={v.value} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-text-primary truncate pr-2">{v.value}</span>
                            <span className="text-text-secondary tabular-nums shrink-0">
                              {v.count} ({v.percentage}%)
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${v.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => toggleFieldExpanded(field)}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        {isExpanded
                          ? "Ver menos"
                          : `Ver más (${values.length - FIELD_VALUES_COLLAPSE_THRESHOLD} más)`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
