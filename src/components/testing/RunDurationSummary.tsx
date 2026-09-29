import type { DurationStats } from "@/lib/api/testing.functions";

import { formatDuration } from "./formatDuration";
import { InfoHint } from "./Hint";
import { LegendStat } from "./LegendStat";
import { PIPELINE_STEP_LABELS, sortByPipelineOrder } from "./pipelineSteps";

function formatShare(value: number): string {
  return `${Math.round(value)}% del promedio por caso`;
}

// Promedio de trabajo real por caso: suma de todas las ejecuciones de etapas entre casos terminados.
function processingPerCase(total: DurationStats, steps: [string, DurationStats][]): number {
  const busySeconds = steps.reduce((sum, [, stats]) => sum + stats.avg_seconds * stats.count, 0);
  return Math.min(total.avg_seconds, total.count > 0 ? busySeconds / total.count : 0);
}

export function RunDurationSummary({
  totalStats,
  stepStats,
}: {
  totalStats: DurationStats | null;
  stepStats: Record<string, DurationStats>;
}) {
  const steps = sortByPipelineOrder(Object.entries(stepStats));
  const processing = totalStats ? processingPerCase(totalStats, steps) : 0;
  const processingShare =
    totalStats && totalStats.avg_seconds > 0 ? (processing / totalStats.avg_seconds) * 100 : 0;
  const waitingShare = 100 - processingShare;

  return (
    <div>
      {totalStats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <LegendStat
              label="Casos terminados"
              value={totalStats.count}
              caption="Base de los tiempos por caso"
              hint="Casos que ya terminaron. Sobre ellos se calculan el 95%, el promedio, el más rápido y el más lento."
            />
            <LegendStat
              label="Procesamiento"
              hint="Tiempo de trabajo real por caso: suma de lo que tardaron sus etapas, en promedio."
              value={formatDuration(processing)}
              caption={formatShare(processingShare)}
              colorClass="border-primary text-primary"
            />
            <LegendStat
              label="Espera y reintentos"
              hint="Tiempo en cola de Celery y pausas entre reintentos automáticos."
              value={formatDuration(totalStats.avg_seconds - processing)}
              caption={formatShare(waitingShare)}
              colorClass="border-text-secondary text-text-secondary"
            />
            <LegendStat
              label="Promedio por caso"
              value={formatDuration(totalStats.avg_seconds)}
              caption="Por caso, de principio a fin"
            />
            <LegendStat label="Caso más rápido" value={formatDuration(totalStats.min_seconds)} />
            <LegendStat label="Caso más lento" value={formatDuration(totalStats.max_seconds)} />
          </div>
        </>
      )}

      {steps.length > 0 && <StepDurationTable steps={steps} separated={!!totalStats} />}
    </div>
  );
}

function StepDurationTable({
  steps,
  separated,
}: {
  steps: [string, DurationStats][];
  separated: boolean;
}) {
  const slowestP95 = Math.max(...steps.map(([, stats]) => stats.p95_seconds));
  return (
    <div className={separated ? "mt-5 pt-5 border-t border-border" : ""}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-[13px] font-semibold text-text-primary">Por etapa del pipeline</h3>
        <span className="text-[11px] text-text-secondary">
          Cada fila mide una ejecución del paso. Los reintentos cuentan como ejecuciones.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              <th className="font-semibold pr-3 py-2">Etapa</th>
              <th className="font-semibold pr-3 py-2 w-[34%]">
                <span className="inline-flex items-center gap-1">
                  95% tardó menos de
                  <InfoHint content="El 95% de las ejecuciones de la etapa tardó menos que este valor. La barra se compara con la etapa más lenta." />
                </span>
              </th>
              <th className="font-semibold pr-3 py-2 text-right">95%</th>
              <th className="font-semibold pr-3 py-2 text-right">Promedio</th>
              <th className="font-semibold pr-3 py-2 text-right">Más rápido</th>
              <th className="font-semibold pr-3 py-2 text-right">Más lento</th>
              <th className="font-semibold py-2 text-right">
                <span className="inline-flex items-center gap-1">
                  Ejecuciones
                  <InfoHint content="Veces que corrió la etapa, incluidos los reintentos automáticos." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {steps.map(([name, stats]) => {
              const isSlowest = stats.p95_seconds === slowestP95;
              return (
                <tr key={name} className="border-t border-border whitespace-nowrap">
                  <td className="pr-3 py-2.5 font-medium text-text-primary">
                    {PIPELINE_STEP_LABELS[name] ?? name}
                    {isSlowest && (
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-px rounded bg-primary-light text-primary">
                        Más lenta
                      </span>
                    )}
                  </td>
                  <td className="pr-3 py-2.5">
                    <div className="h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${isSlowest ? "bg-primary" : "bg-primary/35"}`}
                        style={{
                          width: `${slowestP95 > 0 ? (stats.p95_seconds / slowestP95) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td
                    className={`pr-3 py-2.5 text-right ${isSlowest ? "font-bold text-primary" : "text-text-primary"}`}
                  >
                    {formatDuration(stats.p95_seconds)}
                  </td>
                  <td className="pr-3 py-2.5 text-right text-text-primary">
                    {formatDuration(stats.avg_seconds)}
                  </td>
                  <td className="pr-3 py-2.5 text-right text-text-secondary">
                    {formatDuration(stats.min_seconds)}
                  </td>
                  <td className="pr-3 py-2.5 text-right text-text-secondary">
                    {formatDuration(stats.max_seconds)}
                  </td>
                  <td className="py-2.5 text-right text-text-secondary">{stats.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
