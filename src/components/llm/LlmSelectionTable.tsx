import { useQuery } from "@tanstack/react-query";

import { getLlmCatalog, type LlmSelection } from "@/lib/api/llmCatalog.functions";
import { LLM_ELEMENT_LABELS, llmElementLabel } from "./llmElements";

/* One row per LLM element with a selector over the catalog. The stored value
   is the catalog *name*, never the deployment. An empty choice means "use the
   default" - the label says which deployment that is. */
export function LlmSelectionTable({
  value,
  onChange,
  disabled = false,
  group,
  defaultLabel = "Por defecto",
  testIdPrefix = "llm-select",
}: {
  value: LlmSelection;
  onChange: (next: LlmSelection) => void;
  disabled?: boolean;
  // Restrict to pipeline steps ("workflow") or the other components ("support").
  group?: "workflow" | "support";
  defaultLabel?: string;
  testIdPrefix?: string;
}) {
  const catalogQuery = useQuery({ queryKey: ["llmCatalog"], queryFn: getLlmCatalog });

  if (catalogQuery.isLoading) {
    return <p className="text-[12px] text-text-secondary">Cargando catálogo de modelos…</p>;
  }
  if (catalogQuery.isError || !catalogQuery.data) {
    return <p className="text-[12px] text-danger">No se pudo cargar el catálogo de modelos LLM.</p>;
  }
  const { entries, elements } = catalogQuery.data;
  if (entries.length === 0) {
    return (
      <p className="text-[12px] text-text-secondary" data-testid={`${testIdPrefix}-empty`}>
        No hay un catálogo de modelos configurado (variable LLM_CATALOG): cada elemento usa su
        modelo por defecto.
      </p>
    );
  }
  const names = new Set(entries.map((entry) => entry.name));
  const rows = elements.filter((info) => !group || info.group === group);

  return (
    <div className="divide-y divide-border border border-border rounded-lg">
      {rows.map((info) => {
        const chosen = value[info.element] ?? "";
        return (
          <div key={info.element} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0">
              <label
                htmlFor={`${testIdPrefix}-${info.element}`}
                className="text-[13px] font-medium text-text-primary"
              >
                {llmElementLabel(info.element)}
              </label>
              <p className="text-[11px] text-text-secondary">
                {LLM_ELEMENT_LABELS[info.element]?.hint}
              </p>
            </div>
            <select
              id={`${testIdPrefix}-${info.element}`}
              data-testid={`${testIdPrefix}-${info.element}`}
              disabled={disabled}
              value={chosen}
              onChange={(e) => onChange({ ...value, [info.element]: e.target.value || null })}
              className="h-9 w-[260px] shrink-0 rounded-md border border-border bg-background px-2 text-[13px] focus:outline-none focus:border-primary"
            >
              <option value="">
                {defaultLabel}
                {info.default_deployment ? ` (${info.default_deployment})` : ""}
              </option>
              {chosen && !names.has(chosen) && (
                <option value={chosen}>{chosen} (fuera del catálogo)</option>
              )}
              {entries.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} ({entry.deployment})
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
