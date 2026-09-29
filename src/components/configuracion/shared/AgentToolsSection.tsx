import { useQuery } from "@tanstack/react-query";

import { Switch } from "@/components/ui/switch";
import { type DelegatedResearchSettings, type ToolPickerFields } from "@/data/configs";
import { getModels } from "@/lib/api/models.functions";
import { AgentToolsFields, Field, VectorStoreInstancePicker } from "./FormControls";

/* ─── "Herramientas del agente" ──────────────────────────
   One component, identical in every ReAct step - Detector, Adversarial
   (detector), Clasificación, Adversarial (clasificador). Each step's copy
   is read independently by the backend (_segment_tool_kwargs /
   _run_classify_step / _run_adversarial_step in alert_review_workflow.py).

   - Herramientas: watchlist, calculadora, modelo XGBoost.
   - Investigación delegada:
     · Búsqueda en Vector Store - the agent calls it as a tool, sending the
       insights it wants investigated, up to "Máx. interacciones" times;
       every exchange is logged on the step's output. This is the only
       vector-store path (the old "Base de conocimiento" switch was the
       same thing and was merged into it).
     · Análisis de historial - runs when the agent stays inconclusive (or
       the adversarial challenges the result); the selector below scopes
       which transactions/columns it analyzes.

   XGBoost only decides in the Detector (`xgboostDecides`); everywhere
   else its output (score + SHAP) is separate evidence for the agent. */

// TransactionHistoryEntry's fields (backend
// host_service_transaction_history_port.py).
const HISTORY_COLUMNS: { value: string; label: string }[] = [
  { value: "event_time", label: "Fecha" },
  { value: "event_type", label: "Tipo de evento" },
  { value: "amount", label: "Monto" },
  { value: "status", label: "Estado" },
  { value: "channel", label: "Canal" },
  { value: "counterparty", label: "Contraparte" },
  { value: "account_id", label: "Cuenta" },
  { value: "integration_point", label: "Punto de integración" },
  { value: "alerts", label: "Alertas" },
  { value: "event_id", label: "ID de evento" },
];

const inputClass =
  "w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50";

