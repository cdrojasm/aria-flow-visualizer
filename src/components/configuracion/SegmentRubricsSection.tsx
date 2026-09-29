import { Plus, Trash2 } from "lucide-react";

import { createId } from "@/lib/createId";
import type { Rubric, RuleComparison, RuleCondition } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";

const COMPARISONS: { value: RuleComparison; label: string; values: number }[] = [
  { value: "gt", label: "es mayor que", values: 1 },
  { value: "gte", label: "es mayor o igual que", values: 1 },
  { value: "lt", label: "es menor que", values: 1 },
  { value: "lte", label: "es menor o igual que", values: 1 },
  { value: "eq", label: "es igual a", values: 1 },
  { value: "neq", label: "es distinto de", values: 1 },
  { value: "between", label: "está entre", values: 2 },
  { value: "in", label: "está en categoría", values: 1 },
];

// Each rubric is an additive scorecard: every matched condition adds its
// points, and a rubric's points must sum to exactly 100 (0-100 score). The
// backend rejects the save with 422 otherwise (CreateConfigurationRequest).
export const RUBRIC_TARGET_TOTAL = 100;

export const rubricTotal = (rubric: Rubric): number =>
  rubric.conditions.reduce((total, condition) => total + (Number(condition.score) || 0), 0);

const isRubricBalanced = (rubric: Rubric): boolean =>
  Math.abs(rubricTotal(rubric) - RUBRIC_TARGET_TOTAL) < 1e-9;

/** Human-readable problems blocking save, one per unbalanced rubric. */
export function rubricValidationErrors(
  segments: Record<string, { agent?: { rubrics?: Rubric[] } }>,
): string[] {
  return Object.entries(segments).flatMap(([code, segment]) =>
    (segment.agent?.rubrics ?? [])
      .filter((rubric) => !isRubricBalanced(rubric))
      .map(
        (rubric) =>
          `${code} · ${rubric.name || "Rúbrica sin nombre"}: ${rubricTotal(rubric)} de ${RUBRIC_TARGET_TOTAL} pts`,
      ),
  );
}

const emptyCondition = (): RuleCondition => ({
  id: createId(),
  variable: "",
  comparison: "gt",
  values: [""],
  score: 0,
});

export function RuleConditionEditor({
  value,
  onChange,
  variables,
  disabled,
  showScore = true,
  allowAdd = true,
}: {
  value: RuleCondition[];
  onChange: (conditions: RuleCondition[]) => void;
  variables: string[];
  disabled?: boolean;
  showScore?: boolean;
  allowAdd?: boolean;
}) {
  const update = (id: string, patch: Partial<RuleCondition>) =>
    onChange(
      value.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition)),
    );
  const comparison = (id: string, next: RuleComparison) => {
    const required = COMPARISONS.find((item) => item.value === next)?.values ?? 1;
    update(id, { comparison: next, values: Array(required).fill("") });
  };
  return (
    <div className="space-y-2">
      <datalist id="agent-rule-variables">
        {variables.map((variable) => (
          <option key={variable} value={variable} />
        ))}
      </datalist>
      {value.map((condition) => {
        const definition = COMPARISONS.find((item) => item.value === condition.comparison)!;
        return (
          <div
            key={condition.id}
            className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(130px,1fr)_150px_minmax(110px,1fr)_auto] md:items-center"
          >
            <input
              list="agent-rule-variables"
              value={condition.variable}
              disabled={disabled}
              placeholder="Variable"
              onChange={(event) => update(condition.id, { variable: event.target.value })}
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
            />
            <select
              value={condition.comparison}
              disabled={disabled}
              onChange={(event) => comparison(condition.id, event.target.value as RuleComparison)}
              className="h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
            >
              {COMPARISONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              {Array.from({ length: definition.values }, (_, index) => (
                <input
                  key={index}
                  value={condition.values[index] ?? ""}
                  disabled={disabled}
                  placeholder={
                    definition.values === 2 ? (index === 0 ? "Desde" : "Hasta") : "Valor"
                  }
                  onChange={(event) => {
                    const values = [...condition.values];
                    values[index] = event.target.value;
                    update(condition.id, { values });
                  }}
                  className="min-w-0 flex-1 h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {showScore && (
                <>
                  <input
                    type="number"
                    value={condition.score}
                    disabled={disabled}
                    onChange={(event) =>
                      update(condition.id, { score: Number(event.target.value) })
                    }
                    className="h-8 w-16 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
                  />
                  <span className="text-[12px] text-text-secondary">pts</span>
                </>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item.id !== condition.id))}
                aria-label="Eliminar condición"
                className="rounded p-1 text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {allowAdd && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...value, emptyCondition()])}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar condición
        </button>
      )}
    </div>
  );
}

export function SegmentRubricsSection({
  value,
  onChange,
  variables,
  disabled,
}: {
  value: Rubric[];
  onChange: (rubrics: Rubric[]) => void;
  variables: string[];
  disabled?: boolean;
}) {
  const { variables: alertVariables } = useVariableCatalog();
  const variablePool = [...new Set([...alertVariables, ...variables])];
  const add = () => onChange([...value, { id: createId(), name: "Nueva rúbrica", conditions: [] }]);
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface/40 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Rúbricas</h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Cada rúbrica calcula un puntaje independiente de 0 a 100: cada condición que se cumple
            suma sus puntos. Los puntos de cada rúbrica deben sumar exactamente 100.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva rúbrica
        </button>
      </div>
      {value.map((rubric) => {
        const total = rubricTotal(rubric);
        const balanced = isRubricBalanced(rubric);
        return (
          <article
            key={rubric.id}
            className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <input
                value={rubric.name}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    value.map((item) =>
                      item.id === rubric.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
                className="h-8 flex-1 rounded-md border border-border px-2 text-[13px] font-semibold focus:outline-none focus:border-primary"
              />
              <span
                className={`whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium ${
                  balanced ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                }`}
                title="Los puntos de la rúbrica deben sumar exactamente 100"
              >
                {total} / {RUBRIC_TARGET_TOTAL} pts
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item.id !== rubric.id))}
                aria-label="Eliminar rúbrica"
                className="rounded p-1.5 text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-[11px] text-text-secondary">
                Ej.: amount &gt; 3000 +10 · device ≠ iphone +5 · device_enroll_time &lt; 6 meses
                +15.
              </p>
              <RuleConditionEditor
                value={rubric.conditions}
                onChange={(conditions) =>
                  onChange(
                    value.map((item) => (item.id === rubric.id ? { ...item, conditions } : item)),
                  )
                }
                variables={variablePool}
                disabled={disabled}
              />
              {!balanced && (
                <p className="text-[12px] text-danger">
                  {total < RUBRIC_TARGET_TOTAL
                    ? `Faltan ${RUBRIC_TARGET_TOTAL - total} pts`
                    : `Sobran ${total - RUBRIC_TARGET_TOTAL} pts`}{" "}
                  para llegar a {RUBRIC_TARGET_TOTAL}. No se puede guardar hasta corregirlo.
                </p>
              )}
            </div>
          </article>
        );
      })}
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12px] text-text-secondary">
          Aún no hay rúbricas. Crea una para definir un score como <code>estafa_score</code>.
        </div>
      )}
    </section>
  );
}
