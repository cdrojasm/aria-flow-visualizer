import { useQuery } from "@tanstack/react-query";

import { getModels } from "@/lib/api/models.functions";
import { Field } from "./shared/FormControls";

/* ─── "Modelo" subtab (task 5) ───────────────────────────
   Picks which trained XGBoost model (see /modelos, ModelsTable.tsx) this
   segment's agent scores alerts with - only READY models are selectable,
   an in-training or failed one isn't servable yet. Writes
   SegmentAgentConfig.activeModelId, which the FastMCP service's own
   ModelRepository.get_active() (a separate, global "which version is
   loaded" concept) is reloaded to match by an admin via the "recargar"
   control on /modelos - this picker itself doesn't trigger that reload. */

export function SegmentModelSection({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (modelId: string | null) => void;
  disabled?: boolean;
}) {
  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const readyModels = (modelsQuery.data ?? []).filter((m) => m.status === "READY");
  const selected = readyModels.find((m) => m.id === value);

  return (
    <fieldset disabled={disabled} className="space-y-4 max-w-xl">
      <Field
        label="Modelo XGBoost"
        hint="Modelo entrenado que el agente consulta (vía el servicio MCP) al puntuar una alerta en este segmento. Solo se listan modelos con estado Listo."
      >
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
        >
          <option value="">Sin modelo asignado</option>
          {readyModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tag}
            </option>
          ))}
        </select>
      </Field>

      {value && !selected && !modelsQuery.isLoading && (
        <p className="text-[12px] text-amber-600">
          El modelo asignado ({value}) ya no está disponible o no está listo.
        </p>
      )}

      {selected && (
        <div className="rounded-lg border border-border bg-card p-3 text-[12px] text-text-secondary space-y-1">
          <p>{selected.description || "Sin descripción."}</p>
          {selected.metrics && (
            <p>
              ROC-AUC: {selected.metrics["roc_auc"]?.toFixed(3) ?? "—"} · F1 macro:{" "}
              {selected.metrics["f1_macro"]?.toFixed(3) ?? "—"}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
