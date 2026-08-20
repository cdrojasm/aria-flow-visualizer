import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Database, Layers, ChevronDown } from "lucide-react";
import { ReactFlow, Background, Handle, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ClassificationMetricsSection } from "@/components/ClassificationMetricsSection";
import { RefreshControl } from "@/components/RefreshControl";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  getTestRun,
  getTestCase,
  type DurationStats,
  type Json,
  type StepStatus,
  type TestCaseDetailResponse,
  type TestRunStatus,
  type WorkflowStepResponse,
} from "@/lib/api/testing.functions";

function asObject(v: Json | null): Record<string, Json> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function fmtSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export const Route = createFileRoute("/testing/$runId")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Detalle de una ejecución de prueba del agente ARIA." },
    ],
  }),
  component: TestRunDetailPage,
});

// Pipeline order — mirrors LINEAR_STEPS in the backend workflow runner.
const STEP_ORDER = [
  "pre_process",
  "profiling",
  "classification",
  "adversarial",
  "analyst",
  "executor",
  "post_process",
] as const;
const LLM_STEPS = new Set(["profiling", "classification", "adversarial", "analyst"]);
const COT_STEPS = new Set(["classification", "adversarial"]);

const RUN_STATUS_STYLE: Record<TestRunStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  SUCCEEDED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const STEP_STATUS_STYLE: Record<StepStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  DISPATCHED: "bg-primary/10 text-primary",
  RUNNING: "bg-primary/10 text-primary",
  SUCCEEDED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

const STEP_LABELS: Record<string, string> = {
  pre_process: "Pre-proceso",
  profiling: "Perfilador",
  classification: "Clasificador",
  adversarial: "Adversarial",
  analyst: "Analista",
  executor: "Ejecutor",
  post_process: "Post-proceso",
};

const STEP_BORDER_STYLE: Record<StepStatus, string> = {
  PENDING: "border-warning/40",
  DISPATCHED: "border-primary/40",
  RUNNING: "border-primary/60",
  SUCCEEDED: "border-success/40",
  FAILED: "border-danger/50",
};

