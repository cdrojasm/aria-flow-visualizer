import type { ModelResponse } from "@/lib/api/models.functions";

/** "Esquema vN" plus an amber "Requiere revisión" chip. Renders nothing for unpinned models. */
export function ModelSchemaBadge({
  model,
}: {
  model: Pick<ModelResponse, "alert_schema_version" | "schema_review">;
}) {
  const version = model.alert_schema_version ?? model.schema_review?.trained_version ?? null;
  const review = model.schema_review?.required ? model.schema_review : null;
  if (version == null && !review) return null;
  const changed = review?.changed_fields ?? [];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {version != null && (
        <span data-testid="model-schema-version" className="text-[11px] text-text-secondary">
          Esquema v{version}
        </span>
      )}
      {review && (
        <span
          data-testid="model-schema-review"
          title={
            changed.length
              ? `Campos cambiados en el esquema v${review.active_version ?? "?"}: ${changed.join(", ")}`
              : "Un esquema aprobado cambió campos que usa este modelo"
          }
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
        >
          Requiere revisión
        </span>
      )}
    </span>
  );
}
