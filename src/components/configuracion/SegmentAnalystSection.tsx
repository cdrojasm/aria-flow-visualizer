import { useRef, useState } from "react";

import { ANALYST_PROMPT_VARIABLES, type AnalystConfig } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { MarcacionCatalogManager } from "./MarcacionCatalogManager";
import { ResolutionMethodCatalogManager } from "./ResolutionMethodCatalogManager";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Analista ───────────────────────────────────────────
   Mirrors backend's AnalystConfig: one prompt with instructions for handling
   the alert. The playbook is no longer a per-segment list - it's library
   knowledge (Biblioteca), resolved at runtime and injected into this prompt
   as {playbook}, alongside {modus_operandi}, {voicebot_resources} and
   {analyst_resources} (see ANALYST_PROMPT_VARIABLES). The resolution-method
   and marcación catalogs stay reachable from here since the prompt decides
   which of them the agent applies. */

export function SegmentAnalystSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: AnalystConfig;
  onChange: (value: AnalystConfig) => void;
  extraVariables: string[];
  disabled?: boolean;
}) {
  const promptRef = useRef<PromptEditorHandle>(null);
  const { variables } = useVariableCatalog();
  const pool = [...ANALYST_PROMPT_VARIABLES, ...variables, ...extraVariables];
  const [showCatalog, setShowCatalog] = useState(false);
  const [showResolutionCatalog, setShowResolutionCatalog] = useState(false);

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt del analista</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Instrucciones para resolver la alerta: el agente elige el{" "}
            <button
              type="button"
              onClick={() => setShowResolutionCatalog(true)}
              className="text-primary hover:underline"
            >
              método de resolución
            </button>{" "}
            y, al resolver con ARIA, la categoría de{" "}
            <button
              type="button"
              onClick={() => setShowCatalog(true)}
              className="text-primary hover:underline"
            >
              marcación
            </button>
            . El playbook se toma de Biblioteca y está disponible como {"{playbook}"}.
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
              rows={8}
              disabled={disabled}
              placeholder="Ej: Con base en {modus_operandi} y siguiendo {playbook}, decide si escalar usando {analyst_resources} o llamar al cliente con {voicebot_resources}."
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
      </section>

      <MarcacionCatalogManager open={showCatalog} onOpenChange={setShowCatalog} />
      <ResolutionMethodCatalogManager
        open={showResolutionCatalog}
        onOpenChange={setShowResolutionCatalog}
      />
    </div>
  );
}