export function AgentToolsSection<T extends ToolPickerFields>({
  value,
  onChange,
  pool,
  description,
  xgboostDecides = false,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  pool: string[];
  description: string;
  xgboostDecides?: boolean;
  disabled?: boolean;
}) {
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const readyModels = (modelsQuery.data ?? []).filter((m) => m.status === "READY");

  const patch = (next: Partial<ToolPickerFields>) => onChange({ ...value, ...next });
  const research = value.delegatedResearch;
  const patchVectorStore = (next: Partial<DelegatedResearchSettings["vectorStore"]>) =>
    patch({
      delegatedResearch: { ...research, vectorStore: { ...research.vectorStore, ...next } },
    });
  const patchHistory = (next: Partial<DelegatedResearchSettings["historyPandas"]>) =>
    patch({
      delegatedResearch: { ...research, historyPandas: { ...research.historyPandas, ...next } },
    });
  const history = research.historyPandas;

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text-primary">Herramientas del agente</h2>
        <p className="text-[12px] text-text-secondary mt-0.5">{description}</p>
      </div>
      <div className="p-6 space-y-5">
        <AgentToolsFields value={value} onChange={patch} pool={pool} disabled={disabled} />

        <div className="pt-2 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-text-primary">Modelo XGBoost</p>
              <p className="text-[12px] text-text-secondary mt-0.5">
                {xgboostDecides
                  ? "Puntúa la alerta antes del agente: por encima del umbral de fraude o por debajo de la banda de incertidumbre decide directamente; en la banda, el agente decide usando la salida del modelo como evidencia."
                  : "La salida del modelo (score y variables SHAP) se entrega al agente como evidencia separada; el agente toma la decisión."}
              </p>
            </div>
            <Switch
              checked={value.useXgboostModel}
              onCheckedChange={(checked) =>
                patch({
                  useXgboostModel: checked,
                  xgboostModelId: checked ? value.xgboostModelId : null,
                })
              }
              disabled={disabled}
            />
          </div>
          {value.useXgboostModel && (
            <>
              <Field label="Modelo" hint="Solo se listan modelos con estado Listo.">
                <select
                  value={value.xgboostModelId ?? ""}
                  onChange={(e) => patch({ xgboostModelId: e.target.value || null })}
                  disabled={disabled}
                  className={inputClass}
                >
                  <option value="">Sin modelo asignado</option>
                  {readyModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Umbral de fraude"
                  hint="Score igual o mayor a este valor se considera fraude."
                >
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={value.xgboostFraudThreshold}
                    disabled={disabled}
                    onChange={(e) => patch({ xgboostFraudThreshold: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Banda de incertidumbre"
                  hint="Score entre este valor y el umbral de fraude queda en la banda de incertidumbre. Por debajo, no fraude."
                >
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={value.xgboostUncertaintyThreshold}
                    disabled={disabled}
                    onChange={(e) => patch({ xgboostUncertaintyThreshold: Number(e.target.value) })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <p className="text-[13px] font-medium text-text-primary">SHAP</p>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Incluye en la salida del modelo las variables que más pesaron en la predicción.
                  </p>
                </div>
                <Switch
                  checked={value.xgboostShapEnabled}
                  onCheckedChange={(checked) => patch({ xgboostShapEnabled: checked })}
                  disabled={disabled}
                />
              </div>
            </>
          )}
        </div>

        <div className="pt-4 border-t-2 border-border space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">Investigación delegada</p>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Búsquedas y análisis que el agente usa para investigar; cada interacción queda
              auditada en la ejecución.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-[13px] font-medium text-text-primary">Búsqueda en Vector Store</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  El agente le envía los insights que quiere investigar y recibe taxonomías, modus
                  operandi, casos similares y banderas relacionadas.
                </p>
              </div>
              <Switch
                checked={research.vectorStore.enabled}
                onCheckedChange={(enabled) =>
                  patchVectorStore(enabled ? { enabled } : { enabled, vectorStoreInstanceId: null })
                }
                disabled={disabled}
              />
            </div>
            {research.vectorStore.enabled && (
              <>
                <VectorStoreInstancePicker
                  instanceId={research.vectorStore.vectorStoreInstanceId}
                  onInstanceIdChange={(vectorStoreInstanceId) =>
                    patchVectorStore({ vectorStoreInstanceId })
                  }
                  disabled={disabled}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Máx. interacciones"
                    hint="Cuántas veces puede el agente consultar el vector store en este paso."
                  >
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={research.vectorStore.maxDelegations}
                      disabled={disabled}
                      onChange={(e) =>
                        patchVectorStore({
                          maxDelegations: Math.min(10, Math.max(1, Number(e.target.value))),
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label="Tiempo máximo (s)"
                    hint="Por consulta. Si se excede, la consulta cuenta como fallida y el agente sigue."
                  >
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={research.vectorStore.timeoutSeconds}
                      disabled={disabled}
                      onChange={(e) =>
                        patchVectorStore({
                          timeoutSeconds: Math.min(60, Math.max(1, Number(e.target.value))),
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-[13px] font-medium text-text-primary">Análisis de historial</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Analiza el historial de transacciones de la alerta cuando el resultado queda
                  inconcluso o es cuestionado.
                </p>
              </div>
              <Switch
                checked={history.enabled}
                onCheckedChange={(enabled) => patchHistory({ enabled })}
                disabled={disabled}
              />
            </div>
            {history.enabled && (
              <>
                <Field label="Columnas" hint="Sin columnas seleccionadas analiza todas.">
                  <div className="flex flex-wrap gap-1.5">
                    {HISTORY_COLUMNS.map((column) => {
                      const selected = history.allowedColumns.includes(column.value);
                      return (
                        <button
                          key={column.value}
                          type="button"
                          disabled={disabled}
                          aria-pressed={selected}
                          onClick={() =>
                            patchHistory({
                              allowedColumns: selected
                                ? history.allowedColumns.filter((c) => c !== column.value)
                                : [...history.allowedColumns, column.value],
                            })
                          }
                          className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
                            selected
                              ? "border-primary bg-primary text-white"
                              : "border-border text-text-secondary hover:border-primary"
                          }`}
                        >
                          {column.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Ventana (días)"
                    hint="Transacciones de los últimos N días antes de la alerta. 0 = sin límite."
                  >
                    <input
                      type="number"
                      min={0}
                      value={history.windowDays}
                      disabled={disabled}
                      onChange={(e) =>
                        patchHistory({ windowDays: Math.max(0, Number(e.target.value)) })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Máximo de transacciones" hint="Se analizan las más recientes.">
                    <input
                      type="number"
                      min={1}
                      value={history.maxHistoryRows}
                      disabled={disabled}
                      onChange={(e) =>
                        patchHistory({ maxHistoryRows: Math.max(1, Number(e.target.value)) })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label="Máx. rondas"
                    hint="Rondas de investigación mientras el paso siga inconcluso o cuestionado (máx. 5)."
                  >
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={history.maxDelegations}
                      disabled={disabled}
                      onChange={(e) =>
                        patchHistory({
                          maxDelegations: Math.min(5, Math.max(1, Number(e.target.value))),
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    label="Tiempo máximo (s)"
                    hint="Por ronda. Si se excede, la ronda cuenta como fallida y el paso sigue."
                  >
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={history.timeoutSeconds}
                      disabled={disabled}
                      onChange={(e) =>
                        patchHistory({
                          timeoutSeconds: Math.min(60, Math.max(1, Number(e.target.value))),
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
