import { useRef } from "react";

import { type DetectorConfig } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { AgentToolsSection } from "./shared/AgentToolsSection";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Detector agent (Wave 6) ────────────────────────────
   Runs before Clasificación (see SegmentAgentSection.tsx's subtab order),
   immediately followed by its own adversarial critique. Tool block is the
   shared AgentToolsSection (identical in all four ReAct steps); here
   XGBoost decides (`xgboostDecides`), elsewhere it's evidence only. */

export function SegmentDetectorSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: DetectorConfig;
  onChange: (value: DetectorConfig) => void;
  extraVariables: string[];
  disabled?: boolean;
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
        xgboostDecides
        description="Qué puede consultar el agente detector al evaluar una alerta."
      />

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt del detector</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Las variables entre llaves, ej. <code>{"{taxonomía}"}</code>, se resaltan
            automáticamente.
          </p>
        </div>
        <div className="p-6">
          <Field
            label="Etiquetas de salida"
            hint="Valores válidos que debe devolver el detector, separados por coma."
          >
            <input
              value={value.outputLabels.join(", ")}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  outputLabels: e.target.value
                    .split(",")
                    .map((label) => label.trim())
                    .filter(Boolean),
                })
              }
              placeholder="detected, not-detected"
              className="w-full h-9 rounded-md border border-border px-3 text-[13px]"
            />
            {value.outputLabels.length === 0 && (
              <p className="mt-2 text-[12px] text-danger">
                Debes definir etiquetas de salida para validar y reintentar la detección.
              </p>
            )}
          </Field>
          <div className="mt-5">
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
                placeholder="Ej: Evalúa si la alerta amerita una investigación más profunda usando {perfil_usuario} y el historial disponible."
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
