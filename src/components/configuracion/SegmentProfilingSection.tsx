import { Plus, Trash2, X } from "lucide-react";
import { useRef, useState, type MutableRefObject } from "react";

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
  type ProfilingPromptMode,
  type ProfilingStrategy,
  type ProfilingStrategyKey,
} from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { Field, TagInput, VariablePicker } from "./shared/FormControls";
import { spliceToken } from "./shared/promptTokens";

const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  cuantizable: "Cuantizable",
  categorico: "Categórico",
};

const MAIN_PROMPT_MODE_OPTIONS: { key: ProfilingPromptMode; label: string }[] = [
  { key: "fstring", label: "F-string (sin LLM)" },
  { key: "llm", label: "Prompt (LLM)" },
];

/* ─── Profiling chain (Phase 3) ──────────────────────────
   Field categorization = "data enrichment": each categorized field
   (cuantizable/categórico) produces a named outputVariable (the
   transformed/derived value, distinct from the original field) that's
   citable from every agent prompt in the segment, not just the 3-step
   profiling chain (usuario -> transaccion -> transaccional) below it -
   see SegmentAgentSection.tsx's enrichmentVariables. */

export function SegmentProfilingSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: ProfilingConfig;
  onChange: (value: ProfilingConfig) => void;
  // Enrichment variables (from this segment's field categorizations) -
  // computed once by SegmentAgentSection and handed down, same list every
  // other agent-tab prompt gets.
  extraVariables: string[];
  disabled?: boolean;
}) {
  const { variables } = useVariableCatalog();
  const pool = [...variables, ...extraVariables];

  const updateStrategy = (index: number, patch: Partial<ProfilingStrategy>) => {
    const strategies = value.strategies.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange({ ...value, strategies });
  };

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Enriquecimiento de la data</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Marca cada campo como cuantizable (numérico) o categórico y nombra la variable que produce su versión transformada — queda disponible, junto con el campo original, en todos los prompts de esta configuración de agente.</p>
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
          <p className="text-[12px] text-text-secondary mt-0.5">Tres estrategias, ejecutadas en este orden. Todas pueden referenciar las variables base y las de enriquecimiento de arriba.</p>
        </div>
        {PROFILING_STRATEGY_KEYS.map((key, index) => {
          const strategy = value.strategies.find((s) => s.key === key) ?? value.strategies[index];
          return (
            <ProfilingStrategyCard
              key={key}
              index={index}
              strategyKey={key}
              strategy={strategy}
              pool={pool}
              disabled={disabled}
              onUpdate={(patch) => updateStrategy(index, patch)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Own component (not inlined in the .map() above) so each of the 3
// strategies owns its own textarea refs/cursor state for the "insert
// variable at cursor" wiring - plain useRef inside a loop body would break
// the rules of hooks, but a fixed-size list of component instances is fine.
function ProfilingStrategyCard({
  index,
  strategyKey,
  strategy,
  pool,
  disabled,
  onUpdate,
}: {
  index: number;
  strategyKey: ProfilingStrategyKey;
  strategy: ProfilingStrategy;
  pool: string[];
  disabled?: boolean;
  onUpdate: (patch: Partial<ProfilingStrategy>) => void;
}) {
  const mainPromptRef = useRef<HTMLTextAreaElement>(null);
  const mainPromptSelection = useRef<{ start: number; end: number } | null>(null);
  const categorizationPromptRef = useRef<HTMLTextAreaElement>(null);
  const categorizationPromptSelection = useRef<{ start: number; end: number } | null>(null);

  // Patches the prompt text and its promptVars list in ONE onUpdate call -
  // two separate onUpdate calls in the same tick would each close over the
  // same pre-update `strategy`/`value.strategies` and the second would
  // clobber the first (stale-closure double setState).
  const insertToken = (
    el: HTMLTextAreaElement | null,
    selection: { start: number; end: number } | null,
    selectionRef: MutableRefObject<{ start: number; end: number } | null>,
    promptField: "mainPrompt" | "categorizationPrompt",
    varsField: "mainPromptVars" | "categorizationPromptVars",
    variable: string,
  ) => {
    const { next, cursor } = spliceToken(strategy[promptField], selection, `{${variable}}`);
    onUpdate({ [promptField]: next, [varsField]: [...strategy[varsField], variable] } as Partial<ProfilingStrategy>);
    selectionRef.current = { start: cursor, end: cursor };
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-[13px] font-semibold text-text-primary">
          {index + 1}. {PROFILING_STRATEGY_LABELS[strategyKey]}
        </h3>
      </div>
      <div className="p-6 space-y-5">
        <Field label="Prompt principal">
          <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-1 w-fit mb-2">
            {MAIN_PROMPT_MODE_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => onUpdate({ mainPromptMode: o.key })}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  strategy.mainPromptMode === o.key ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-secondary mb-1.5">
            {strategy.mainPromptMode === "fstring"
              ? "Sin LLM: los placeholders {variable} se sustituyen directamente por su valor y el resultado se usa tal cual."
              : "Se envía a un LLM como prompt; algunas secciones se reemplazan por variables antes de enviarlo."}
          </p>
          <textarea
            ref={mainPromptRef}
            value={strategy.mainPrompt}
            onChange={(e) => onUpdate({ mainPrompt: e.target.value })}
            onSelect={(e) => { mainPromptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
            onFocus={(e) => { mainPromptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
            rows={3}
            disabled={disabled}
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none disabled:opacity-50"
          />
          <div className="mt-2">
            <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles (catálogo + variables de enriquecimiento)</p>
            <VariablePicker
              value={strategy.mainPromptVars}
              onChange={(v) => onUpdate({ mainPromptVars: v })}
              pool={pool}
              onInsert={(v) =>
                insertToken(
                  mainPromptRef.current,
                  mainPromptSelection.current,
                  mainPromptSelection,
                  "mainPrompt",
                  "mainPromptVars",
                  v,
                )
              }
            />
          </div>
        </Field>

        <fieldset
          disabled={disabled || strategy.mainPromptMode === "fstring"}
          className={`contents ${strategy.mainPromptMode === "fstring" ? "opacity-60" : ""}`}
        >
          <Field
            label="Prompt de categorización (LLM)"
            hint={
              strategy.mainPromptMode === "fstring"
                ? "Deshabilitado: el prompt principal de esta estrategia es f-string (sin LLM), así que no hay modelo corriendo que categorice/cuantice nada."
                : "Sub-prompt siempre ejecutado a través de un LLM para categorizar/cuantizar valores."
            }
          >
            <textarea
              ref={categorizationPromptRef}
              value={strategy.categorizationPrompt}
              onChange={(e) => onUpdate({ categorizationPrompt: e.target.value })}
              onSelect={(e) => { categorizationPromptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              onFocus={(e) => { categorizationPromptSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }}
              rows={3}
              placeholder="Ej: Dado el historial transaccional, clasifica el riesgo del usuario como bajo, medio o alto."
              className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none disabled:opacity-50"
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles (catálogo + variables de enriquecimiento)</p>
              <VariablePicker
                value={strategy.categorizationPromptVars}
                onChange={(v) => onUpdate({ categorizationPromptVars: v })}
                pool={pool}
                onInsert={(v) =>
                  insertToken(
                    categorizationPromptRef.current,
                    categorizationPromptSelection.current,
                    categorizationPromptSelection,
                    "categorizationPrompt",
                    "categorizationPromptVars",
                    v,
                  )
                }
              />
            </div>
          </Field>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-text-primary">Historial de alertas vía pandas (MCP)</p>
              <p className="text-[12px] text-text-secondary mt-0.5">El LLM de categorización puede consultar el historial de alertas del cliente vía pandas, expuesto como herramienta MCP.</p>
            </div>
            <Switch
              checked={strategy.usePandasHistoryMcp}
              onCheckedChange={(checked) => onUpdate({ usePandasHistoryMcp: checked })}
              disabled={disabled || strategy.mainPromptMode === "fstring"}
            />
          </div>
        </fieldset>
      </div>
    </section>
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
    onChange([...value, { field: newField, kind: newKind, criteria: [], outputVariable: `${newField}_enriquecido` }]);
    setNewField("");
  };

  const remove = (field: string) => onChange(value.filter((fc) => fc.field !== field));

  const setKind = (field: string, kind: FieldKind) =>
    // Criteria modes are kind-specific (intervalo/comparativa vs.
    // igualdad/pertenencia), so switching kind drops the now-invalid ones.
    onChange(value.map((fc) => (fc.field === field ? { ...fc, kind, criteria: [] } : fc)));

  const setCriteria = (field: string, criteria: FieldCriterion[]) =>
    onChange(value.map((fc) => (fc.field === field ? { ...fc, criteria } : fc)));

  const setOutputVariable = (field: string, outputVariable: string) =>
    onChange(value.map((fc) => (fc.field === field ? { ...fc, outputVariable } : fc)));

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-[12px] text-text-secondary">Sin campos enriquecidos.</p>}
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
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[11px] text-text-secondary shrink-0">Variable de enriquecimiento (transformada):</span>
              <input
                value={fc.outputVariable}
                disabled={disabled}
                placeholder="Ej: saldo_riesgo"
                onChange={(e) => setOutputVariable(fc.field, e.target.value)}
                className="flex-1 min-w-0 h-7 rounded border border-border px-2 text-[12px] font-mono focus:outline-none focus:border-primary disabled:opacity-50"
              />
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
