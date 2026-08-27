import {
  BUILT_IN_TOOLS,
  BUILT_IN_TOOL_LABELS,
  VECTOR_STORE_TOOLS,
  VECTOR_STORE_TOOL_LABELS,
  type BuiltInTool,
  type ClassificationConfig,
  type VectorStoreTool,
} from "@/data/configs";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor } from "./shared/PromptEditor";

/* ─── Classification agent (Phase 4) ────────────────────
   Which tools (vector-store retrieval + built-ins) the classification
   agent can call, and its prompt - entered through the new highlighted
   f-string editor so {variable} tokens read clearly inline. */

export function SegmentClassificationSection({
  value,
  onChange,
  disabled,
}: {
  value: ClassificationConfig;
  onChange: (value: ClassificationConfig) => void;
  disabled?: boolean;
}) {
  const toggleVectorStoreTool = (tool: VectorStoreTool) =>
    onChange({
      ...value,
      vectorStoreTools: value.vectorStoreTools.includes(tool)
        ? value.vectorStoreTools.filter((t) => t !== tool)
        : [...value.vectorStoreTools, tool],
    });

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
          <p className="text-[12px] text-text-secondary mt-0.5">Qué puede consultar el agente de clasificación al evaluar una alerta.</p>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Base de conocimiento (vector store)" hint="Categorías que el agente puede buscar semánticamente.">
            <div className="flex flex-wrap gap-1.5">
              {VECTOR_STORE_TOOLS.map((tool) => {
                const active = value.vectorStoreTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleVectorStoreTool(tool)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 ${
                      active ? "bg-primary text-white border-primary" : "border-border text-text-secondary hover:border-primary hover:text-primary"
                    }`}
                  >
                    {VECTOR_STORE_TOOL_LABELS[tool]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Herramientas básicas" hint="Utilidades adicionales disponibles para el agente.">
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_TOOLS.map((tool) => {
                const active = value.builtInTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleBuiltInTool(tool)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 ${
                      active ? "bg-primary text-white border-primary" : "border-border text-text-secondary hover:border-primary hover:text-primary"
                    }`}
                  >
                    {BUILT_IN_TOOL_LABELS[tool]}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt de clasificación</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Las variables entre llaves, ej. <code>{"{taxonomía}"}</code>, se resaltan automáticamente.</p>
        </div>
        <div className="p-6">
          <Field label="Prompt">
            <PromptEditor
              value={value.prompt}
              onChange={(prompt) => onChange({ ...value, prompt })}
              rows={5}
              disabled={disabled}
              placeholder="Ej: Clasifica la alerta usando {perfil_usuario} y {taxonomias_disponibles}, devuelve la taxonomía y el modus operandi más probable."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker value={value.promptVars} onChange={(promptVars) => onChange({ ...value, promptVars })} />
            </div>
          </Field>
        </div>
      </section>
    </div>
  );
}
