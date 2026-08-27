import { Switch } from "@/components/ui/switch";
import {
  BUILT_IN_TOOL_LABELS,
  VECTOR_STORE_TOOL_LABELS,
  type AdversarialConfig,
  type ClassificationConfig,
} from "@/data/configs";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor } from "./shared/PromptEditor";

/* ─── Adversarial agent (Phase 4) ────────────────────────
   No tool picker of its own - it can use whatever tools Classification
   already has configured (shown read-only here) plus Classification's
   chain-of-thought. Configures how many reclassification cycles run and
   whether Classification receives the adversarial feedback as input. */

export function SegmentAdversarialSection({
  value,
  classification,
  onChange,
  disabled,
}: {
  value: AdversarialConfig;
  classification: ClassificationConfig;
  onChange: (value: AdversarialConfig) => void;
  disabled?: boolean;
}) {
  const hasTools = classification.vectorStoreTools.length > 0 || classification.builtInTools.length > 0;

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Herramientas disponibles</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">El agente adversarial reutiliza las herramientas y el CoT ya configurados en Clasificación — no tiene selección propia.</p>
        </div>
        <div className="p-6">
          {!hasTools && <p className="text-[12px] text-text-secondary">Sin herramientas configuradas todavía en Clasificación.</p>}
          <div className="flex flex-wrap gap-1.5">
            {classification.vectorStoreTools.map((tool) => (
              <span key={tool} className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-surface border border-border text-text-secondary">
                {VECTOR_STORE_TOOL_LABELS[tool]}
              </span>
            ))}
            {classification.builtInTools.map((tool) => (
              <span key={tool} className="px-3 py-1.5 rounded-full text-[12px] font-medium bg-surface border border-border text-text-secondary">
                {BUILT_IN_TOOL_LABELS[tool]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Prompt adversarial</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Intenta refutar o poner a prueba la clasificación obtenida.</p>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Prompt">
            <PromptEditor
              value={value.prompt}
              onChange={(prompt) => onChange({ ...value, prompt })}
              rows={5}
              disabled={disabled}
              placeholder="Ej: Cuestiona la clasificación asignada usando {red_flag_detectada} y el razonamiento de {prompt_clasificacion}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker value={value.promptVars} onChange={(promptVars) => onChange({ ...value, promptVars })} />
            </div>
          </Field>

          <div className="pt-2 border-t border-border">
            <Field label="Ciclos de reclasificación" hint="Cuántas veces se repite el ciclo adversarial antes de fijar la clasificación final.">
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

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-text-primary">Retroalimentar a Clasificación</p>
              <p className="text-[12px] text-text-secondary mt-0.5">Cuando existe feedback del ciclo adversarial, se incluye como input adicional al reclasificar.</p>
            </div>
            <Switch
              checked={value.feedFeedbackToClassification}
              onCheckedChange={(checked) => onChange({ ...value, feedFeedbackToClassification: checked })}
              disabled={disabled}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
