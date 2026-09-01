import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { deleteDataset, getDatasetSummary } from "@/lib/api/testing.functions";

/* ─── Dataset detail, extracted from testing/index.tsx (Phase A) ────────
   Was an inline <section> competing with "Iniciar prueba" for visual
   protagonism on the page - now a modal. `open` is its own state, separate
   from the parent's selectedDataset (which the "Iniciar prueba" flow also
   needs) - closing this modal must not clear that selection, only a "Ver
   detalle" button (shown once a dataset is picked) opens it. Self-
   contained: owns its own query, delete mutation, and polling - nothing
   here is read by the parent except via onDeleted. */

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

export function DatasetDetailModal({
  datasetName,
  open,
  onClose,
  onDeleted,
}: {
  datasetName: string | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const datasetSummaryQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName! } }),
    enabled: !!datasetName,
  });

  const deleteDatasetMutation = useMutation({
    mutationFn: (name: string) => deleteDataset({ data: { name } }),
    onSuccess: (_res, name) => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      queryClient.removeQueries({ queryKey: ["datasetSummary", name] });
      onClose();
      onDeleted?.();
    },
  });

  function handleDeleteDataset() {
    if (!datasetName) return;
    const confirmed = window.confirm(
      `¿Borrar el dataset "${datasetName}" y sus datos de análisis? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    deleteDatasetMutation.mutate(datasetName);
  }

  const isDatasetProcessing =
    datasetSummaryQuery.data?.status === "PENDING" ||
    datasetSummaryQuery.data?.status === "PROCESSING";
  const { lastRefresh: lastDatasetRefresh } = useAutoRefresh(isDatasetProcessing ? 3000 : 60000);

  useEffect(() => {
    if (datasetName) datasetSummaryQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDatasetRefresh, datasetName]);

  function toggleFieldExpanded(field: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset: {datasetName}</DialogTitle>
          <DialogDescription>Totales y distribución de campos del dataset seleccionado.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {datasetSummaryQuery.data && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                  DATASET_STATUS_STYLE[datasetSummaryQuery.data.status]
                }`}
              >
                {datasetSummaryQuery.data.status}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDeleteDataset}
            disabled={deleteDatasetMutation.isPending}
            title="Borrar dataset"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-danger hover:underline disabled:opacity-40"
          >
            {deleteDatasetMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Borrar dataset
          </button>
        </div>

        {deleteDatasetMutation.isError && (
          <p className="text-[12px] text-danger">
            {(deleteDatasetMutation.error as Error).message}
          </p>
        )}

        {datasetSummaryQuery.isLoading && (
          <p className="text-[13px] text-text-secondary">Cargando resumen…</p>
        )}
        {datasetSummaryQuery.isError && (
          <p className="text-[13px] text-danger">No se pudo cargar el resumen del dataset.</p>
        )}

        {datasetSummaryQuery.data && isDatasetProcessing && (
          <p className="text-[13px] text-text-secondary flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Analizando dataset…
          </p>
        )}

        {datasetSummaryQuery.data?.status === "FAILED" && (
          <p className="text-[13px] text-danger">
            {datasetSummaryQuery.data.error ?? "El análisis del dataset falló."}
          </p>
        )}

        {datasetSummaryQuery.data?.status === "READY" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border border-border rounded-lg p-3">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Total de muestras
                </p>
                <p className="text-[18px] font-semibold text-text-primary tabular-nums">
                  {datasetSummaryQuery.data.total_rows}
                </p>
              </div>
              <div className="border border-border rounded-lg p-3 col-span-2 md:col-span-3">
                <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                  Última actualización
                </p>
                <p className="text-[13px] text-text-primary">
                  {datasetSummaryQuery.data.updated_at
                    ? new Date(datasetSummaryQuery.data.updated_at).toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(datasetSummaryQuery.data.field_distributions).map(
                ([field, values]) => {
                  const isLong = values.length > FIELD_VALUES_COLLAPSE_THRESHOLD;
                  const isExpanded = expandedFields.has(field);
                  return (
                    <div key={field} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                          {DATASET_FIELD_LABELS[field] ?? field}
                        </p>
                        {MULTI_VALUE_FIELDS.has(field) && (
                          <span className="text-[9px] text-text-secondary shrink-0">
                            multi-valor
                          </span>
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
                },
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
