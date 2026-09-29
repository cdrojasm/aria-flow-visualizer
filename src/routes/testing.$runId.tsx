import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Hint } from "@/components/testing/Hint";
import { ClassificationMetricsSection } from "@/components/ClassificationMetricsSection";
import { CaseDetail } from "@/components/testing/CaseDetail";
import { CasesPanel } from "@/components/testing/CasesPanel";
import { formatDuration } from "@/components/testing/formatDuration";
import { RunDetailTabs } from "@/components/testing/RunDetailTabs";
import { RunDurationSummary } from "@/components/testing/RunDurationSummary";
import { RefreshControl } from "@/components/RefreshControl";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { getTestRun, getTestCase, type TestRunStatus } from "@/lib/api/testing.functions";

export const Route = createFileRoute("/testing/$runId")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Detalle de una ejecución de prueba del agente ARIA." },
    ],
  }),
  component: TestRunDetailPage,
});

const RUN_STATUS_STYLE: Record<TestRunStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  SUCCEEDED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

function TestRunDetailPage() {
  const { runId } = Route.useParams();
  const [pickedCaseId, setPickedCaseId] = useState<string | null>(null);

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

  // Sin selección del usuario se muestra el primer caso de la prueba.
  const selectedCaseId = pickedCaseId ?? runQuery.data?.cases[0]?.workflow_execution_id ?? null;

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
  const selectedSummary = run.cases.find((c) => c.workflow_execution_id === selectedCaseId);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={200}>
        <div className="px-8 pt-3 pb-1">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <nav className="flex items-center gap-2 text-[20px] font-semibold text-text-secondary min-w-0">
                <Link to="/testing" className="hover:text-primary shrink-0">
                  Testing
                </Link>
                <ChevronRight className="h-4 w-4 shrink-0" />
                <Hint content={run.name}>
                  <h1 className="text-text-primary truncate">{run.name}</h1>
                </Hint>
                <span
                  className={`text-[12px] font-semibold px-2.5 py-1 rounded-md shrink-0 ${RUN_STATUS_STYLE[run.status]}`}
                >
                  {run.status}
                </span>
              </nav>
              <p className="mt-0.5 text-[12px] text-text-secondary truncate">
                Archivo: <span className="font-medium text-text-primary">{run.dataset_name}</span>
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <RefreshControl lastRefresh={lastRefresh} onRefresh={refresh} />
              <Hint content="Volver a Testing">
                <Link
                  to="/testing"
                  aria-label="Volver a Testing"
                  className="h-9 w-9 grid place-items-center rounded-md border border-border text-primary hover:bg-surface transition-colors"
                >
                  <X className="h-5 w-5" />
                </Link>
              </Hint>
            </div>
          </div>

          <RunDetailTabs
            tabs={[
              {
                key: "cases",
                label: "Avance de casos",
                headerStat: {
                  hint: "Casos completados o fallidos, del total de la prueba.",
                  label: "Terminados",
                  value: `${run.succeeded + run.failed} de ${run.total}`,
                },
                content: (
                  <CasesPanel
                    run={run}
                    selectedCaseId={selectedCaseId}
                    onSelectCase={setPickedCaseId}
                  >
                    {!selectedCaseId && (
                      <div className="rounded-lg border border-dashed border-border px-5 py-12 text-center text-text-secondary text-[13px]">
                        Selecciona un caso de la lista para ver su resultado, los datos de la alerta
                        y el recorrido por el pipeline.
                      </div>
                    )}
                    {selectedCaseId && caseQuery.isLoading && (
                      <div className="rounded-lg border border-border px-5 py-12 text-center text-text-secondary text-[13px]">
                        Cargando caso…
                      </div>
                    )}
                    {selectedCaseId && caseQuery.isError && (
                      <div className="rounded-lg border border-border px-5 py-12 text-center text-danger text-[13px]">
                        No se pudo cargar el detalle del caso.
                      </div>
                    )}
                    {selectedSummary && caseQuery.data && (
                      <CaseDetail
                        key={selectedSummary.workflow_execution_id}
                        summary={selectedSummary}
                        detail={caseQuery.data}
                      />
                    )}
                  </CasesPanel>
                ),
              },
              ...(run.total_duration_stats || Object.keys(run.step_duration_stats).length > 0
                ? [
                    {
                      key: "durations",
                      label: "Tiempos de ejecución",
                      headerStat: run.total_duration_stats
                        ? {
                            hint: "El 95% de los casos tardó menos que este valor, desde que entró a la cola hasta que terminó.",
                            label: "95% de los casos",
                            value: `menos de ${formatDuration(run.total_duration_stats.p95_seconds)}`,
                          }
                        : undefined,
                      content: (
                        <RunDurationSummary
                          totalStats={run.total_duration_stats}
                          stepStats={run.step_duration_stats}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />

          {(run.analyst_agreement_metrics || run.ground_truth_metrics) && (
            <div className="mt-6">
              <ClassificationMetricsSection
                analystAgreement={run.analyst_agreement_metrics}
                groundTruth={run.ground_truth_metrics}
              />
            </div>
          )}
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
