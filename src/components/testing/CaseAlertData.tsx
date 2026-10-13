import { useQuery } from "@tanstack/react-query";
import { getActiveAlertSchema } from "@/lib/api/alertSchema.functions";
import { AlertSchemaView, type CanonicalAlertData } from "@/components/alert/AlertSchemaView";
import type { WorkflowStepResponse } from "@/lib/api/testing.functions";
import { asObject, latestOutput } from "./caseExecutions";

export function CaseAlertData({
  steps,
  alertId,
}: {
  steps: WorkflowStepResponse[];
  alertId: string;
}) {
  const schemaQuery = useQuery({ queryKey: ["activeAlertSchema"], queryFn: getActiveAlertSchema });
  const output = latestOutput(steps, "pre_process");
  const record = (value: unknown) =>
    (asObject((value ?? null) as never) ?? {}) as Record<string, unknown>;
  const data: CanonicalAlertData = {
    input: record(output && asObject(output)?.input),
    labels: record(output && asObject(output)?.labels),
    history_prev_alerta: Array.isArray(output?.history_prev_alerta)
      ? (output.history_prev_alerta as Record<string, unknown>[])
      : [],
    agent_output: record(output && asObject(output)?.agent_output),
  };
  const labels = data.labels ?? {};
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2.5">
        <h4 className="text-[13px] font-semibold text-text-primary">Datos de la alerta</h4>
        <span className="text-[10px] text-text-secondary">{alertId}</span>
      </div>
      <AlertSchemaView schema={schemaQuery.data ?? null} data={data} alertId={alertId} />
      <section className="mt-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
        <h5 className="text-[11px] font-bold uppercase tracking-wider text-warning mb-1">
          Desenlace esperado
        </h5>
        <p className="text-[10px] text-text-secondary mb-2">
          Etiquetas de evaluación; no se envían al agente.
        </p>
        {Object.keys(labels).length ? (
          <dl className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] text-[12px]">
            {Object.entries(labels).map(([field, value]) => (
              <div key={field} className="contents">
                <dt className="py-1.5 pr-3 text-text-secondary border-t border-border">{field}</dt>
                <dd className="py-1.5 font-medium text-text-primary border-t border-border break-all">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[12px] text-text-secondary">Sin etiquetas para este caso.</p>
        )}
      </section>
    </div>
  );
}
