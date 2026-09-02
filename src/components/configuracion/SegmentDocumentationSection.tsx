import { useRef } from "react";

import type { DocumentationConfig, DocumentationStrategy } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken } from "./shared/promptTokens";

const STRATEGY_OPTIONS: { key: DocumentationStrategy; label: string }[] = [
  { key: "template", label: "Plantilla" },
  { key: "agent", label: "Agente" },
];

/* ─── Documentación (Phase 5) ───────────────────────────
   "One of the both components will be activated" - only the fields
   matching `value.strategy` are editable; the other pair stays visible
   but disabled, so switching back and forth doesn't lose what was typed. */

export function SegmentDocumentationSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: DocumentationConfig;
  onChange: (value: DocumentationConfig) => void;
  extraVariables: string[];
  disabled?: boolean;
}) {
  const templateRef = useRef<PromptEditorHandle>(null);
  const agentPromptRef = useRef<PromptEditorHandle>(null);
  const { variables } = useVariableCatalog();
  const pool = [...variables, ...extraVariables];

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Estrategia de documentación</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Solo uno de los dos componentes se activa a la vez para generar la documentación final de la alerta.
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-1 w-fit">
            {STRATEGY_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => onChange({ ...value, strategy: o.key })}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 ${
                  value.strategy === o.key ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={`bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${value.strategy !== "template" ? "opacity-60" : ""}`}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Plantilla estática</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Texto con variables que se rellena directamente, sin pasar por un agente.</p>
        </div>
        <div className="p-6 space-y-3">
          <Field label="Plantilla">
            <PromptEditor
              ref={templateRef}
              value={value.template}
              onChange={(template) => onChange({ ...value, template })}
              rows={5}
              disabled={disabled || value.strategy !== "template"}
              placeholder="Ej: Alerta clasificada como {taxonomia_asignada}, resultado final: {resultado_final}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles</p>
              <VariablePicker
                value={value.templateVars}
                onChange={(templateVars) => onChange({ ...value, templateVars })}
                pool={pool}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(value.template, templateRef.current?.getSelection() ?? null, `{${v}}`);
                  onChange({ ...value, template: next, templateVars: [...value.templateVars, v] });
                  templateRef.current?.focusAt(cursor);
                }}
              />
            </div>
          </Field>
        </div>
      </section>

      <section className={`bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${value.strategy !== "agent" ? "opacity-60" : ""}`}>
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Agente de documentación</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">El agente redacta la documentación final a partir de este prompt.</p>
        </div>
        <div className="p-6 space-y-3">
          <Field label="Prompt">
            <PromptEditor
              ref={agentPromptRef}
              value={value.agentPrompt}
              onChange={(agentPrompt) => onChange({ ...value, agentPrompt })}
              rows={5}
              disabled={disabled || value.strategy !== "agent"}
              placeholder="Ej: Redacta un resumen de la alerta usando {cot_cadena_de_razonamiento} y {taxonomia_asignada}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles</p>
              <VariablePicker
                value={value.agentPromptVars}
                onChange={(agentPromptVars) => onChange({ ...value, agentPromptVars })}
                pool={pool}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(value.agentPrompt, agentPromptRef.current?.getSelection() ?? null, `{${v}}`);
                  onChange({ ...value, agentPrompt: next, agentPromptVars: [...value.agentPromptVars, v] });
                  agentPromptRef.current?.focusAt(cursor);
                }}
              />
            </div>
          </Field>
        </div>
      </section>
    </div>
  );
}
