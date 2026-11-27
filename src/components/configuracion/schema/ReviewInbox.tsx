import type { AlertSchemaPresence, AlertSchemaSuggestion } from "@/lib/api/alertSchema.functions";

export type ReviewItem =
  | { kind: "unknown"; key: string; location: string; frequency: number }
  | {
      kind: "report";
      key: string;
      location: string;
      suggestion: AlertSchemaSuggestion;
      frequency: number | null;
    };

/** Unifies unknown locations seen in alerts and analyst reports, minus ignored ones. */
export function buildReviewItems(
  presence: AlertSchemaPresence | null | undefined,
  suggestions: AlertSchemaSuggestion[],
  ignored: Set<string>,
): ReviewItem[] {
  const frequencies = new Map(
    (presence?.unknown_locations ?? []).map((u) => [u.location, u.frequency]),
  );
  const reportLocations = new Set(suggestions.map((s) => s.location));
  const reports = suggestions
    .filter((s) => !ignored.has(s.location))
    .map<ReviewItem>((suggestion) => ({
      kind: "report",
      key: `report-${suggestion.id}`,
      location: suggestion.location,
      suggestion,
      frequency: frequencies.get(suggestion.location) ?? null,
    }));
  const unknown = (presence?.unknown_locations ?? [])
    .filter((u) => !ignored.has(u.location) && !reportLocations.has(u.location))
    .map<ReviewItem>((u) => ({
      kind: "unknown",
      key: `unknown-${u.location}`,
      location: u.location,
      frequency: u.frequency,
    }));
  return [...unknown, ...reports];
}

export function ReviewInbox({
  presence,
  items,
  onAdd,
  onIgnore,
}: {
  presence: AlertSchemaPresence | null | undefined;
  items: ReviewItem[];
  onAdd: (location: string) => void;
  onIgnore: (location: string) => void;
}) {
  return (
    <div data-testid="review-inbox" className="space-y-3">
      <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text-secondary">
        Último análisis: {presence?.report_day ?? "—"} · {presence?.alert_count ?? 0} alertas
      </div>
      {items.map((item) => (
        <div
          key={item.key}
          data-testid="review-item"
          className="rounded-lg border border-border p-3 text-xs"
        >
          {item.kind === "unknown" ? (
            <>
              <p className="font-semibold">Campo nuevo · {item.location}</p>
              <p className="mt-1 text-text-secondary">Llegó en {item.frequency} alertas.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">
                {item.suggestion.field} · {item.suggestion.location}
              </p>
              <p className="mt-1 text-text-secondary">{item.suggestion.comment}</p>
              <p className="mt-1 text-[11px] text-text-secondary">
                Reportó {item.suggestion.created_by}
                {item.frequency !== null ? ` · llegó en ${item.frequency} alertas` : ""}
              </p>
            </>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-2 py-1 text-white"
              onClick={() => onAdd(item.location)}
            >
              Añadir al borrador
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1"
              onClick={() => onIgnore(item.location)}
            >
              Ignorar
            </button>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-text-secondary">
          No hay reportes de analistas.
        </div>
      )}
    </div>
  );
}