function TestRunDetailPage() {
  const { runId } = Route.useParams();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedStepName, setSelectedStepName] = useState<string | null>(null);

  const runQuery = useQuery({
    queryKey: ["testRun", runId],
    queryFn: () => getTestRun({ data: { id: runId } }),
  });

  const isLive = runQuery.data?.status === "RUNNING" || runQuery.data?.status === "PENDING";
  const { lastRefresh, refresh } = useAutoRefresh(isLive ? 4000 : 60000);

  useEffect(() => {
    runQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefresh]);

  const caseQuery = useQuery({
    queryKey: ["testCase", runId, selectedCaseId],
    queryFn: () => getTestCase({ data: { runId, workflowExecutionId: selectedCaseId! } }),
    enabled: !!selectedCaseId,
  });

  if (runQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="px-8 py-6 text-[13px] text-text-secondary">Cargando…</div>
      </DashboardLayout>
    );
  }

  if (runQuery.isError || !runQuery.data) {
    return (
      <DashboardLayout>
        <div className="px-8 py-6 max-w-[900px]">
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-4">
            <Link to="/testing" className="hover:text-primary">
              Testing
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{runId}</span>
          </nav>
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary text-[13px]">
            No se encontró esta prueba.
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const run = runQuery.data;

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <div>
          <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
            <Link to="/testing" className="hover:text-primary">
              Testing
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-text-primary font-medium">{run.id}</span>
          </nav>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-[20px] font-semibold text-text-primary">{run.name}</h1>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${RUN_STATUS_STYLE[run.status]}`}
              >
                {run.status}
              </span>
            </div>
            <RefreshControl lastRefresh={lastRefresh} onRefresh={refresh} />
          </div>
        </div>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border flex items-center gap-4 text-[12px] text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" /> {run.dataset_name}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> {run.total} casos
            </span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { label: "Total", value: run.total },
              { label: "Completados", value: run.succeeded },
              { label: "Fallidos", value: run.failed },
              { label: "En curso / pendientes", value: run.running + run.pending },
              {
                label: "Tokens totales (entrada / salida)",
                value: `${run.input_tokens.toLocaleString()} / ${run.output_tokens.toLocaleString()}`,
              },
              {
                label: "Intentos máx. clasificador",
                value: run.config.max_feedback_iterations + 1,
              },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-text-secondary">{label}</p>
                <p className="text-[16px] font-semibold text-text-primary font-mono">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <ClassificationMetricsSection
          analystAgreement={run.analyst_agreement_metrics}
          groundTruth={run.ground_truth_metrics}
        />

        {(run.total_duration_stats || Object.keys(run.step_duration_stats).length > 0) && (
          <DurationStatsSection
            totalStats={run.total_duration_stats}
            stepStats={run.step_duration_stats}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Case list */}
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
                Casos
              </h2>
            </div>
            <div className="max-h-[600px] overflow-y-auto divide-y divide-border">
              {run.cases.length === 0 && (
                <p className="px-4 py-4 text-[12px] text-text-secondary">Sin casos todavía.</p>
              )}
              {run.cases.map((c) => {
                const active = c.workflow_execution_id === selectedCaseId;
                return (
                  <button
                    key={c.workflow_execution_id}
                    onClick={() => {
                      setSelectedCaseId(c.workflow_execution_id);
                      setSelectedStepName(null);
                    }}
                    className={`w-full text-left px-4 py-2.5 transition-colors ${active ? "bg-primary/5" : "hover:bg-surface"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-mono text-text-primary truncate">
                        {c.alert_id}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STEP_STATUS_STYLE[c.status]}`}
                      >
                        {c.status}
                      </span>
                    </div>
                    {c.current_step && (
                      <p className="text-[11px] text-text-secondary mt-0.5">{c.current_step}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Case detail — pipeline steps */}
          <section className="space-y-3">
            {!selectedCaseId && (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary text-[13px] bg-card">
                Selecciona un caso para ver el detalle paso a paso.
              </div>
            )}
            {selectedCaseId && caseQuery.isLoading && (
              <div className="rounded-lg border border-border p-10 text-center text-text-secondary text-[13px] bg-card">
                Cargando caso…
              </div>
            )}
            {selectedCaseId && caseQuery.isError && (
              <div className="rounded-lg border border-border p-10 text-center text-danger text-[13px] bg-card">
                No se pudo cargar el detalle del caso.
              </div>
            )}
            {selectedCaseId && caseQuery.data && (
              <>
                <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-5 py-3 flex items-center gap-2 text-[12px] text-text-secondary">
                  <span className="font-semibold text-text-secondary uppercase tracking-wider text-[11px]">
                    Tokens del caso
                  </span>
                  <span className="font-mono text-text-primary">
                    {caseQuery.data.input_tokens.toLocaleString()} entrada /{" "}
                    {caseQuery.data.output_tokens.toLocaleString()} salida
                  </span>
                </div>
                <PipelineCase
                  steps={caseQuery.data.steps}
                  selectedStepName={selectedStepName}
                  onSelectStep={setSelectedStepName}
                />
                <ClassificationAttempts steps={caseQuery.data.steps} />
                <FullCaseJson data={caseQuery.data} />
              </>
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DurationStatsSection({
  totalStats,
  stepStats,
}: {
  totalStats: DurationStats | null;
  stepStats: Record<string, DurationStats>;
}) {
  const rows = STEP_ORDER.map((name) => [name, stepStats[name]] as const).filter(
    (row): row is [(typeof STEP_ORDER)[number], DurationStats] => !!row[1],
  );
  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
          Duración por worker (perc95 / avg / min / max)
        </h2>
      </div>
      <div className="p-6 space-y-4">
        {totalStats && (
          <div>
            <p className="text-[11px] text-text-secondary">Total por caso ({totalStats.count})</p>
            <p className="text-[14px] font-mono text-text-primary">
              p95 {fmtSeconds(totalStats.p95_seconds)} · avg {fmtSeconds(totalStats.avg_seconds)} ·
              min {fmtSeconds(totalStats.min_seconds)} · max {fmtSeconds(totalStats.max_seconds)}
            </p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th className="font-medium pr-4 py-1">Etapa</th>
                  <th className="font-medium pr-4 py-1">n</th>
                  <th className="font-medium pr-4 py-1">p95</th>
                  <th className="font-medium pr-4 py-1">avg</th>
                  <th className="font-medium pr-4 py-1">min</th>
                  <th className="font-medium py-1">max</th>
                </tr>
              </thead>
              <tbody className="font-mono text-text-primary">
                {rows.map(([name, stats]) => (
                  <tr key={name} className="border-t border-border">
                    <td className="pr-4 py-1 font-sans">{STEP_LABELS[name] ?? name}</td>
                    <td className="pr-4 py-1">{stats.count}</td>
                    <td className="pr-4 py-1">{fmtSeconds(stats.p95_seconds)}</td>
                    <td className="pr-4 py-1">{fmtSeconds(stats.avg_seconds)}</td>
                    <td className="pr-4 py-1">{fmtSeconds(stats.min_seconds)}</td>
                    <td className="py-1">{fmtSeconds(stats.max_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// Custom node component — must be a stable reference outside the component
// tree, or ReactFlow remounts every node on each render.
function StepNode({ data }: { data: { step: WorkflowStepResponse; selected: boolean } }) {
  const { step, selected } = data;
  return (
    <div
      className={`min-w-[136px] rounded-lg border-2 bg-card px-3 py-2 shadow-sm transition-colors ${
        selected ? "border-primary ring-2 ring-primary/20" : STEP_BORDER_STYLE[step.status]
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-none !bg-border"
      />
      <p className="text-[12px] font-semibold text-text-primary truncate">
        {STEP_LABELS[step.step_name] ?? step.step_name}
      </p>
      <span
        className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${STEP_STATUS_STYLE[step.status]}`}
      >
        {step.status}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-none !bg-border"
      />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function PipelineCase({
  steps,
  selectedStepName,
  onSelectStep,
}: {
  steps: WorkflowStepResponse[];
  selectedStepName: string | null;
  onSelectStep: (stepName: string) => void;
}) {
  const ordered = useMemo(() => {
    const byName = new Map(steps.map((s) => [s.step_name, s]));
    return STEP_ORDER.map((name) => byName.get(name)).filter(
      (s): s is NonNullable<typeof s> => !!s,
    );
  }, [steps]);
  const activeStepName = ordered.some((s) => s.step_name === selectedStepName)
    ? selectedStepName
    : (ordered[0]?.step_name ?? null);
  const activeStep = ordered.find((s) => s.step_name === activeStepName) ?? null;

  const nodes: Node[] = useMemo(
    () =>
      ordered.map((step, i) => ({
        id: step.step_name,
        type: "step",
        position: { x: i * 180, y: 0 },
        data: { step, selected: step.step_name === activeStepName },
        draggable: false,
        selectable: false,
      })),
    [ordered, activeStepName],
  );

  const edges: Edge[] = useMemo(
    () =>
      ordered.slice(1).map((step, i) => {
        const prev = ordered[i];
        return {
          id: `${prev.step_name}->${step.step_name}`,
          source: prev.step_name,
          target: step.step_name,
          animated: prev.status === "RUNNING" || prev.status === "DISPATCHED",
          style: { stroke: "var(--color-border)" },
        };
      }),
    [ordered],
  );

  return (
    <div className="space-y-3">
      <div
        style={{ height: 160 }}
        className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden"
      >
        <ReactFlow
          key={steps.map((s) => s.id).join(",")}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => onSelectStep(node.id)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>

      {activeStep && <StepDetailPanel step={activeStep} />}
    </div>
  );
}

// Backend records one WorkflowStepExecutionRecord per classifier attempt
// (see attempt on the record, bumped each time adversarial review sends
// classification back for another pass) - the full `steps` array already
// carries every attempt, `PipelineCase` above just shows the latest one
// per stage. This renders the whole loop chronologically instead.
function ClassificationAttempts({ steps }: { steps: WorkflowStepResponse[] }) {
  const timeline = useMemo(
    () =>
      steps
        .filter((s) => s.step_name === "classification" || s.step_name === "adversarial")
        .slice()
        .sort((a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? "")),
    [steps],
  );
  if (timeline.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
          Intentos del clasificador
        </h3>
      </div>
      <ol className="divide-y divide-border">
        {timeline.map((step) => {
          const output = asObject(step.output);
          const durationSeconds =
            step.started_at && step.finished_at
              ? (new Date(step.finished_at).getTime() - new Date(step.started_at).getTime()) / 1000
              : null;
          return (
            <li key={step.id} className="px-5 py-3 flex items-start gap-3">
              <span
                className={`shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${STEP_STATUS_STYLE[step.status]}`}
              >
                {step.status}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-text-primary">
                  {STEP_LABELS[step.step_name] ?? step.step_name}
                  {step.step_name === "classification" && ` · intento ${step.attempt}`}
                  {durationSeconds !== null && (
                    <span className="text-text-secondary font-normal">
                      {" "}
                      · {fmtSeconds(durationSeconds)}
                    </span>
                  )}
                </p>
                {output && step.step_name === "classification" && (
                  <ExpectedVsPredicted output={output} />
                )}
                {output && step.step_name === "adversarial" && (
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {output.requires_classification_feedback
                      ? "Rechazado — vuelve a clasificación"
                      : "Aprobado"}
                    {typeof output.feedback === "string" && output.feedback && (
                      <> · {output.feedback}</>
                    )}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Mirrors the backend's _IS_FRAUD_TO_ANALYST mapping in
// classification_metrics.py - keep the two in sync.
const IS_FRAUD_TO_ANALYST: Record<string, string> = {
  fraud: "risk",
  unknown: "risk-suspected",
  not_fraud: "no-risk",
};

function ExpectedVsPredicted({ output }: { output: Record<string, Json> }) {
  const predicted = output.is_fraud;
  const expected = output.expected_classification;
  if (predicted == null && expected == null) return null;
  const matches =
    typeof expected === "string" && typeof predicted === "string"
      ? IS_FRAUD_TO_ANALYST[predicted] === expected
      : null;
  return (
    <p className="text-[11px] text-text-secondary mt-0.5">
      Predicho: <span className="font-mono text-text-primary">{String(predicted ?? "—")}</span>
      {expected != null && (
        <>
          {" "}
          · Esperado: <span className="font-mono text-text-primary">{String(expected)}</span>
          {matches !== null && (
            <span className={matches ? "text-success ml-1" : "text-danger ml-1"}>
              {matches ? "✓" : "✗"}
            </span>
          )}
        </>
      )}
    </p>
  );
}

function StepDetailPanel({ step }: { step: WorkflowStepResponse }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-text-primary">
            {STEP_LABELS[step.step_name] ?? step.step_name}
          </span>
          {step.attempt > 1 && (
            <span className="text-[10px] text-text-secondary">intento {step.attempt}</span>
          )}
        </div>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STEP_STATUS_STYLE[step.status]}`}
        >
          {step.status}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {step.error && (
          <p className="text-[12px] text-danger bg-danger/5 border border-danger/20 rounded-md px-3 py-2">
            {step.error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1.5">
              Input
            </p>
            <JsonTreeBlock value={step.input} />
          </div>
          <div>
            <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1.5">
              Output
            </p>
            <JsonTreeBlock value={step.output} />
          </div>
        </div>

        {(() => {
          const output = asObject(step.output);
          if (!output) return null;
          const cot = output.cot;
          return (
            <>
              {step.step_name === "classification" && <ExpectedVsPredicted output={output} />}
              {LLM_STEPS.has(step.step_name) &&
                ("input_tokens" in output || "output_tokens" in output) && (
                  <div className="flex items-center gap-4 text-[12px] text-text-secondary">
                    {"input_tokens" in output && (
                      <span>
                        Tokens entrada:{" "}
                        <strong className="text-text-primary">{String(output.input_tokens)}</strong>
                      </span>
                    )}
                    {"output_tokens" in output && (
                      <span>
                        Tokens salida:{" "}
                        <strong className="text-text-primary">
                          {String(output.output_tokens)}
                        </strong>
                      </span>
                    )}
                  </div>
                )}

              {COT_STEPS.has(step.step_name) && typeof cot === "string" && (
                <Collapsible defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-[12px] text-primary hover:underline">
                    <ChevronDown className="h-3.5 w-3.5" /> Ver cadena de razonamiento (CoT)
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] bg-surface rounded-md p-3 max-h-96 overflow-y-auto">
                      {cot}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// Recursive, collapsible JSON tree - native <details>/<summary> (no extra
// dependency, keyboard-accessible for free). Only the top level starts
// expanded so a big nested array (e.g. transaction_history with hundreds
// of entries) doesn't dump itself open by default.
function JsonPrimitive({ value }: { value: string | number | boolean }) {
  if (typeof value === "string") {
    return <span className="text-success">&quot;{value}&quot;</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-warning">{String(value)}</span>;
  }
  return <span className="text-primary">{value}</span>;
}

function JsonTree({ value, label, depth = 0 }: { value: unknown; label?: string; depth?: number }) {
  const keyPrefix = label !== undefined && <span className="text-text-secondary">{label}: </span>;

  if (value === null || value === undefined) {
    return (
      <div className="text-[11px] font-mono leading-relaxed">
        {keyPrefix}
        <span className="text-text-secondary italic">null</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="text-[11px] font-mono leading-relaxed">
          {keyPrefix}
          <span className="text-text-secondary">[]</span>
        </div>
      );
    }
    return (
      <details open={depth < 1} className="text-[11px] font-mono leading-relaxed">
        <summary className="cursor-pointer hover:text-text-primary">
          {keyPrefix}
          <span className="text-text-secondary">Array({value.length})</span>
        </summary>
        <div className="ml-3 border-l border-border pl-2 mt-0.5 space-y-0.5">
          {value.map((v, i) => (
            <JsonTree key={i} value={v} label={String(i)} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <div className="text-[11px] font-mono leading-relaxed">
          {keyPrefix}
          <span className="text-text-secondary">{"{}"}</span>
        </div>
      );
    }
    return (
      <details open={depth < 2} className="text-[11px] font-mono leading-relaxed">
        <summary className="cursor-pointer hover:text-text-primary">
          {keyPrefix}
          <span className="text-text-secondary">{`{${entries.length}}`}</span>
        </summary>
        <div className="ml-3 border-l border-border pl-2 mt-0.5 space-y-0.5">
          {entries.map(([k, v]) => (
            <JsonTree key={k} value={v} label={k} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div className="text-[11px] font-mono leading-relaxed">
        {keyPrefix}
        <JsonPrimitive value={value} />
      </div>
    );
  }

  return (
    <div className="text-[11px] font-mono leading-relaxed">
      {keyPrefix}
      <span className="text-text-secondary">{String(value)}</span>
    </div>
  );
}

function JsonTreeBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-[11px] text-text-secondary italic">—</p>;
  }
  return (
    <div className="bg-surface rounded-md p-3 max-h-80 overflow-y-auto">
      <JsonTree value={value} />
    </div>
  );
}

// The complete case payload (metadata + every step's input/output) as one
// navigable tree - collapsed by default since a case with a large
// transaction_history can be a lot to render at once.
function FullCaseJson({ data }: { data: TestCaseDetailResponse }) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <Collapsible>
        <CollapsibleTrigger className="w-full flex items-center gap-1.5 px-5 py-3 text-[12px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary">
          <ChevronDown className="h-3.5 w-3.5" /> JSON completo del caso
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 max-h-[600px] overflow-y-auto">
            <JsonTree value={data} depth={1} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
