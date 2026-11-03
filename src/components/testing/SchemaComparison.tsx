import type { TestCaseDetailResponse } from "@/lib/api/testing.functions";

export function SchemaComparison({
  comparison,
}: {
  comparison: TestCaseDetailResponse["schema_comparison"];
}) {
  if (!comparison) return null;
  const active = comparison.active.input;
  const candidate = comparison.candidate.input;
  const fields = new Set([...Object.keys(active), ...Object.keys(candidate)]);
  const entries = [...fields]
    .map((field) => {
      const hasActive = field in active;
      const hasCandidate = field in candidate;
      const changed =
        hasActive &&
        hasCandidate &&
        JSON.stringify(active[field]) !== JSON.stringify(candidate[field]);
      return { field, hasActive, hasCandidate, changed };
    })
    .filter((row) => !row.hasActive || !row.hasCandidate || row.changed);
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3 mt-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="text-[13px] font-semibold text-text-primary">Comparación de pre-proceso</h4>
        <span className="text-[10px] text-text-secondary">
          Activo v{comparison.active.schema_version} · Candidato v
          {comparison.candidate.schema_version}
        </span>
      </div>
      <p className="text-[11px] text-text-secondary mb-2">
        Solo pre-proceso; no incluye salida del agente.
      </p>
      {!entries.length ? (
        <p className="text-[12px] text-success">Sin diferencias en la entrada.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-[12px]">
          {entries.map((entry) => (
            <div key={entry.field} className="contents">
              <span className="border-t border-border py-1.5 font-medium">{entry.field}</span>
              <span
                className={`border-t border-border py-1.5 ${entry.hasActive ? "text-text-primary" : "text-danger"}`}
              >
                {entry.hasActive ? "Presente" : "Desaparece"}
              </span>
              <span
                className={`border-t border-border py-1.5 ${entry.hasCandidate ? "text-text-primary" : "text-danger"}`}
              >
                {entry.hasCandidate ? (entry.changed ? "Cambia" : "Presente") : "Aparece"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
