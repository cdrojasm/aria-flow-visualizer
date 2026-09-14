import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import {
  analyzeDatasetOnDemand,
  getDatasetSummary,
  type DatasetOrigin,
} from "@/lib/api/datasets.functions";

// Above this many columns, the "Columnas" list collapses behind a "ver
// más" toggle instead of growing the card indefinitely - row-level
// content (a couple of example records) lives in the "Filas" tab instead,
// not here, since it doesn't fit this card's space without pushing the
// modal past a reasonable height.
const COLUMNS_COLLAPSE_THRESHOLD = 10;

const DATASET_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning",
  PROCESSING: "bg-primary/10 text-primary",
  READY: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const ORIGIN_LABELS: Record<DatasetOrigin, string> = {
  UPLOADED: "Subido (CSV)",
  EMPTY: "Creado vacío",
  EXTRACTED: "Extraído de otro(s) dataset(s)",
  ALERT_CURATED: "Curado desde alertas",
};

// razon_marcacion and triggered_rules (ARIA-shaped datasets) are
// multi-value ("[A, B]") - a row can count toward several values at once,
// so their bars/percentages can add up to more than the total/100%.
const MULTI_VALUE_FIELDS = new Set(["razon_marcacion", "triggered_rules"]);

const FIELD_VALUES_COLLAPSE_THRESHOLD = 10;

export function DatasetSummaryTab({ datasetName }: { datasetName: string }) {
  const queryClient = useQueryClient();
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [columnsExpanded, setColumnsExpanded] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["datasetSummary", datasetName],
    queryFn: () => getDatasetSummary({ data: { name: datasetName } }),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeDatasetOnDemand({ data: { name: datasetName } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasetSummary", datasetName] });
    },
  });

  const isProcessing =
    summaryQuery.data?.status === "PENDING" || summaryQuery.data?.status === "PROCESSING";
  const { lastRefresh } = useAutoRefresh(isProcessing ? 3000 : 60000);

  useEffect(() => {
    summaryQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefresh]);

  function toggleFieldExpanded(field: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  if (summaryQuery.isLoading) {
    return <p className="text-[13px] text-text-secondary">Cargando resumen…</p>;
  }
  if (summaryQuery.isError) {
    return <p className="text-[13px] text-danger">No se pudo cargar el resumen del dataset.</p>;
  }
  if (!summaryQuery.data) return null;
  const s = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${DATASET_STATUS_STYLE[s.status]}`}
          >
            {s.status}
          </span>
          <span className="text-[11px] text-text-secondary">{ORIGIN_LABELS[s.origin]}</span>
        </div>
        <button
          type="button"
          onClick={() => analyzeMutation.mutate()}
          disabled={isProcessing || analyzeMutation.isPending}
          title="Volver a analizar el dataset (distribuciones, estado)"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-40"
        >
          {analyzeMutation.isPending || isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Re-analizar
        </button>
      </div>

      {analyzeMutation.isError && (
        <p className="text-[12px] text-danger">{(analyzeMutation.error as Error).message}</p>
      )}

      {isProcessing && (
        <p className="text-[13px] text-text-secondary flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analizando dataset…
        </p>
      )}

      {s.status === "FAILED" && (
        <p className="text-[13px] text-danger">{s.error ?? "El análisis del dataset falló."}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border rounded-lg p-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider">Total de filas</p>
          <p className="text-[18px] font-semibold text-text-primary tabular-nums">{s.total_rows}</p>
        </div>
        <div className="border border-border rounded-lg p-3 col-span-2 md:col-span-3">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider">
            Última actualización
          </p>
          <p className="text-[13px] text-text-primary">
            {s.updated_at ? new Date(s.updated_at).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {s.available_fields.length > 0 && (
        <div className="border border-border rounded-lg p-3 space-y-2">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider">
            Columnas ({s.available_fields.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(columnsExpanded
              ? s.available_fields
              : s.available_fields.slice(0, COLUMNS_COLLAPSE_THRESHOLD)
            ).map((f) => (
              <span
                key={f}
                className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-surface text-text-primary border border-border"
              >
                {f}
              </span>
            ))}
          </div>
          {s.available_fields.length > COLUMNS_COLLAPSE_THRESHOLD && (
            <button
              type="button"
              onClick={() => setColumnsExpanded((v) => !v)}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              {columnsExpanded
                ? "Ver menos"
                : `Ver más (${s.available_fields.length - COLUMNS_COLLAPSE_THRESHOLD} más)`}
            </button>
          )}
        </div>
      )}

      {s.origin === "EXTRACTED" && (
        <div className="border border-border rounded-lg p-3 text-[12px] space-y-1">
          <p className="text-[10px] text-text-secondary uppercase tracking-wider">
            Origen de la extracción
          </p>
          <p className="text-text-primary">Fuente: {s.source_dataset_names.join(", ") || "—"}</p>
          {s.extraction_filter && Object.keys(s.extraction_filter).length > 0 && (
            <p className="text-text-secondary">
              Filtros:{" "}
              {Object.entries(s.extraction_filter)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {s.status === "READY" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(s.field_distributions).map(([field, values]) => {
            const isLong = values.length > FIELD_VALUES_COLLAPSE_THRESHOLD;
            const isExpanded = expandedFields.has(field);
            return (
              <div key={field} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    {field}
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
      )}
    </div>
  );
}
