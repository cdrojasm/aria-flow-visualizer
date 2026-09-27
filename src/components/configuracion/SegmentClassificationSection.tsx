import { useRef } from "react";

import { type ClassificationConfig } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { AgentToolsFields, Field, VariablePicker } from "./shared/FormControls";
import { Switch } from "@/components/ui/switch";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Classification agent (Phase 4) ────────────────────
   Which tools (vector-store retrieval + built-ins) the classification
   agent can call, and its prompt - entered through the new highlighted
   f-string editor so {variable} tokens read clearly inline. */

export function SegmentClassificationSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: ClassificationConfig;
  onChange: (value: ClassificationConfig) => void;
  // Enrichment variables from this segment's field categorizations
  // (Perfilamiento tab) - citable here too, see SegmentAgentSection.tsx.
  extraVariables: string[];
  disabled?: boolean;
}) {
  const promptRef = useRef<PromptEditorHandle>(null);
  const { variables } = useVariableCatalog();
  const pool = [...variables, ...extraVariables];

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Herramientas del agente</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Qué puede consultar el agente de clasificación al evaluar una alerta.
          </p>
        </div>
        <div className="p-6">
          <AgentToolsFields value={value} onChange={(patch) => onChange({ ...value, ...patch })} pool={pool} disabled={disabled} />
          <div className="pt-4 mt-4 border-t border-border space-y-3">
            <p className="text-[13px] font-medium text-text-primary">Investigación delegada</p>
            <p className="text-[12px] text-text-secondary">Se activa solo cuando la clasificación permanece inconclusa.</p>
            <div className="flex items-center justify-between"><span className="text-[13px]">Subagente Vector Store</span><Switch checked={value.delegatedResearch.vectorStore.enabled} onCheckedChange={(enabled) => onChange({ ...value, delegatedResearch: { ...value.delegatedResearch, vectorStore: { ...value.delegatedResearch.vectorStore, enabled, vectorStoreInstanceId: value.delegatedResearch.vectorStore.vectorStoreInstanceId ?? value.vectorStoreInstanceId } } })} disabled={disabled} /></div>
            <div className="flex items-center justify-between"><span className="text-[13px]">Subagente historial Pandas</span><Switch checked={value.delegatedResearch.historyPandas.enabled} onCheckedChange={(enabled) => onChange({ ...value, delegatedResearch: { ...value.delegatedResearch, historyPandas: { ...value.delegatedResearch.historyPandas, enabled } } })} disabled={disabled} /></div>
          </div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt de clasificación</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Las variables entre llaves, ej. <code>{"{taxonomía}"}</code>, se resaltan
            automáticamente.
          </p>
        </div>
        <div className="p-6">
          <Field label="Prompt">
            <PromptEditor
              ref={promptRef}
              value={value.prompt}
              onChange={(prompt) => onChange({ ...value, prompt })}
              onBlur={(prompt) =>
                onChange({
                  ...value,
                  promptVars: variablesInPrompt(prompt).filter((variable) =>
                    pool.includes(variable),
                  ),
                })
              }
              rows={5}
              disabled={disabled}
              placeholder="Ej: Clasifica la alerta usando {perfil_usuario} y {taxonomias_disponibles}, devuelve la taxonomía y el modus operandi más probable."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                Variables disponibles para este prompt
              </p>
              <VariablePicker
                value={value.promptVars}
                onChange={(promptVars) => onChange({ ...value, promptVars })}
                pool={pool}
                prompt={value.prompt}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(
                    value.prompt,
                    promptRef.current?.getSelection() ?? null,
                    `{${v}}`,
                  );
                  onChange({ ...value, prompt: next, promptVars: [...value.promptVars, v] });
                  promptRef.current?.focusAt(cursor);
                }}
              />
            </div>
          </Field>

          <div className="pt-2 border-t border-border mt-5">
            <Field label="Etiquetas de salida" hint="Valores válidos que debe devolver el prompt, separados por coma.">
              <input value={value.outputLabels.join(", ")} disabled={disabled}
                onChange={(e) => onChange({ ...value, outputLabels: e.target.value.split(",").map((label) => label.trim()).filter(Boolean) })}
                placeholder="risk, risk-suspected, no-risk" className="w-full h-9 rounded-md border border-border px-3 text-[13px]" />
              {value.outputLabels.length === 0 && <p className="mt-2 text-[12px] text-danger">Debes definir etiquetas de salida para validar y reintentar la clasificación.</p>}
            </Field>
          </div>
          <div className="pt-2 border-t border-border mt-5">
            <Field
              label="Máximo de iteraciones de pensamiento"
              hint="Cuántos ciclos de razonamiento con herramientas puede hacer el agente antes de responder."
            >
              <input
                type="number"
                min={1}
                max={15}
                value={value.maxThoughtIterations}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, maxThoughtIterations: Number(e.target.value) })
                }
                className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </Field>
          </div>
        </div>
      </section>
    </div>
  );
}
