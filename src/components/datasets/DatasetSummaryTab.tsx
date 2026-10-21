import { Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { AsyncOperationProgressCard } from "@/components/async/AsyncOperationProgressCard";
import {
  analyzeDatasetOnDemand,
  getDatasetSummary,
  type DatasetOrigin,
} from "@/lib/api/datasets.functions";

const MARK_FIELD_DATALIST_ID = "dataset-summary-mark-fields";

type MarkForm = {
  firstMarkField: string;
  secondMarkField: string;
  firstMarkTimeField: string;
  secondMarkTimeField: string;
  // Comma-separated in the UI (e.g. "risk, risk-suspected") - split into
  // positive_values before hitting the API.
  positiveValues: string;
};

const EMPTY_MARK_FORM: MarkForm = {
  firstMarkField: "",
  secondMarkField: "",
  firstMarkTimeField: "",
  secondMarkTimeField: "",
  positiveValues: "",
};

function splitPositiveValues(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

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
  const [markForm, setMarkForm] = useState<MarkForm>(EMPTY_MARK_FORM);
  const [markingOperationId, setMarkingOperationId] = useState<string | null>(null);
  const [markingOperationError, setMarkingOperationError] = useState<string | null>(null);

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

  // Separate from summaryQuery: this hits the same GET /summary endpoint
  // but with the 5 mark-field params, and only the analyst explicitly asks
  // for it (button click) - it shouldn't run on every auto-refresh tick or
  // block the always-on distributions above.
  const markingMutation = useMutation({
    mutationFn: (form: MarkForm) =>
      getDatasetSummary({
        data: {
          name: datasetName,
          first_mark_field: form.firstMarkField,
          second_mark_field: form.secondMarkField,
          first_mark_time_field: form.firstMarkTimeField,
          second_mark_time_field: form.secondMarkTimeField,
          positive_values: splitPositiveValues(form.positiveValues),
        },
      }),
    onMutate: () => {
      setMarkingOperationId(null);
      setMarkingOperationError(null);
    },
    onSuccess: (result) => {
      if ("async_operation_id" in result) {
        setMarkingOperationId(result.async_operation_id);
      }
    },
  });

  const markFormComplete =
    markForm.firstMarkField.trim().length > 0 &&
    markForm.secondMarkField.trim().length > 0 &&
    markForm.firstMarkTimeField.trim().length > 0 &&
    markForm.secondMarkTimeField.trim().length > 0 &&
    splitPositiveValues(markForm.positiveValues).length > 0;
  const mutationMarkingResult =
    markingMutation.data && !("async_operation_id" in markingMutation.data)
      ? markingMutation.data.fraud_marking_analysis
      : null;
  const markingInProgress = markingMutation.isPending || markingOperationId !== null;

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
  const markingResult = mutationMarkingResult ?? s.fraud_marking_analysis;

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

      {s.total_rows > 0 && (
        <div className="border border-border rounded-lg p-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              Falsos positivos y maduración del fraude
            </p>
            <p className="text-[12px] text-text-secondary mt-1">
              Compara la primera marca de una fila contra la segunda (final/confirmada) para contar
              falsos positivos, falsos negativos y filas correctamente marcadas, y mide cuánto tardó
              cada fila en madurar de la primera a la segunda marca. Los 5 campos son obligatorios
              en conjunto. Si un caso pasa de una marca positiva a otra (ej. "risk-suspected" →
              "risk") no cuenta como falso positivo/negativo — solo es una escalación dentro de la
              misma clase positiva, no una remarcación.
            </p>
          </div>

          {!markingResult && (
            <>
              <datalist id={MARK_FIELD_DATALIST_ID}>
                {s.available_fields.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Campo de la primera marca
                  </span>
                  <input
                    type="text"
                    list={MARK_FIELD_DATALIST_ID}
                    value={markForm.firstMarkField}
                    onChange={(e) => setMarkForm((f) => ({ ...f, firstMarkField: e.target.value }))}
                    placeholder="ej. razon_marcacion"
                    className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Campo de la segunda marca
                  </span>
                  <input
                    type="text"
                    list={MARK_FIELD_DATALIST_ID}
                    value={markForm.secondMarkField}
                    onChange={(e) =>
                      setMarkForm((f) => ({ ...f, secondMarkField: e.target.value }))
                    }
                    placeholder="ej. marcacion_final"
                    className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Campo de fecha/hora de la primera marca
                  </span>
                  <input
                    type="text"
                    list={MARK_FIELD_DATALIST_ID}
                    value={markForm.firstMarkTimeField}
                    onChange={(e) =>
                      setMarkForm((f) => ({ ...f, firstMarkTimeField: e.target.value }))
                    }
                    placeholder="ej. fecha_primer_marcacion"
                    className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Campo de fecha/hora de la segunda marca
                  </span>
                  <input
                    type="text"
                    list={MARK_FIELD_DATALIST_ID}
                    value={markForm.secondMarkTimeField}
                    onChange={(e) =>
                      setMarkForm((f) => ({ ...f, secondMarkTimeField: e.target.value }))
                    }
                    placeholder="ej. fecha_ultima_marcacion"
                    className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
                  />
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Valores positivos (significan "marcado como fraude", separados por coma)
                  </span>
                  <input
                    type="text"
                    value={markForm.positiveValues}
                    onChange={(e) => setMarkForm((f) => ({ ...f, positiveValues: e.target.value }))}
                    placeholder="ej. risk, risk-suspected"
                    className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 font-mono"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => markingMutation.mutate(markForm)}
                disabled={!markFormComplete || markingInProgress}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white bg-primary rounded-md px-3 py-1.5 disabled:opacity-40"
              >
                {markingInProgress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Analizar
              </button>

              {markingMutation.isError && (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  No se pudo calcular el perfil. El dataset permanece disponible; inténtalo de nuevo
                  o revisa los campos seleccionados.
                </div>
              )}
            </>
          )}

          {markingOperationError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              El análisis no pudo completarse: {markingOperationError}
            </div>
          )}

          {markingOperationId && (
            <AsyncOperationProgressCard
              operationId={markingOperationId}
              title="Análisis de marcación"
              onCompleted={() => {
                setMarkingOperationId(null);
                markingMutation.mutate(markForm);
              }}
              onFailed={(error) => {
                setMarkingOperationId(null);
                setMarkingOperationError(
                  error ?? "Error desconocido del proceso en segundo plano.",
                );
              }}
            />
          )}

          {markingResult && (
            <div className="space-y-3 pt-1">
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success">
                Resultado almacenado para esta combinación de campos. Se reutilizará hasta que
                cambies los valores de análisis.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="border border-border rounded-lg p-2.5">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Falsos positivos
                  </p>
                  <p className="text-[16px] font-semibold text-danger tabular-nums">
                    {markingResult.false_positives}
                  </p>
                </div>
                <div className="border border-border rounded-lg p-2.5">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Falsos negativos
                  </p>
                  <p className="text-[16px] font-semibold text-danger tabular-nums">
                    {markingResult.false_negatives}
                  </p>
                </div>
                <div className="border border-border rounded-lg p-2.5">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Correctamente marcadas
                  </p>
                  <p className="text-[16px] font-semibold text-success tabular-nums">
                    {markingResult.properly_marked}
                  </p>
                </div>
                <div className="border border-border rounded-lg p-2.5">
                  <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                    Evaluadas / omitidas
                  </p>
                  <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                    {markingResult.evaluated_rows} / {markingResult.skipped_rows}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
                  Perfil de maduración del fraude (días entre 1ª y 2ª marca, n=
                  {markingResult.maturation.sample_size})
                </p>
                {markingResult.maturation.sample_size === 0 ? (
                  <p className="text-[12px] text-text-secondary">
                    Ninguna fila tuvo ambas fechas de marca parseables.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                        Promedio
                      </p>
                      <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                        {markingResult.maturation.avg_days} días
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                        Mínimo
                      </p>
                      <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                        {markingResult.maturation.min_days} días
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-2.5">
                      <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                        Máximo
                      </p>
                      <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                        {markingResult.maturation.max_days} días
                      </p>
                    </div>
                    {[
                      ["P50", markingResult.maturation.p50_days],
                      ["P75", markingResult.maturation.p75_days],
                      ["P90", markingResult.maturation.p90_days],
                      ["P95", markingResult.maturation.p95_days],
                      ["P98", markingResult.maturation.p98_days],
                      ["P99", markingResult.maturation.p99_days],
                    ].map(([label, value]) => (
                      <div key={label} className="border border-border rounded-lg p-2.5">
                        <p className="text-[10px] text-text-secondary uppercase tracking-wider">
                          {label}
                        </p>
                        <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                          {value} días
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
