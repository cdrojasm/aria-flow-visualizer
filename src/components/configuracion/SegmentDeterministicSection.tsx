import type { AricAction, DeterministicConfig, DeterministicDecision, DeterministicRule } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { RuleConditionEditor } from "./SegmentRubricsSection";

export function SegmentDeterministicSection({
  value,
  onChange,
  disabled,
}: {
  value: DeterministicConfig;
  onChange: (value: DeterministicConfig) => void;
  disabled?: boolean;
}) {
  const { variables } = useVariableCatalog();
  const rules = value.rules;
  const updateRules = (next: DeterministicRule[]) => onChange({ ...value, rules: next });
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-[14px] font-semibold text-text-primary">
            Decisiones determinísticas
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Cuando una condición se cumple, marca la alerta sin depender de un modelo.
          </p>
        </div>
        <div className="space-y-3 p-5">
          {rules.map((rule) => (
            <div key={rule.id} className="space-y-2">
              <RuleConditionEditor
                value={[rule]}
                onChange={(next) =>
                  updateRules(
                    next.length
                      ? rules.map((item) =>
                          item.id === rule.id
                            ? { ...next[0], decision: item.decision, aricAction: item.aricAction }
                            : item,
                        )
                      : rules.filter((item) => item.id !== rule.id),
                  )
                }
                variables={variables}
                disabled={disabled}
                showScore={false}
                allowAdd={false}
              />
              <select
                value={rule.decision}
                disabled={disabled}
                onChange={(event) =>
                  updateRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? { ...item, decision: event.target.value as DeterministicDecision }
                        : item,
                    ),
                  )
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
              >
                <option value="risk_suspected">Marcar como riesgo sospechoso</option>
                <option value="risk">Marcar como riesgo</option>
              </select>
              <select
                value={rule.aricAction}
                disabled={disabled}
                onChange={(event) =>
                  updateRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? { ...item, aricAction: event.target.value as AricAction }
                        : item,
                    ),
                  )
                }
                className="ml-2 h-8 rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary"
              >
                <option value="soft_block">ARIC: bloqueo suave</option>
                <option value="hard_block">ARIC: bloqueo duro</option>
              </select>
            </div>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              updateRules([
                ...rules,
                {
                  id: crypto.randomUUID(),
                  variable: "",
                  comparison: "gt",
                  values: [""],
                  score: 0,
                  decision: "risk_suspected",
                  aricAction: "soft_block",
                },
              ])
            }
            className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
          >
            + Agregar decisión
          </button>
        </div>
      </section>
    </div>
  );
}
