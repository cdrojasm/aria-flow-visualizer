import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { Switch } from "@/components/ui/switch";
import {
  BUILT_IN_TOOLS,
  BUILT_IN_TOOL_DESCRIPTIONS,
  BUILT_IN_TOOL_LABELS,
  type BuiltInTool,
  type DetectorConfig,
} from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { getModels } from "@/lib/api/models.functions";
import { Field, VariablePicker, VectorStoreToolField } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Detector agent (Wave 6) ────────────────────────────
   Runs before Clasificación (see SegmentAgentSection.tsx's subtab order),
   immediately followed by its own adversarial critique - that step reuses
   SegmentAdversarialSection directly (generalized to take a `tools` prop),
   wired in SegmentAgentSection.tsx, no separate component needed. Same
   vector-store/built-in tool categories as Clasificación, plus two
   detector-specific tools: an XGBoost model (own inline model-version
   picker, same query/filter/select as SegmentModelSection.tsx - inlined
   here rather than extracted since this is the only consumer today) and
   free-form pandas queries over the alert's transaction-history dataframe. */

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

  const modelsQuery = useQuery({ queryKey: ["models"], queryFn: getModels });
  const readyModels = (modelsQuery.data ?? []).filter((m) => m.status === "READY");

  const toggleBuiltInTool = (tool: BuiltInTool) =>
    onChange({
      ...value,
      builtInTools: value.builtInTools.includes(tool)
        ? value.builtInTools.filter((t) => t !== tool)
        : [...value.builtInTools, tool],
    });

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Herramientas del agente</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Qué puede consultar el agente detector al evaluar una alerta.
          </p>
        </div>
        <div className="p-6 space-y-5">
          <VectorStoreToolField
            value={value.vectorStoreTools}
            onChange={(vectorStoreTools) => onChange({ ...value, vectorStoreTools })}
            versionId={value.vectorStoreVersionId}
            onVersionChange={(vectorStoreVersionId) => onChange({ ...value, vectorStoreVersionId })}
            disabled={disabled}
          />
          <Field
            label="Herramientas básicas"
            hint="Utilidades adicionales disponibles para el agente."
          >
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_TOOLS.map((tool) => {
                const active = value.builtInTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    disabled={disabled}
                    title={BUILT_IN_TOOL_DESCRIPTIONS[tool]}
                    onClick={() => toggleBuiltInTool(tool)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-primary text-white border-primary"
                        : "border-border text-text-secondary hover:border-primary hover:text-primary"
                    }`}
                  >
                    {BUILT_IN_TOOL_LABELS[tool]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-text-primary">
                Consultas sobre historial (pandas)
              </p>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Permite al agente hacer consultas libres sobre el dataframe de historial de la
                alerta.
              </p>
            </div>
            <Switch
              checked={value.enablePandasHistoryTool}
              onCheckedChange={(checked) =>
                onChange({ ...value, enablePandasHistoryTool: checked })
              }
              disabled={disabled}
            />
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-[13px] font-medium text-text-primary">Modelo XGBoost</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Permite al agente consultar un modelo entrenado (vía el servicio MCP) al evaluar
                  la alerta.
                </p>
              </div>
              <Switch
                checked={value.useXgboostModel}
                onCheckedChange={(checked) =>
                  onChange({
                    ...value,
                    useXgboostModel: checked,
                    xgboostModelId: checked ? value.xgboostModelId : null,
                  })
                }
                disabled={disabled}
              />
            </div>
            {value.useXgboostModel && (
              <Field label="Modelo" hint="Solo se listan modelos con estado Listo.">
                <select
                  value={value.xgboostModelId ?? ""}
                  onChange={(e) => onChange({ ...value, xgboostModelId: e.target.value || null })}
                  disabled={disabled}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50"
                >
                  <option value="">Sin modelo asignado</option>
                  {readyModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tag}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt del detector</h2>
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
      </section>
    </div>
  );
}
