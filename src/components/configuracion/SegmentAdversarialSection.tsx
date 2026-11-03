import { useRef } from "react";

import { Switch } from "@/components/ui/switch";
import { type AdversarialConfig } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { AgentToolsSection } from "./shared/AgentToolsSection";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Adversarial agent (Phase 4, generalized Wave 6) ────
   Has its own tool selection (shared AgentToolsSection, read by the
   backend independently of the paired agent's) plus that agent's
   chain-of-thought. The same component backs both Clasificación's
   Adversarial and Detector's Adversarial - item 7 requires the two to
   share identical parameters, so reusing one component is both less code
   and a correctness guarantee.
   `showMaxThoughtIterations` is only set true for the Detector instance
   (see SegmentAgentSection.tsx). Configures how many reclassification
   cycles run and whether the paired agent receives the adversarial
   feedback as input. */

export function SegmentAdversarialSection({
  value,
  onChange,
  extraVariables,
  disabled,
  showMaxThoughtIterations,
}: {
  value: AdversarialConfig & { maxThoughtIterations?: number };
  onChange: (value: AdversarialConfig & { maxThoughtIterations?: number }) => void;
  extraVariables: string[];
  disabled?: boolean;
  showMaxThoughtIterations?: boolean;
}) {
  const promptRef = useRef<PromptEditorHandle>(null);
  const { variables } = useVariableCatalog();
  const pool = [...variables, ...extraVariables];

  return (
    <div className="space-y-6">
      <AgentToolsSection
        value={value}
        onChange={onChange}
        pool={pool}
        disabled={disabled}
        description="Selecciona las fuentes y utilidades que el adversarial puede usar para cuestionar el resultado."
      />

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt adversarial</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Intenta refutar o poner a prueba la clasificación obtenida.
          </p>
        </div>
        <div className="p-6 space-y-5">
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
              placeholder="Ej: Cuestiona la clasificación asignada usando {red_flag_detectada} y el razonamiento de {prompt_clasificacion}."
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

          <div className="pt-2 border-t border-border">
            <Field
              label="Ciclos de reclasificación"
              hint="Cuántas veces se repite el ciclo adversarial antes de fijar la clasificación final."
            >
              <input
                type="number"
                min={1}
                max={10}
                value={value.maxCycles}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, maxCycles: Number(e.target.value) })}
                className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </Field>
          </div>

          {showMaxThoughtIterations && (
            <div className="pt-2 border-t border-border">
              <Field
                label="Máximo de iteraciones de pensamiento"
                hint="Cuántos ciclos de razonamiento con herramientas puede hacer el agente antes de responder."
              >
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={value.maxThoughtIterations ?? 5}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({ ...value, maxThoughtIterations: Number(e.target.value) })
                  }
                  className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary disabled:opacity-50"
                />
              </Field>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-text-primary">
                Retroalimentar al agente asociado
              </p>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Cuando existe feedback del ciclo adversarial, se incluye como input adicional al
                reevaluar.
              </p>
            </div>
            <Switch
              checked={value.feedFeedbackToClassification}
              onCheckedChange={(checked) =>
                onChange({ ...value, feedFeedbackToClassification: checked })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
