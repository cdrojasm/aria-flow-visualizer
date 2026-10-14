import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Progress } from "@/components/ui/progress";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";

const LABELS: Record<string, string> = {
  starting: "Preparando proceso",
  queued: "En cola",
  counting_rows: "Contando filas para calcular el progreso",
  removing_dataset: "Eliminando datos y resultados asociados",
  streaming_rows: "Procesando filas de forma segura",
  scanning_rows: "Analizando marcas y tiempos",
  analysis_complete: "Finalizando análisis",
  done: "Completado",
};

export function AsyncOperationProgressCard({
  operationId,
  title,
  onCompleted,
  onFailed,
}: {
  operationId: string;
  title: string;
  onCompleted?: () => void;
  onFailed?: (error: string | null) => void;
}) {
  const operationQuery = useAsyncOperation(operationId);
  const operation = operationQuery.data;
  const result = operation?.result ?? {};
  const pct = typeof result.progress_pct === "number" ? result.progress_pct : 0;
  const stage = typeof result.stage === "string" ? result.stage : (operation?.status ?? "PENDING");
  const rows = typeof result.processed_rows === "number" ? result.processed_rows : null;
  const totalRows = typeof result.total_rows === "number" ? result.total_rows : null;
  const datasetName =
    typeof operation?.payload?.dataset_name === "string"
      ? operation.payload.dataset_name
      : null;
  const failed = operation?.status === "FAILED";
  const done = operation?.status === "SUCCEEDED";
  const notified = useRef(false);

  useEffect(() => {
    if ((done || failed) && !notified.current) {
      notified.current = true;
      if (done) onCompleted?.();
      else onFailed?.(operation?.error ?? null);
    }
  }, [done, failed, onCompleted, onFailed, operation?.error]);

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="font-medium text-text-primary">
          {title}
          {datasetName ? `: ${datasetName}` : ""}
        </span>
        <span className={failed ? "text-danger" : done ? "text-success" : "text-text-secondary"}>
          {failed ? (
            <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
          ) : done ? (
            <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
          ) : (
            <Loader2 className="inline h-3.5 w-3.5 mr-1 animate-spin" />
          )}
          {LABELS[stage] ?? stage}
        </span>
      </div>
      {!failed && <Progress value={pct} />}
      <div className="flex justify-between text-[11px] text-text-secondary">
        <span>
          {rows !== null
            ? `${rows.toLocaleString("es-CO")} de ${totalRows?.toLocaleString("es-CO") ?? "…"} filas`
            : "El proceso continúa en segundo plano"}
        </span>
        <span>{failed ? operation?.error : `${pct}%`}</span>
      </div>
    </div>
  );
}
