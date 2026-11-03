import { useQuery } from "@tanstack/react-query";
import { getActiveAlertSchema } from "@/lib/api/alertSchema.functions";
import { AlertSchemaView, type CanonicalAlertData } from "@/components/alert/AlertSchemaView";
import type { Json } from "@/lib/api/testing.functions";
import { asObject } from "./caseExecutions";

export function AlertFullData({ preProcess }: { preProcess: Record<string, Json> | null }) {
  const schemaQuery = useQuery({ queryKey: ["activeAlertSchema"], queryFn: getActiveAlertSchema });
  const output = asObject(preProcess) ?? {};
  const record = (value: unknown) => (asObject(value as Json) ?? {}) as Record<string, unknown>;
  const data: CanonicalAlertData = {
    input: record(output.input),
    labels: record(output.labels),
    history_prev_alerta: Array.isArray(output.history_prev_alerta)
      ? (output.history_prev_alerta as Record<string, unknown>[])
      : [],
    agent_output: record(output.agent_output),
  };
  if (!preProcess)
    return <p className="text-[12px] text-text-secondary">No hay datos canónicos de la alerta.</p>;
  return <AlertSchemaView schema={schemaQuery.data ?? null} data={data} />;
}
