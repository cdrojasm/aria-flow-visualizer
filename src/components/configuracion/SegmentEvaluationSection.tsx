import { Clock } from "lucide-react";

import type { SamplingIntervalUnit, SegmentMonitoringConfig } from "@/data/configs";
import { mergeVariablePools, useVariableCatalog } from "@/hooks/useVariableCatalog";
import {
  Field,
  LimitField,
  SamplingDistributionEditor,
  VariablePicker,
} from "./shared/FormControls";

/* ─── Muestreo + Evaluación for one segment ─────────────
   Merged into a single top-level "Evaluación" tab: how often ARIA samples
   the operation and which filters/distribution the sample follows (former
   "Muestreo" tab, now sections 1+2 here), plus the prompts the monitoring
   agent uses to grade each sampled alert (section 3, the original content
   of this file). Both operate on the same SegmentMonitoringConfig. */

export function SegmentEvaluationSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: SegmentMonitoringConfig;
  onChange: (patch: Partial<SegmentMonitoringConfig>) => void;
  extraVariables: string[];
  disabled?: boolean;
}) {
  const { variables } = useVariableCatalog();
  const pool = mergeVariablePools(variables, extraVariables);

  return (
    <fieldset disabled={disabled} className="contents">
      <div className="space-y-6">
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">
              1. Intervalo de muestreo
            </h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Cada cuánto tiempo ARIA toma una muestra de la operación para evaluarla.
            </p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 max-w-xs">
              <Clock className="h-4 w-4 text-text-secondary shrink-0" />
              <input
                type="number"
                min={1}
                value={value.samplingIntervalValue}
                onChange={(e) => onChange({ samplingIntervalValue: Number(e.target.value) })}
                className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
              />
              <select
                value={value.samplingIntervalUnit}
                onChange={(e) =>
                  onChange({ samplingIntervalUnit: e.target.value as SamplingIntervalUnit })
                }
                className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
              >
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">
              2. Filtros y distribución de la muestra
            </h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Criterios de muestreo (canal, monto, hora, resultado, …) y el porcentaje de la muestra
              que corresponde a cada valor.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <SamplingDistributionEditor
              value={value.samplingCriteria}
              onChange={(v) => onChange({ samplingCriteria: v })}
            />
            <div className="pt-2 border-t border-border">
              <LimitField
                label="Máximo de muestras por intervalo"
                hint="Tope de alertas tomadas en cada intervalo de muestreo, tras aplicar filtros y distribución."
                value={value.maxSamples}
                onChange={(v) => onChange({ maxSamples: v })}
                min={1}
                max={5000}
                suffix="muestras"
              />
            </div>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">3. Evaluación</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Prompts e insumos que el agente de monitoreo usa para calificar cada muestra.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <Field
              label="Prompt de evaluación — Agente clasificación"
              hint="Instrucción usada para evaluar la calidad del agente de clasificación."
            >
              <textarea
                value={value.promptClasificacion}
                onChange={(e) => onChange({ promptClasificacion: e.target.value })}
                rows={4}
                placeholder="Ej: Evalúa si la taxonomía asignada es coherente con los indicadores de la alerta."
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
              />
              <div className="mt-2">
                <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                  Variables disponibles para este prompt
                </p>
                <VariablePicker
                  value={value.promptClasificacionVars}
                  onChange={(v) => onChange({ promptClasificacionVars: v })}
                  pool={pool}
                />
              </div>
            </Field>
            <Field
              label="Prompt de evaluación — Agente analista"
              hint="Instrucción usada para evaluar la calidad del agente analista."
            >
              <textarea
                value={value.promptAnalista}
                onChange={(e) => onChange({ promptAnalista: e.target.value })}
                rows={4}
                placeholder="Ej: Verifica que el análisis narrativo sea consistente con los datos disponibles y la taxonomía."
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
              />
              <div className="mt-2">
                <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                  Variables disponibles para este prompt
                </p>
                <VariablePicker
                  value={value.promptAnalistaVars}
                  onChange={(v) => onChange({ promptAnalistaVars: v })}
                  pool={pool}
                />
              </div>
            </Field>
            <Field
              label="Prompt de evaluación — Agente monitoreo"
              hint="Instrucción usada para evaluar la calidad del agente de monitoreo."
            >
              <textarea
                value={value.promptMonitoreo}
                onChange={(e) => onChange({ promptMonitoreo: e.target.value })}
                rows={4}
                placeholder="Ej: Comprueba que las alertas de baja prioridad descartadas realmente no representen riesgo."
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
              />
              <div className="mt-2">
                <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                  Variables disponibles para este prompt
                </p>
                <VariablePicker
                  value={value.promptMonitoreoVars}
                  onChange={(v) => onChange({ promptMonitoreoVars: v })}
                  pool={pool}
                />
              </div>
            </Field>
          </div>
        </section>
      </div>
    </fieldset>
  );
}
