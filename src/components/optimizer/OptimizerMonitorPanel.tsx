import { useQuery } from "@tanstack/react-query";
import { getOptimizerStatus } from "@/lib/api/agent.functions";
import { BUDGET_RESOURCE_LABEL, SESSION_STATUS_LABEL, TONE_CLASS, budgetLabel } from "./labels";

const CARD = "rounded-xl border border-border bg-card p-4";

const EXPERIMENT_LABEL: Record<string, string> = {
  RUNNING: "En ejecución",
  SUCCEEDED: "Cumplieron el objetivo",
  REJECTED_GLOBAL_CONSTRAINT: "Rechazados por restricción",
  FAILED: "Fallaron",
};

const EMBEDDING_LABEL: Record<string, string> = {
  embedding_calls: "Llamadas",
  embedding_texts: "Textos",
  embedding_characters: "Caracteres",
};

/** Optimizer load at a glance: aggregates and caps only, never session ids. */
export function OptimizerMonitorPanel() {
  const status = useQuery({
    queryKey: ["optimizerStatus"],
    queryFn: getOptimizerStatus,
    refetchInterval: 10_000,
  });
  if (status.isLoading) {
    return <p className="text-[13px] text-text-secondary">Cargando el estado del optimizador…</p>;
  }
  if (status.isError || !status.data) {
    return (
      <p role="alert" className="rounded-lg bg-danger/10 p-3 text-[13px] text-danger">
        No se pudo leer el estado del optimizador.
      </p>
    );
  }
  const data = status.data;
  const total = (values: Record<string, number>) =>
    Object.values(values).reduce((sum, value) => sum + value, 0);
  const tiles = [
    ["Sesiones en curso", total(data.sessions), `tope ${data.max_concurrent_sessions}`],
    [
      "Candidatos en paralelo",
      data.running_candidates,
      `hasta ${data.max_parallel_experiments} por sesión`,
    ],
    ["Ejecuciones activas", data.active_runs, `tope global ${data.max_concurrent_runs}`],
    ["Esperando al Channel Manager", total(data.blocked_by_reason), "sesiones bloqueadas"],
  ] as const;
  return (
    <div className="space-y-4" data-testid="optimizer-monitor">
      <section aria-label="Carga del optimizador" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={CARD}>
            <p className="text-[11px] text-text-secondary">{label}</p>
            <p className="text-[22px] font-bold tabular-nums text-text-primary">{value}</p>
            <p className="text-[11px] text-text-secondary">{hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section aria-label="Sesiones por estado" className={CARD}>
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Sesiones por estado</h3>
          {total(data.sessions) === 0 ? (
            <p className="text-[12px] text-text-secondary">
              No hay sesiones del optimizador en curso.
            </p>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {Object.entries(data.sessions).map(([key, value]) => (
                <li key={key} className="flex justify-between">
                  <span>{SESSION_STATUS_LABEL[key] ?? key}</span>
                  <span className="tabular-nums font-medium">{value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Esperas por motivo" className={CARD}>
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Esperas por motivo</h3>
          {total(data.blocked_by_reason) === 0 ? (
            <p className="text-[12px] text-text-secondary">Ninguna sesión espera una aprobación.</p>
          ) : (
            <ul className="space-y-1 text-[12px]" data-testid="optimizer-block-reasons">
              {Object.entries(data.blocked_by_reason).map(([code, value]) => (
                <li key={code} className="flex justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE_CLASS.warn}`}
                  >
                    {data.reason_titles[code] ?? code}
                  </span>
                  <span className="tabular-nums font-medium">{value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Presupuesto agregado" className={CARD}>
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Presupuesto agregado</h3>
          <ul className="space-y-2 text-[12px]">
            {Object.entries(data.budget).map(([resource, value]) => {
              const ratio = value.limit > 0 ? Math.min(1, value.spent / value.limit) : 0;
              return (
                <li key={resource}>
                  <div className="flex justify-between">
                    <span>{BUDGET_RESOURCE_LABEL[resource] ?? resource}</span>
                    <span className="tabular-nums">
                      {budgetLabel(resource, value.spent)} de {budgetLabel(resource, value.limit)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Presupuesto usado de ${BUDGET_RESOURCE_LABEL[resource] ?? resource}`}
                    aria-valuenow={Math.round(ratio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface"
                  >
                    <div
                      className={`h-full ${ratio >= 0.9 ? "bg-danger" : "bg-primary"}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Experimentos por resultado" className={CARD}>
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">
            Experimentos por resultado
          </h3>
          {total(data.experiments) === 0 ? (
            <p className="text-[12px] text-text-secondary">
              Aún no hay experimentos en las sesiones en curso.
            </p>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {Object.entries(data.experiments).map(([key, value]) => (
                <li key={key} className="flex justify-between">
                  <span>{EXPERIMENT_LABEL[key] ?? key}</span>
                  <span className="tabular-nums font-medium">{value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Uso de embeddings" className={CARD}>
          <h3 className="mb-2 text-[13px] font-semibold text-text-primary">Uso de embeddings</h3>
          {total(data.embedding_usage ?? {}) === 0 ? (
            <p className="text-[12px] text-text-secondary">
              Las sesiones en curso aún no han generado embeddings.
            </p>
          ) : (
            <>
              <ul className="space-y-1 text-[12px]">
                {Object.entries(data.embedding_usage).map(([key, value]) => (
                  <li key={key} className="flex justify-between">
                    <span>{EMBEDDING_LABEL[key] ?? key}</span>
                    <span className="tabular-nums font-medium">
                      {value.toLocaleString("es-CO")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-text-secondary">
                {data.sessions_with_embeddings}{" "}
                {data.sessions_with_embeddings === 1 ? "sesión registró" : "sesiones registraron"}{" "}
                uso. Sin tope: se informa aparte del presupuesto.
              </p>
            </>
          )}
        </section>
      </div>

      <section aria-label="Muestras maduras en uso" className={CARD}>
        <h3 className="mb-2 text-[13px] font-semibold text-text-primary">
          Muestras maduras en uso
        </h3>
        {data.samples.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            Ningún experimento en curso usa todavía una muestra madura.
          </p>
        ) : (
          <table className="w-full text-[12px]" data-testid="optimizer-samples">
            <thead>
              <tr className="text-left text-text-secondary">
                <th className="py-1 pr-3 font-medium">Periodo</th>
                <th className="py-1 pr-3 font-medium">Madurez</th>
                <th className="py-1 pr-3 font-medium">Particiones</th>
                <th className="py-1 pr-3 font-medium">Versión de esquema</th>
                <th className="py-1 font-medium">Experimentos</th>
              </tr>
            </thead>
            <tbody>
              {data.samples.map((sample) => (
                <tr key={sample.snapshot_id} className="border-t border-border">
                  <td className="py-1 pr-3">
                    {sample.period_start} → {sample.period_end}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{sample.maturing_days} días</td>
                  <td className="py-1 pr-3">
                    {Object.entries(sample.partition_counts)
                      .map(([name, count]) => `${name} ${count}`)
                      .join(" · ")}
                  </td>
                  <td className="py-1 pr-3">v{sample.schema_versions.join(", v") || "—"}</td>
                  <td className="py-1 tabular-nums">{sample.experiments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
