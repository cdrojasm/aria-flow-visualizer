import { EVALUATION_VARIABLES, type SegmentMonitoringConfig } from "@/data/configs";
import { Field, VariablePicker } from "./shared/FormControls";

/* ─── Evaluation prompts for one segment ────────────────
   Item 3 of what used to be the combined "Monitoreo" section
   (SegmentMonitoringSection.tsx, now split into this + SegmentSamplingSection)
   - the prompts the monitoring agent uses to grade each sampled alert.
   Now its own top-level "Evaluación" tab. */

export function SegmentEvaluationSection({
  value,
  onChange,
  disabled,
}: {
  value: SegmentMonitoringConfig;
  onChange: (patch: Partial<SegmentMonitoringConfig>) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="contents">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Evaluación</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">Prompts e insumos que el agente de monitoreo usa para calificar cada muestra.</p>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Prompt de evaluación — Agente clasificación" hint="Instrucción usada para evaluar la calidad del agente de clasificación.">
            <textarea value={value.promptClasificacion} onChange={(e) => onChange({ promptClasificacion: e.target.value })} rows={4} placeholder="Ej: Evalúa si la taxonomía asignada es coherente con los indicadores de la alerta." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker value={value.promptClasificacionVars} onChange={(v) => onChange({ promptClasificacionVars: v })} pool={EVALUATION_VARIABLES} />
            </div>
          </Field>
          <Field label="Prompt de evaluación — Agente analista" hint="Instrucción usada para evaluar la calidad del agente analista.">
            <textarea value={value.promptAnalista} onChange={(e) => onChange({ promptAnalista: e.target.value })} rows={4} placeholder="Ej: Verifica que el análisis narrativo sea consistente con los datos disponibles y la taxonomía." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker value={value.promptAnalistaVars} onChange={(v) => onChange({ promptAnalistaVars: v })} pool={EVALUATION_VARIABLES} />
            </div>
          </Field>
          <Field label="Prompt de evaluación — Agente monitoreo" hint="Instrucción usada para evaluar la calidad del agente de monitoreo.">
            <textarea value={value.promptMonitoreo} onChange={(e) => onChange({ promptMonitoreo: e.target.value })} rows={4} placeholder="Ej: Comprueba que las alertas de baja prioridad descartadas realmente no representen riesgo." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker value={value.promptMonitoreoVars} onChange={(v) => onChange({ promptMonitoreoVars: v })} pool={EVALUATION_VARIABLES} />
            </div>
          </Field>
        </div>
      </section>
    </fieldset>
  );
}
