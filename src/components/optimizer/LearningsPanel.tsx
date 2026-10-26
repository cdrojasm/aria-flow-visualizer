import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listOptimizerMemory,
  type AgentFinding,
  type OptimizerArea,
} from "@/lib/api/agent.functions";
import { AREA_LABEL } from "./labels";

const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

function percent(value: number | undefined) {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** What earlier sessions learned (only with enough evidence) and this session's aggregates. */
export function LearningsPanel({ findings }: { findings: AgentFinding[] }) {
  const [area, setArea] = useState<OptimizerArea>("model");
  const memory = useQuery({
    queryKey: ["optimizerMemory", area],
    queryFn: () => listOptimizerMemory(area),
    refetchInterval: 15_000,
  });
  return (
    <div className="space-y-5">
      <section aria-label="Aprendizajes respaldados por datos" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">
              Aprendizajes de sesiones anteriores
            </h3>
            <p className="text-[12px] text-text-secondary">
              Solo se guardan con al menos 30 casos. Cada sesión los vuelve a evaluar; no equivalen
              a una aprobación ni cambian producción.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-text-secondary">
            Área
            <select
              aria-label="Área de los aprendizajes"
              value={area}
              onChange={(event) => setArea(event.target.value as OptimizerArea)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-text-primary"
            >
              {Object.entries(AREA_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {memory.isLoading ? (
          <p className="text-[13px] text-text-secondary">Cargando aprendizajes…</p>
        ) : memory.isError ? (
          <p role="alert" className="text-[13px] text-danger">
            No se pudieron cargar los aprendizajes.
          </p>
        ) : (memory.data ?? []).length === 0 ? (
          <p
            data-testid="learnings-empty"
            className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary"
          >
            Aún no hay aprendizajes para {AREA_LABEL[area]}. Se guardan cuando un experimento
            validado tiene al menos 30 casos.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="learnings-list">
            {memory.data?.map((item) => (
              <li key={item.insight_id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-[13px] text-text-primary">{item.statement}</p>
                <p className="mt-1 text-[11px] text-text-secondary">
                  {item.sample_count.toLocaleString("es-CO")} casos · recall{" "}
                  {percent(item.evidence_summary.baseline_recall)} →{" "}
                  {percent(item.evidence_summary.candidate_recall)} · evaluado{" "}
                  {DATE.format(new Date(item.last_evaluated_at))} · revisar luego del{" "}
                  {DATE.format(new Date(item.review_after))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Hallazgos de esta sesión" className="space-y-2">
        <h3 className="text-[13px] font-semibold text-text-primary">Hallazgos de esta sesión</h3>
        {findings.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            Aún no hay hallazgos agregados. Se registran al terminar cada experimento.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="py-1 pr-3 font-medium">Lado</th>
                <th className="py-1 pr-3 font-medium">Casos</th>
                <th className="py-1 pr-3 font-medium">Precisión</th>
                <th className="py-1 font-medium">Recall</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.finding_id} className="border-t border-border">
                  <td className="py-1 pr-3 text-text-primary">
                    {finding.dimension_value === "candidate" ? "Candidato" : "Baseline"}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {finding.sample_count.toLocaleString("es-CO")}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{percent(finding.metrics.precision)}</td>
                  <td className="py-1 tabular-nums">{percent(finding.metrics.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
