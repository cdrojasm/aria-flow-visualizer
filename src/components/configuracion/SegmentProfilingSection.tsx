import { useRef, type MutableRefObject } from "react";

import { FeatureRecipeWorkspace } from "@/components/modelos/FeatureRecipeWorkspace";
import { Switch } from "@/components/ui/switch";
import {
  PROFILING_STRATEGY_KEYS,
  PROFILING_STRATEGY_LABELS,
  type ProfilingConfig,
  type ProfilingPromptMode,
  type ProfilingStrategy,
  type ProfilingStrategyKey,
} from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { Field, VariablePicker } from "./shared/FormControls";
import { spliceToken } from "./shared/promptTokens";

const MAIN_PROMPT_MODE_OPTIONS: { key: ProfilingPromptMode; label: string }[] = [
  { key: "fstring", label: "F-string (sin LLM)" },
  { key: "llm", label: "Prompt (LLM)" },
];

/* ─── Profiling chain ─────────────────────────────────────
   fieldEnrichment = "data enrichment": the same feature-recipe engine
   modelos/ uses for training (see FeatureRecipeWorkspace), reused here to
   compute named variables from the alert's own fields and its transaction
   history. Each enabled recipe's `name` is citable from this segment's own
   profiling prompts below (see SegmentAgentSection.tsx's
   enrichmentVariables for how it's surfaced to the other agent-tab prompt
   pickers too - though only Perfilamiento's prompts actually resolve
   {variable} tokens today, see alert_review_workflow.py's _run_profiling). */

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
      {/* FeatureRecipeWorkspace has no disabled prop of its own (it's always
          editable in modelos/, which has no read-only historical view) - a
          native <fieldset disabled> reaches every control inside it without
          touching that shared component, same technique this file already
          uses below for mainPromptMode === "fstring". */}
      <fieldset disabled={disabled}>
        <FeatureRecipeWorkspace
          value={value.fieldEnrichment}
          onChange={(fieldEnrichment) => onChange({ ...value, fieldEnrichment })}
          dataset=""
          target=""
          availableFields={variables}
          onValidity={() => {}}
        />
      </fieldset>

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
