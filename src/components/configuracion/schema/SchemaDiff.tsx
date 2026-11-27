import {
  ATTRIBUTE_LABELS,
  formatDiffValue,
  summarizeComparison,
  type DiffSummary,
} from "./schemaHelpers";

export function DiffChips({ summary }: { summary: DiffSummary }) {
  const chips = [
    { key: "added", text: `+${summary.added} añadidos`, tone: "text-success" },
    { key: "changed", text: `~${summary.typeOrRole} cambian de tipo/rol`, tone: "text-warning" },
    { key: "removed", text: `−${summary.removed} eliminados`, tone: "text-danger" },
  ];
  if (summary.other > 0)
    chips.push({
      key: "other",
      text: `${summary.other} con otros ajustes`,
      tone: "text-text-secondary",
    });
  if (summary.roles.length > 0)
    chips.push({
      key: "roles",
      text: `${summary.roles.length} roles esenciales reasignados`,
      tone: "text-text-secondary",
    });
  return (
    <div data-testid="schema-diff-chips" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          data-testid={`schema-diff-chip-${chip.key}`}
          className={`rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium ${chip.tone}`}
        >
          {chip.text}
        </span>
      ))}
    </div>
  );
}

/** Readable diff of a version against the active one, with a raw JSON fallback. */
export function SchemaDiff({ comparison }: { comparison: unknown }) {
  const summary = summarizeComparison(comparison);
  return (
    <div data-testid="schema-diff" className="space-y-2">
      {summary === null ? (
        <p className="text-text-secondary">
          No se pudo resumir la comparación; revisa el detalle técnico.
        </p>
      ) : summary.total === 0 ? (
        <p className="text-text-secondary">Sin diferencias con la versión activa.</p>
      ) : (
        <>
          <DiffChips summary={summary} />
          <ul className="space-y-1">
            {summary.entries.map((entry) => (
              <li
                key={`${entry.kind}-${entry.field}`}
                data-testid="schema-diff-entry"
                className="rounded border border-border p-2"
              >
                <span className="font-semibold">
                  {entry.kind === "added" ? "+ " : entry.kind === "removed" ? "− " : "~ "}
                  {entry.field}
                </span>{" "}
                <span className="text-text-secondary">
                  {entry.kind === "added"
                    ? "campo nuevo"
                    : entry.kind === "removed"
                      ? "campo eliminado"
                      : "cambió"}
                </span>
                {entry.attributes.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-text-secondary">
                    {entry.attributes.map((attribute) => (
                      <li key={attribute.name}>
                        {ATTRIBUTE_LABELS[attribute.name] ?? attribute.name}:{" "}
                        {formatDiffValue(attribute.before)} → {formatDiffValue(attribute.after)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {summary.roles.map((role) => (
              <li key={role.role} className="rounded border border-border p-2">
                <span className="font-semibold">Rol esencial {role.role}</span>{" "}
                <span className="text-text-secondary">
                  {formatDiffValue(role.before)} → {formatDiffValue(role.after)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="text-text-secondary">
        <summary className="cursor-pointer">Ver JSON</summary>
        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(comparison ?? {}, null, 2)}</pre>
      </details>
    </div>
  );
}
