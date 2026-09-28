import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Square,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  getScenario,
  getScenarioStatus,
  pauseScenario,
  startScenario,
  stopScenario,
  type ScenarioStatus,
} from "@/lib/api/eventSimulation.functions";

// Live status page for a Generador scenario - mirrors testing.$runId.tsx's
// page-layout/header/breadcrumb conventions (its own file, untouched).
// Polling here is a plain useQuery refetchInterval rather than
// useAsyncOperation: the terminal states are COMPLETED/FAILED, not
// SUCCEEDED/FAILED, and there's no AsyncOperationRecord backing a scenario
// at all - it's tracked entirely by aria-api's own scenario CRUD/lifecycle
// (see eventSimulation.functions.ts).
export const Route = createFileRoute("/testing/scenarios/$scenarioId")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Estado en vivo de un escenario de simulación de alertas." },
    ],
  }),
  component: ScenarioStatusPage,
});

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

const STATUS_STYLE: Record<ScenarioStatus, string> = {
  DRAFT: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  PAUSED: "bg-warning/10 text-warning",
  COMPLETED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const OUTPUT_MODE_LABEL: Record<string, string> = {
  DATASET: "Dataset",
  LIVE_PIPELINE: "Pipeline en vivo",
};

function ScenarioStatusPage() {
  const { scenarioId } = Route.useParams();
  const queryClient = useQueryClient();

  const scenarioQuery = useQuery({
    queryKey: ["scenario", scenarioId],
    queryFn: () => getScenario({ data: { id: scenarioId } }),
  });

  const statusQuery = useQuery({
    queryKey: ["scenarioStatus", scenarioId],
    queryFn: () => getScenarioStatus({ data: { id: scenarioId } }),
    refetchInterval: (query) => (TERMINAL.has(query.state.data?.status ?? "") ? false : 3000),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["scenario", scenarioId] });
    queryClient.invalidateQueries({ queryKey: ["scenarioStatus", scenarioId] });
  }

  const startMutation = useMutation({
    mutationFn: () => startScenario({ data: { id: scenarioId } }),
    onSuccess: invalidate,
  });
  const pauseMutation = useMutation({
    mutationFn: () => pauseScenario({ data: { id: scenarioId } }),
    onSuccess: invalidate,
  });
  const stopMutation = useMutation({
    mutationFn: () => stopScenario({ data: { id: scenarioId } }),
    onSuccess: invalidate,
  });

  if (scenarioQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="px-8 py-6 text-[13px] text-text-secondary">Cargando…</div>
      </DashboardLayout>
    );
  }

  if (scenarioQuery.isError || !scenarioQuery.data) {
    return (
      <DashboardLayout>
        <div className="px-8 py-6 max-w-[900px]">
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-4">
            <Link to="/testing" className="hover:text-primary">
              Testing
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{scenarioId}</span>
          </nav>
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary text-[13px]">
            No se encontró este escenario.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const scenario = scenarioQuery.data;
  const status = statusQuery.data?.status ?? scenario.status;
  const eventsEmitted = statusQuery.data?.events_emitted ?? scenario.events_emitted;
  const lastTickOffset =
    statusQuery.data?.last_tick_offset_seconds ?? scenario.last_tick_offset_seconds;
  const error = statusQuery.data?.error ?? scenario.error;

  const anyActionPending =
    startMutation.isPending || pauseMutation.isPending || stopMutation.isPending;

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1000px] space-y-6">
        <div>
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
            <Link to="/testing" className="hover:text-primary">
              Testing
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{scenario.name}</span>
          </nav>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-[20px] font-semibold text-text-primary">{scenario.name}</h1>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLE[status]}`}
              >
                {status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {status === "DRAFT" && (
                <ActionButton
                  onClick={() => startMutation.mutate()}
                  pending={startMutation.isPending}
                  disabled={anyActionPending}
                  icon={<Play className="h-3.5 w-3.5" />}
                  label="Iniciar"
                />
              )}
              {status === "RUNNING" && (
                <ActionButton
                  onClick={() => pauseMutation.mutate()}
                  pending={pauseMutation.isPending}
                  disabled={anyActionPending}
                  icon={<Pause className="h-3.5 w-3.5" />}
                  label="Pausar"
                />
              )}
              {status === "PAUSED" && (
                <ActionButton
                  onClick={() => startMutation.mutate()}
                  pending={startMutation.isPending}
                  disabled={anyActionPending}
                  icon={<Play className="h-3.5 w-3.5" />}
                  label="Reanudar"
                />
              )}
              {(status === "RUNNING" || status === "PAUSED") && (
                <ActionButton
                  onClick={() => stopMutation.mutate()}
                  pending={stopMutation.isPending}
                  disabled={anyActionPending}
                  icon={<Square className="h-3.5 w-3.5" />}
                  label="Detener"
                  variant="danger"
                />
              )}
            </div>
          </div>
        </div>

        {(startMutation.isError || pauseMutation.isError || stopMutation.isError) && (
          <p className="text-[12px] text-danger flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {((startMutation.error ?? pauseMutation.error ?? stopMutation.error) as Error).message}
          </p>
        )}

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[11px] text-text-secondary">Destino</p>
              <p className="text-[14px] font-semibold text-text-primary">
                {OUTPUT_MODE_LABEL[scenario.output_mode] ?? scenario.output_mode}
                {scenario.output_mode === "DATASET" && scenario.target_dataset_name
                  ? `: ${scenario.target_dataset_name}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary">Eventos emitidos</p>
              <p className="text-[16px] font-semibold text-text-primary font-mono">
                {eventsEmitted}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary">Offset del último tick</p>
              <p className="text-[16px] font-semibold text-text-primary font-mono">
                {lastTickOffset}s
              </p>
            </div>
            <div>
              <p className="text-[11px] text-text-secondary">Creado</p>
              <p className="text-[13px] text-text-primary">
                {new Date(scenario.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          {error && (
            <div className="px-6 pb-6">
              <p className="text-[12px] text-danger bg-danger/5 border border-danger/20 rounded-md px-3 py-2">
                {error}
              </p>
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
              Curva de llegada
            </h2>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="font-medium pr-4 py-1">Desde (s)</th>
                  <th className="font-medium pr-4 py-1">Hasta (s)</th>
                  <th className="font-medium py-1">Eventos / min</th>
                </tr>
              </thead>
              <tbody className="font-mono text-text-primary">
                {scenario.rate_schedule.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="pr-4 py-1">{r.start_offset_seconds}</td>
                    <td className="pr-4 py-1">{r.end_offset_seconds}</td>
                    <td className="py-1">{r.events_per_minute}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
              Campos generados
            </h2>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(scenario.field_specs).map(([fieldName, spec]) => (
              <div key={fieldName} className="px-6 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-text-primary">{fieldName}</span>
                <span className="text-[11px] text-text-secondary font-mono">{spec.kind}</span>
              </div>
            ))}
          </div>
          <Collapsible>
            <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-6 py-3 text-[12px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary border-t border-border">
              <ChevronDown className="h-3.5 w-3.5" /> Configuración completa (JSON)
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="px-6 pb-5 text-[11px] max-h-96 overflow-y-auto whitespace-pre-wrap break-words">
                {JSON.stringify(scenario.field_specs, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
    </DashboardLayout>
  );
}

function ActionButton({
  onClick,
  pending,
  disabled,
  icon,
  label,
  variant = "primary",
}: {
  onClick: () => void;
  pending: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  variant?: "primary" | "danger";
}) {
  const styles =
    variant === "danger"
      ? "border border-danger/30 text-danger hover:bg-danger/10"
      : "bg-primary text-white hover:bg-primary/90";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed ${styles}`}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
