import type { AgentExperiment, AgentFailureInfo } from "@/lib/api/agent.functions";
import { TONE_CLASS, type Tone } from "./labels";

const STATUS: Record<AgentExperiment["status"], { label: string; tone: Tone }> = {
  RUNNING: { label: "En ejecución", tone: "info" },
  SUCCEEDED: { label: "Cumplió el objetivo", tone: "ok" },
  REJECTED_GLOBAL_CONSTRAINT: { label: "Rechazado por una restricción", tone: "bad" },
  FAILED: { label: "Falló", tone: "bad" },
};

const COMPONENT_LABEL: Record<string, string> = {
  model: "Modelo",
  configuration: "Configuración",
  library: "Biblioteca",
  vector_store: "Vector store",
};

function side(experiment: AgentExperiment, key: "candidate" | "baseline") {
  const value = experiment.global_evaluation[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function metric(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "number" ? value : null;
}

function percent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function delta(candidate: number | null, baseline: number | null) {
  if (candidate === null || baseline === null) return null;
  return candidate - baseline;
}

/** Baseline against candidate, with what changed and why a failed one failed. */
export function ExperimentsPanel({
  experiments,
  catalog,
}: {
  experiments: AgentExperiment[];
  catalog: AgentFailureInfo[];
}) {
  if (experiments.length === 0) {
    return (
      <p
        data-testid="experiments-empty"
        className="rounded-lg border border-dashed border-border p-4 text-[13px] text-text-secondary"
      >
        Aún no hay experimentos. Un experimento se crea cuando un especialista propone un cambio
        verificado y se mide contra la muestra madura.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="experiments-list" aria-label="Experimentos">
      {experiments.map((experiment) => {
        const status = STATUS[experiment.status];
        const candidate = side(experiment, "candidate");
        const baseline = side(experiment, "baseline");
        const support = experiment.global_evaluation.eligible_count;
        const failure = experiment.error_code
          ? catalog.find((item) => item.code === experiment.error_code)
          : undefined;
        const changed = experiment.components.filter((pin) => {
          const before = experiment.baseline_components.find(
            (item) => item.component === pin.component,
          );
          return !before || before.content_sha256 !== pin.content_sha256;
        });
        return (
          <li
            key={experiment.experiment_id}
            className="rounded-xl border border-border bg-card p-4"
            data-status={experiment.status}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-semibold text-text-primary">
                Experimento de la iteración {experiment.iteration_number}
              </h3>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[status.tone]}`}
              >
                {status.label}
              </span>
              <span className="text-[11px] text-text-secondary">
                {experiment.kind === "ISOLATED" ? "Cambio aislado" : "Combinación"}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-text-secondary">
              {changed.length > 0
                ? `Cambia: ${changed.map((pin) => `${COMPONENT_LABEL[pin.component] ?? pin.component} (v${pin.version})`).join(", ")}`
                : "Sin cambios respecto al baseline."}
            </p>
            {failure ? (
              <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 p-2 text-[12px]">
                <p className="font-semibold text-danger">{failure.title}</p>
                <p className="text-text-secondary">{failure.detail}</p>
                <p className="mt-0.5 font-medium text-text-primary">{failure.action}</p>
              </div>
            ) : experiment.error_code ? (
              <p className="mt-2 text-[12px] text-danger">Falla no clasificada.</p>
            ) : null}
            {Object.keys(candidate).length > 0 && (
              <table className="mt-3 w-full text-[12px]" aria-label="Baseline contra candidato">
                <thead>
                  <tr className="text-left text-text-secondary">
                    <th className="py-1 pr-3 font-medium">Métrica</th>
                    <th className="py-1 pr-3 font-medium">Baseline</th>
                    <th className="py-1 pr-3 font-medium">Candidato</th>
                    <th className="py-1 font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {(["precision", "recall"] as const).map((key) => {
                    const change = delta(metric(candidate, key), metric(baseline, key));
                    return (
                      <tr key={key} className="border-t border-border">
                        <td className="py-1 pr-3 capitalize text-text-primary">
                          {key === "precision" ? "Precisión" : "Recall"}
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{percent(metric(baseline, key))}</td>
                        <td className="py-1 pr-3 tabular-nums">
                          {percent(metric(candidate, key))}
                        </td>
                        <td
                          className={`py-1 tabular-nums ${change === null ? "" : change >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {change === null
                            ? "—"
                            : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)} pts`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {typeof support === "number" && (
              <p className="mt-2 text-[11px] text-text-secondary">
                Muestra final evaluada: {support.toLocaleString("es-CO")} casos elegibles.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
