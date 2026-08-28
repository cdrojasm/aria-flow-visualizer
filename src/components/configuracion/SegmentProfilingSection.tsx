import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  COMPARISON_OPERATORS,
  CRITERIA_MODES_BY_KIND,
  CRITERIA_MODE_LABELS,
  PROFILING_STRATEGY_KEYS,
  PROFILING_STRATEGY_LABELS,
  type ComparisonOperator,
  type CriteriaMode,
  type FieldCategorization,
  type FieldCriterion,
  type FieldKind,
  type ProfilingConfig,
  type ProfilingStrategy,
} from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { Field, TagInput, VariablePicker } from "./shared/FormControls";

const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  cuantizable: "Cuantizable",
  categorico: "Categórico",
};

/* ─── Profiling chain (Phase 3) ──────────────────────────
   Field categorization (cuantizable/categórico) feeding the 3-step
   profiling chain (usuario -> transaccion -> transaccional). Each
   strategy's main-prompt variable pool grows with every earlier
   strategy's producedVariables ("previously categorized variables"). */

export function SegmentProfilingSection({
  value,
  onChange,
  disabled,
}: {
  value: ProfilingConfig;
  onChange: (value: ProfilingConfig) => void;
  disabled?: boolean;
}) {
  const { variables } = useVariableCatalog();

  const updateStrategy = (index: number, patch: Partial<ProfilingStrategy>) => {
    const strategies = value.strategies.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...value, strategies });
  };

  const producedBefore = (index: number): string[] =>
    value.strategies.slice(0, index).flatMap((s) => s.producedVariables);

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Categorización de campos</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Marca cada campo como cuantizable (numérico) o categórico, para que el agente sepa cómo tratarlo al perfilar.</p>
        </div>
        <div className="p-6">
          <FieldCategorizationTable
            value={value.fieldCategorizations}
            onChange={(fieldCategorizations) => onChange({ ...value, fieldCategorizations })}
            disabled={disabled}
            availableVariables={variables}
          />
        </div>
      </section>

      <div className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">Cadena de perfilamiento</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Tres estrategias encadenadas — cada una puede referenciar las variables categorizadas por las anteriores.</p>
        </div>
        {PROFILING_STRATEGY_KEYS.map((key, index) => {
          const strategy = value.strategies.find((s) => s.key === key) ?? value.strategies[index];
          const pool = [...variables, ...producedBefore(index)];
          return (
            <section key={key} className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              <div className="px-6 py-4 border-b border-border">
                <h3 className="text-[13px] font-semibold text-text-primary">
                  {index + 1}. {PROFILING_STRATEGY_LABELS[key]}
                </h3>
              </div>
              <div className="p-6 space-y-5">
                <Field label="Prompt principal" hint="Compone el input del agente para esta estrategia. Puede referenciar variables base y las producidas por estrategias anteriores.">
                  <textarea
                    value={strategy.mainPrompt}
                    onChange={(e) => updateStrategy(index, { mainPrompt: e.target.value })}
                    rows={3}
                    disabled={disabled}
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none disabled:opacity-50"
                  />
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles (incluye las ya categorizadas por estrategias anteriores)</p>
                    <VariablePicker
                      value={strategy.mainPromptVars}
                      onChange={(v) => updateStrategy(index, { mainPromptVars: v })}
                      pool={pool}
                    />
                  </div>
                </Field>

                <Field label="Prompt de categorización (LLM)" hint="Sub-prompt ejecutado a través de un LLM para categorizar/cuantizar valores; su salida queda disponible como variable producida.">
                  <textarea
                    value={strategy.categorizationPrompt}
                    onChange={(e) => updateStrategy(index, { categorizationPrompt: e.target.value })}
                    rows={3}
                    disabled={disabled}
                    placeholder="Ej: Dado el historial transaccional, clasifica el riesgo del usuario como bajo, medio o alto."
                    className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none disabled:opacity-50"
                  />
                  <div className="mt-2">
                    <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
                    <VariablePicker
                      value={strategy.categorizationPromptVars}
                      onChange={(v) => updateStrategy(index, { categorizationPromptVars: v })}
                      pool={pool}
                    />
                  </div>
                </Field>

                <Field label="Variables producidas" hint="Nombres de las variables que este paso de categorización genera — quedan disponibles para las estrategias siguientes.">
                  <TagInput
                    value={strategy.producedVariables}
                    onChange={(v) => updateStrategy(index, { producedVariables: v })}
                    placeholder="Ej: riesgo_usuario"
                  />
                </Field>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="pr-4">
                    <p className="text-[13px] font-medium text-text-primary">Historial de alertas vía pandas (MCP)</p>
                    <p className="text-[12px] text-text-secondary mt-0.5">El LLM de categorización puede consultar el historial de alertas del cliente vía pandas, expuesto como herramienta MCP.</p>
                  </div>
                  <Switch
                    checked={strategy.usePandasHistoryMcp}
                    onCheckedChange={(checked) => updateStrategy(index, { usePandasHistoryMcp: checked })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function FieldCategorizationTable({
  value,
  onChange,
  disabled,
  availableVariables,
}: {
  value: FieldCategorization[];
  onChange: (value: FieldCategorization[]) => void;
  disabled?: boolean;
  availableVariables: string[];
}) {
  const [newField, setNewField] = useState("");
  const [newKind, setNewKind] = useState<FieldKind>("categorico");

  const available = availableVariables.filter((v) => !value.some((fc) => fc.field === v));

  const add = () => {
    if (!newField) return;
    onChange([...value, { field: newField, kind: newKind, criteria: [] }]);
    setNewField("");
  };

  const remove = (field: string) => onChange(value.filter((fc) => fc.field !== field));

  const setKind = (field: string, kind: FieldKind) =>
    // Criteria modes are kind-specific (intervalo/comparativa vs.
    // igualdad/pertenencia), so switching kind drops the now-invalid ones.
    onChange(value.map((fc) => (fc.field === field ? { ...fc, kind, criteria: [] } : fc)));

  const setCriteria = (field: string, criteria: FieldCriterion[]) =>
    onChange(value.map((fc) => (fc.field === field ? { ...fc, criteria } : fc)));

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-[12px] text-text-secondary">Sin campos categorizados.</p>}
      <div className="space-y-2">
        {value.map((fc) => (
          <div key={fc.field} className="rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-text-primary flex-1">{fc.field}</span>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {(["cuantizable", "categorico"] as FieldKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={disabled}
                    onClick={() => setKind(fc.field, kind)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      fc.kind === kind ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {FIELD_KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(fc.field)}
                className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <FieldCriteriaEditor
              kind={fc.kind}
              value={fc.criteria}
              onChange={(criteria) => setCriteria(fc.field, criteria)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={newField}
          disabled={disabled}
          onChange={(e) => setNewField(e.target.value)}
          className="h-9 flex-1 rounded-md border border-border px-3 text-[13px] bg-background focus:outline-none focus:border-primary"
        >
          <option value="">Selecciona un campo…</option>
          {available.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <select
          value={newKind}
          disabled={disabled}
          onChange={(e) => setNewKind(e.target.value as FieldKind)}
          className="h-9 rounded-md border border-border px-3 text-[13px] bg-background focus:outline-none focus:border-primary"
        >
          <option value="categorico">Categórico</option>
          <option value="cuantizable">Cuantizable</option>
        </select>
        <button
          type="button"
          disabled={disabled || !newField}
          onClick={add}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>
    </div>
  );
}

/* Per-field validation criteria: cuantizable -> intervalo/comparativa,
   categorico -> igualdad/no_igualdad/pertenencia/no_pertenencia. Each
   criterion carries its own output (e.g. a risk label). */
function FieldCriteriaEditor({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: FieldKind;
  value: FieldCriterion[];
  onChange: (value: FieldCriterion[]) => void;
  disabled?: boolean;
}) {
  const modes = CRITERIA_MODES_BY_KIND[kind];

  const update = (id: string, patch: Partial<FieldCriterion>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const add = () =>
    onChange([...value, { id: `crit-${Date.now()}`, mode: modes[0], output: "", values: [] }]);

  const remove = (id: string) => onChange(value.filter((c) => c.id !== id));

  const numberInput = (
    val: number | undefined,
    onVal: (n: number | undefined) => void,
    placeholder: string,
    width = "w-20",
  ) => (
    <input
      type="number"
      placeholder={placeholder}
      value={val ?? ""}
      disabled={disabled}
      onChange={(e) => onVal(e.target.value === "" ? undefined : Number(e.target.value))}
      className={`${width} h-7 rounded border border-border px-1.5 text-[11px] focus:outline-none focus:border-primary disabled:opacity-50`}
    />
  );

  return (
    <div className="mt-2 pl-3 border-l-2 border-border space-y-1.5">
      {value.length === 0 && <p className="text-[11px] text-text-secondary">Sin criterios de validación.</p>}
      {value.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-md bg-background px-2 py-1.5">
          <select
            value={c.mode}
            disabled={disabled}
            onChange={(e) => {
              const mode = e.target.value as CriteriaMode;
              // The operator select shows a fallback default (">") purely
              // for display when c.operator is unset - write it into state
              // here too, or an untouched dropdown saves as null.
              const patch: Partial<FieldCriterion> =
                mode === "comparativa" && !c.operator
                  ? { mode, operator: COMPARISON_OPERATORS[0] }
                  : { mode };
              update(c.id, patch);
            }}
            className="h-7 rounded border border-border px-1.5 text-[11px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
          >
            {modes.map((m) => (
              <option key={m} value={m}>{CRITERIA_MODE_LABELS[m]}</option>
            ))}
          </select>

          {c.mode === "intervalo" && (
            <>
              {numberInput(c.minValue, (n) => update(c.id, { minValue: n }), "Mín")}
              <span className="text-[11px] text-text-secondary">–</span>
              {numberInput(c.maxValue, (n) => update(c.id, { maxValue: n }), "Máx")}
            </>
          )}

          {c.mode === "comparativa" && (
            <>
              <select
                value={c.operator ?? COMPARISON_OPERATORS[0]}
                disabled={disabled}
                onChange={(e) => update(c.id, { operator: e.target.value as ComparisonOperator })}
                className="h-7 rounded border border-border px-1.5 text-[11px] bg-card focus:outline-none focus:border-primary disabled:opacity-50"
              >
                {COMPARISON_OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {numberInput(c.numericValue, (n) => update(c.id, { numericValue: n }), "Valor", "w-24")}
            </>
          )}

          {(c.mode === "igualdad" || c.mode === "no_igualdad") && (
            <input
              value={c.textValue ?? ""}
              disabled={disabled}
              placeholder="Valor"
              onChange={(e) => update(c.id, { textValue: e.target.value })}
              className="w-32 h-7 rounded border border-border px-1.5 text-[11px] focus:outline-none focus:border-primary disabled:opacity-50"
            />
          )}

          {(c.mode === "pertenencia" || c.mode === "no_pertenencia") && (
            <div className="min-w-[180px]">
              <TagInput value={c.values} onChange={(v) => update(c.id, { values: v })} placeholder="Valores…" />
            </div>
          )}

          <span className="text-[11px] text-text-secondary">→ salida</span>
          <input
            value={c.output}
            disabled={disabled}
            placeholder="Ej: bajo"
            onChange={(e) => update(c.id, { output: e.target.value })}
            className="w-28 h-7 rounded border border-border px-1.5 text-[11px] font-medium focus:outline-none focus:border-primary disabled:opacity-50"
          />

          <button
            type="button"
            disabled={disabled}
            onClick={() => remove(c.id)}
            className="ml-auto p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
      >
        <Plus className="h-3 w-3" /> Agregar criterio
      </button>
    </div>
  );
}
