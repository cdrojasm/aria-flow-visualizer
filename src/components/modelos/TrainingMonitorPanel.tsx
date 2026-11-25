import { Progress } from "@/components/ui/progress";
import type { AsyncOperationResponse } from "@/lib/api/asyncOperations.functions";

const CARD = "rounded-xl border border-border bg-card p-4";

const STAGE_LABEL: Record<string, string> = {
  loading_dataset: "Cargando dataset",
  building_features: "Construyendo variables",
  training: "Entrenando",
  persisting: "Guardando modelo",
  done: "Terminado",
  PENDING: "En cola",
  DISPATCHED: "Enviado al worker",
  RUNNING: "En ejecución",
};

const RESULT_LABEL: Record<string, { label: string; className: string }> = {
  SUCCEEDED: { label: "Completado", className: "bg-success/10 text-success" },
  FAILED: { label: "Fallido", className: "bg-danger/10 text-danger" },
};

const ACTIVE = new Set(["PENDING", "DISPATCHED", "RUNNING"]);

function duration(from: string, to: string) {
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function tagOf(op: AsyncOperationResponse) {
  return (op.payload?.tag as string | undefined) ?? String(op.payload?.model_id ?? op.id);
}

/** Training load at a glance: live runs with their stage, then the latest finished ones. */
export function TrainingMonitorPanel({
  operations,
  loading,
}: {
  operations: AsyncOperationResponse[];
  loading: boolean;
}) {
  const training = operations
    .filter((op) => op.operation_type === "model_training")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const active = training.filter((op) => ACTIVE.has(op.status));
  const recent = training.filter((op) => !ACTIVE.has(op.status)).slice(0, 8);
  const queued = active.filter((op) => op.status !== "RUNNING").length;
  const failed = recent.filter((op) => op.status === "FAILED").length;
  const tiles = [
    ["En ejecución", active.length - queued, "entrenamientos activos"],
    ["En cola", queued, "esperando worker"],
    ["Completados", recent.length - failed, `últimos ${recent.length}`],
    ["Fallidos", failed, `últimos ${recent.length}`],
  ] as const;

  return (
    <div className="space-y-4" data-testid="training-monitor">
      <section
        aria-label="Resumen de entrenamientos"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={CARD}>
            <p className="text-[11px] text-text-secondary">{label}</p>
            <p className="text-[22px] font-bold tabular-nums text-text-primary">{value}</p>
            <p className="text-[11px] text-text-secondary">{hint}</p>
          </div>
        ))}
      </section>

      <section aria-label="Entrenamientos en curso" className={CARD}>
        <h3 className="mb-3 text-[13px] font-semibold text-text-primary">En curso</h3>
        {loading ? (
          <p className="text-[12px] text-text-secondary">Cargando entrenamientos…</p>
        ) : active.length === 0 ? (
          <p className="text-[12px] text-text-secondary">No hay entrenamientos en curso.</p>
        ) : (
          <ul className="space-y-4">
            {active.map((op) => {
              const stage = (op.result?.stage as string | undefined) ?? op.status;
              const pct = (op.result?.progress_pct as number | undefined) ?? 0;
              return (
                <li key={op.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="font-medium text-text-primary">{tagOf(op)}</span>
                    <span className="text-text-secondary">
                      {STAGE_LABEL[stage] ?? stage} · {pct}% ·{" "}
                      {duration(op.created_at, new Date().toISOString())}
                    </span>
                  </div>
                  <Progress value={pct} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Últimos entrenamientos" className={CARD}>
        <h3 className="mb-3 text-[13px] font-semibold text-text-primary">Últimos entrenamientos</h3>
        {recent.length === 0 ? (
          <p className="text-[12px] text-text-secondary">
            Todavía no hay entrenamientos terminados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((op) => {
              const result = RESULT_LABEL[op.status] ?? {
                label: op.status,
                className: "bg-surface",
              };
              return (
                <li
                  key={op.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-text-primary">{tagOf(op)}</span>
                    <span className="ml-2 text-text-secondary">
                      {new Date(op.created_at).toLocaleString("es-CO", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}{" "}
                      · {duration(op.created_at, op.updated_at)}
                    </span>
                    {op.error && (
                      <p className="truncate text-danger" title={op.error}>
                        {op.error}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${result.className}`}
                  >
                    {result.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
