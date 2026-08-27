import { Clock } from "lucide-react";

import { type SamplingIntervalUnit, type SegmentMonitoringConfig } from "@/data/configs";
import { LimitField, SamplingDistributionEditor } from "./shared/FormControls";

/* ─── Sampling config for one segment ───────────────────
   Items 1+2 of what used to be the combined "Monitoreo" section
   (SegmentMonitoringSection.tsx, now split into this + SegmentEvaluationSection)
   - how often ARIA samples the operation, and which filters/distribution
   the sample follows. Now its own top-level "Muestreo" tab. */

export function SegmentSamplingSection({
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
      <div className="space-y-6">
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">1. Intervalo de muestreo</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Cada cuánto tiempo ARIA toma una muestra de la operación para evaluarla.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 max-w-xs">
              <Clock className="h-4 w-4 text-text-secondary shrink-0" />
              <input type="number" min={1} value={value.samplingIntervalValue}
                onChange={(e) => onChange({ samplingIntervalValue: Number(e.target.value) })}
                className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
              <select value={value.samplingIntervalUnit}
                onChange={(e) => onChange({ samplingIntervalUnit: e.target.value as SamplingIntervalUnit })}
                className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Días</option>
              </select>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">2. Filtros y distribución de la muestra</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Criterios de muestreo (canal, monto, hora, resultado, …) y el porcentaje de la muestra que corresponde a cada valor.</p>
          </div>
          <div className="p-6 space-y-5">
            <SamplingDistributionEditor value={value.samplingCriteria} onChange={(v) => onChange({ samplingCriteria: v })} />
            <div className="pt-2 border-t border-border">
              <LimitField label="Máximo de muestras por intervalo" hint="Tope de alertas tomadas en cada intervalo de muestreo, tras aplicar filtros y distribución." value={value.maxSamples} onChange={(v) => onChange({ maxSamples: v })} min={1} max={5000} suffix="muestras" />
            </div>
          </div>
        </section>
      </div>
    </fieldset>
  );
}
