import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { startAlertTest, type AlertTestResponse } from "@/lib/api/alerts.functions";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";
import type { AsyncOperationStatus } from "@/lib/api/asyncOperations.functions";

/* ─── Formulario strategy: "alerta preformada por formulario" ────────────
   Dispatches one user-authored event payload straight into the real 7-step
   pipeline via POST /api/v0/alerts/test, then polls the resulting
   AsyncOperationRecord in place (useAsyncOperation - same polling contract
   used by models.tsx/DatasetSummaryTab). There is no dedicated result page
   for a single test alert (alerta.$id.tsx is unrelated mock data - confirmed
   by reading it), so everything renders inline in this tab and the admin
   closes the modal themselves when done. */

// Realistic sample payload reusing actual field names/values from
// src/lib/sampleDataset.ts's CSV row (that module doesn't export its row,
// so this is a small, deliberately-limited copy - not a fictional shape).
const SAMPLE_EVENT_PAYLOAD = {
  eventtype: "paymentRT",
  channel: "GL",
  integrationpoint: "SMGG0243239 - paymentsCreateRequestSendTransferV0",
  biocatch_score: 258,
  Model_score: 0.27087,
  amount_value: 122000,
  fecha_transaccion: "2026-05-02 14:47:35.000",
  deviceid: "30956ed2f6ffeaaf",
  eventid: "8ca60ead-11d2-4ea2-b538-43aa01d754c3",
  triggered_rules: "[PARTY - dg_breb_lista_negra_cedula, CUSTOMER - dg_breb_lista_negra]",
  customerid: "10222844",
  transactionid: "1.02228440013013E+033",
  tipo_documento: "CC",
  numero_documento: "1000000475",
  nombre_razon_social: "Óscar Zambrano",
  ciudad: "Medellín",
  correo_1: "oscar_zambrano.000475@example.test",
  celular: "573000000475",
};

const STATUS_STYLE: Record<AsyncOperationStatus, string> = {
  PENDING: "text-warning",
  DISPATCHED: "text-primary",
  RUNNING: "text-primary",
  SUCCEEDED: "text-success",
  FAILED: "text-danger",
};

function AlertTestStatus({
  operationId,
  dispatch,
}: {
  operationId: string;
  dispatch: AlertTestResponse;
}) {
  const operationQuery = useAsyncOperation(operationId);
  const operation = operationQuery.data;
  const status = operation?.status ?? "PENDING";
  const done = status === "SUCCEEDED";
  const failed = status === "FAILED";

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="font-medium text-text-primary">
          Alerta {dispatch.alert_id} · caso {dispatch.workflow_execution_id}
        </span>
        <span className={`inline-flex items-center gap-1.5 font-semibold ${STATUS_STYLE[status]}`}>
          {failed ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : done ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )}
          {status}
        </span>
      </div>
      {!done && !failed && (
        <p className="text-[11px] text-text-secondary">
          El pipeline de 7 pasos se está ejecutando en segundo plano…
        </p>
      )}
      {failed && (
        <p className="text-[12px] text-danger bg-danger/5 border border-danger/20 rounded-md px-3 py-2">
          {operation?.error ?? "La ejecución falló."}
        </p>
      )}
      {done && operation?.result && (
        <div>
          <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1">
            Resultado
          </p>
          <pre className="text-[11px] bg-background rounded-md p-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
            {JSON.stringify(operation.result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Parses the textarea content into a plain object, or an error message when
// it isn't valid/isn't an object - null/null means "empty, nothing to show".
function parseEvent(text: string): { value: Record<string, unknown> | null; error: string | null } {
  if (!text.trim()) return { value: null, error: null };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        value: null,
        error: "El payload debe ser un objeto JSON (no un arreglo ni un valor suelto).",
      };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (err) {
    return { value: null, error: (err as Error).message };
  }
}

export function FormularioTestForm() {
  const [eventJson, setEventJson] = useState("");

  const startMutation = useMutation({
    mutationFn: (event: Record<string, unknown>) => startAlertTest({ data: { event } }),
  });

  const { value: parsedEvent, error: parseError } = useMemo(
    () => parseEvent(eventJson),
    [eventJson],
  );
  const canSubmit = !!parsedEvent && !startMutation.isPending;

  function handleLoadSample() {
    setEventJson(JSON.stringify(SAMPLE_EVENT_PAYLOAD, null, 2));
  }

  function handleReset() {
    startMutation.reset();
    setEventJson("");
  }

  function handleSubmit() {
    if (parsedEvent) startMutation.mutate(parsedEvent);
  }

  return (
    <div className="space-y-4">
      {!startMutation.data && (
        <>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-[11px] text-text-secondary">Payload del evento (JSON)</label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <Sparkles className="h-3 w-3" /> Cargar ejemplo
              </button>
            </div>
            <textarea
              value={eventJson}
              onChange={(e) => setEventJson(e.target.value)}
              placeholder='{"eventtype": "paymentRT", "amount_value": 122000, ...}'
              rows={14}
              spellCheck={false}
              className="w-full rounded-md border border-border px-3 py-2 text-[12px] font-mono bg-background"
            />
            <p className="text-[10px] text-text-secondary mt-1">
              Se envía tal cual como <code>AlertRecord.payload</code> - no hay un esquema fijo,
              cualquier objeto JSON es válido.
            </p>
            {parseError && (
              <p className="text-[11px] text-danger mt-1 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> JSON inválido: {parseError}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Enviar al pipeline
            </button>
            {startMutation.isError && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                {(startMutation.error as Error).message}
              </span>
            )}
          </div>
        </>
      )}

      {startMutation.data && (
        <>
          <AlertTestStatus
            operationId={startMutation.data.async_operation_id}
            dispatch={startMutation.data}
          />
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-md text-[12px] text-text-secondary hover:bg-surface"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Probar otro evento
            </button>
          </div>
        </>
      )}
    </div>
  );
}
