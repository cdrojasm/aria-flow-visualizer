import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, ChevronRight, Database, Eye, Trash2, RotateCcw, X } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NewTestRunPanel } from "@/components/testing/NewTestRunModal";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  ActionButton,
  ActionLink,
  DataTable,
  TruncText,
  type DataTableColumn,
} from "@/components/ui/DataTable";
import {
  deleteTestRuns,
  listTestRuns,
  startTestRun,
  type TestRunResponse,
} from "@/lib/api/testing.functions";
import { listConfigurations } from "@/lib/api/configurations.functions";
import { listScenarios, type ScenarioStatus } from "@/lib/api/eventSimulation.functions";

// Deep-link params for the "Probar configuración" button in Configuración
// (src/routes/configuracion.tsx): configurationId+version identify the
// exact saved version to pre-select in NewTestRunPanel, opened
// automatically when present — see TestingPage's mount effect below.
export const Route = createFileRoute("/testing/")({
  // Optional keys (not `key: value | undefined`) so plain `<Link to="/testing">`
  // elsewhere keeps working without a `search` prop.
  validateSearch: (
    search: Record<string, unknown>,
  ): { configurationId?: string; version?: number } => {
    const configurationId =
      typeof search.configurationId === "string" ? search.configurationId : undefined;
    const raw = search.version;
    const version =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))
          ? Number(raw)
          : undefined;
    return { configurationId, version };
  },
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Ejecuta pruebas del agente ARIA sobre datasets controlados.",
      },
    ],
  }),
  component: TestingPage,
});

const STATUS_STYLE: Record<TestRunResponse["status"], string> = {
  PENDING: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  SUCCEEDED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

// Scenarios (Generador strategy) aren't TestRunRecords - separate shape,
// separate microservice - so they get their own small section instead of
// being mixed into "Últimas pruebas"'s table/columns above.
const SCENARIO_STATUS_STYLE: Record<ScenarioStatus, string> = {
  DRAFT: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  PAUSED: "bg-warning/10 text-warning",
  COMPLETED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

function configurationLabel(
  ref: { configuration_id: string; version: number } | null,
  configurations: { configuration_id: string; name: string }[],
): string {
  if (!ref) return "Configuración activa al momento";
  const match = configurations.find((c) => c.configuration_id === ref.configuration_id);
  return `${match?.name ?? ref.configuration_id}:v${ref.version}`;
}

function buildRunColumns(
  configurations: { configuration_id: string; name: string }[],
): DataTableColumn<TestRunResponse>[] {
  return [
    {
      key: "created_at",
      label: "Fecha",
      minWidth: 110,
      sortValue: (run) => new Date(run.created_at).getTime(),
      render: (run) => (
        <span
          title={new Date(run.created_at).toLocaleString()}
          className="tabular-nums text-text-secondary whitespace-nowrap"
        >
          {new Date(run.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "name",
      label: "Nombre",
      minWidth: 180,
      sortValue: (run) => run.name,
      searchValue: (run) => run.name,
      render: (run) => (
        <TruncText maxWidth={240} className="font-medium text-text-primary">
          {run.name}
        </TruncText>
      ),
    },
    {
      key: "dataset",
      label: "Dataset",
      minWidth: 160,
      sortValue: (run) => run.dataset_name,
      searchValue: (run) => run.dataset_name,
      render: (run) => (
        <span className="inline-flex items-center gap-1 text-text-secondary">
          <Database className="h-3 w-3 shrink-0" />
          <TruncText maxWidth={200}>{run.dataset_name}</TruncText>
        </span>
      ),
    },
    {
      key: "configuration",
      label: "Configuración",
      minWidth: 170,
      sortValue: (run) => configurationLabel(run.config.configuration_ref, configurations),
      searchValue: (run) => configurationLabel(run.config.configuration_ref, configurations),
      render: (run) => (
        <TruncText maxWidth={220} className="text-text-secondary">
          {configurationLabel(run.config.configuration_ref, configurations)}
        </TruncText>
      ),
    },
    {
      key: "total",
      label: "Casos",
      minWidth: 80,
      align: "right",
      sortValue: (run) => run.total,
      render: (run) => <span className="text-text-secondary tabular-nums">{run.total}</span>,
    },
    {
      key: "status",
      label: "Estado",
      minWidth: 100,
      sortValue: (run) => run.status,
      render: (run) => (
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLE[run.status]}`}
        >
          {run.status}
        </span>
      ),
    },
  ];
}

function TestingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { configurationId: deepLinkConfigurationId, version: deepLinkVersion } = Route.useSearch();

  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [datasetFilter, setDatasetFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TestRunResponse["status"] | "">("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Deep link from Configuración's "Probar configuración" button: open the
  // modal pre-targeted at that exact version instead of making the user
  // reopen it and hunt for the version they just created.
  useEffect(() => {
    if (deepLinkConfigurationId) setShowNewRunModal(true);
  }, [deepLinkConfigurationId]);

  const configurationsQuery = useQuery({
    queryKey: ["configurations"],
    queryFn: () => listConfigurations(),
  });
  const testRunsQuery = useQuery({
    queryKey: ["testRuns"],
    queryFn: () => listTestRuns({ data: { order: "desc" } }),
    refetchInterval: 5_000,
  });
  const scenariosQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => listScenarios(),
    refetchInterval: 5_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (testRunIds: string[]) => deleteTestRuns({ data: { test_run_ids: testRunIds } }),
    onSuccess: () => {
      setSelectedRunIds(new Set());
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["testRuns"] });
    },
  });

  function toggleRunSelected(runId: string) {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }

  function toggleSelectAll(rows: TestRunResponse[]) {
    setSelectedRunIds((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return allSelected ? new Set() : new Set(rows.map((r) => r.id));
    });
  }

  function handleDeleteSelected() {
    if (selectedRunIds.size === 0) return;
    setShowDeleteConfirm(true);
  }

  // Re-dispatches a past run's exact config (prompt/model overrides,
  // max_feedback_iterations, configuration_ref) over its full dataset -
  // sample_size/sample_distribution aren't persisted on TestRunRecord, so a
  // sampled original run's retry runs the whole dataset instead of
  // reproducing the same sample.
  const retryMutation = useMutation({
    mutationFn: (run: TestRunResponse) =>
      startTestRun({
        data: {
          name: `${run.name} (reintento)`,
          dataset_name: run.dataset_name,
          config: {
            prompt_overrides: run.config.prompt_overrides,
            model_overrides: run.config.model_overrides,
            max_feedback_iterations: run.config.max_feedback_iterations,
            configuration_ref: run.config.configuration_ref ?? undefined,
          },
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["testRuns"] });
      navigate({ to: "/testing/$runId", params: { runId: res.test_run_id } });
    },
  });

  const configurations = configurationsQuery.data ?? [];
  const runs = testRunsQuery.data ?? [];
  const scenarios = scenariosQuery.data ?? [];
  const runDatasetNames = Array.from(new Set(runs.map((r) => r.dataset_name))).sort();
  const filteredRuns = runs.filter(
    (run) =>
      (!datasetFilter || run.dataset_name === datasetFilter) &&
      (!statusFilter || run.status === statusFilter),
  );
  const runColumns = useMemo(
    () => buildRunColumns(configurationsQuery.data ?? []),
    [configurationsQuery.data],
  );
  const hasActiveFilters = !!(datasetFilter || statusFilter);

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold text-text-primary">Testing del Agente</h1>
        </header>
        <div className="grid grid-cols-1 gap-6 items-start">
          <div className="space-y-6">
            {/* Last runs */}
            <DataTable
              storageKey="testing-runs"
              title="Últimas pruebas"
              description="Ejecuta el pipeline de 7 pasos sobre un dataset controlado y revisa el detalle por caso."
              itemLabel="prueba"
              rows={filteredRuns}
              rowKey={(run) => run.id}
              columns={runColumns}
              defaultSort={{ key: "created_at", dir: "desc" }}
              isLoading={testRunsQuery.isLoading}
              emptyLabel={
                runs.length > 0
                  ? "Ningún resultado coincide con los filtros."
                  : "Aún no hay pruebas ejecutadas."
              }
              error={
                <>
                  {testRunsQuery.isError && (
                    <p className="px-5 py-3 text-[13px] text-danger">
                      No se pudo cargar el historial.
                    </p>
                  )}
                  {deleteMutation.isError && (
                    <p className="px-5 py-2 text-[12px] text-danger">
                      No se pudieron borrar las pruebas seleccionadas.
                    </p>
                  )}
                  {retryMutation.isError && (
                    <p className="px-5 py-2 text-[12px] text-danger">
                      {(retryMutation.error as Error).message}
                    </p>
                  )}
                </>
              }
              selection={{
                selected: selectedRunIds,
                onToggle: toggleRunSelected,
                onToggleAll: toggleSelectAll,
                rowLabel: (run) => `Seleccionar prueba ${run.name}`,
              }}
              actionsWidth={130}
              actions={(run) => {
                const isRetrying =
                  retryMutation.isPending && retryMutation.variables?.id === run.id;
                return (
                  <>
                    <ActionLink
                      to="/testing/$runId"
                      params={{ runId: run.id }}
                      icon={<Eye className="h-3 w-3" />}
                    >
                      Ver
                    </ActionLink>
                    <ActionButton
                      tone="primary"
                      title="Nuevo intento con la misma configuración"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(run)}
                      icon={
                        isRetrying ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )
                      }
                    >
                      Repetir
                    </ActionButton>
                  </>
                );
              }}
              filters={
                <>
                  <select
                    value={datasetFilter}
                    onChange={(e) => setDatasetFilter(e.target.value)}
                    aria-label="Filtrar por dataset"
                    className="rounded-md border border-border px-2 h-8 text-[12px] bg-background"
                  >
                    <option value="">Todos los datasets</option>
                    {runDatasetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as TestRunResponse["status"] | "")
                    }
                    aria-label="Filtrar por estado"
                    className="rounded-md border border-border px-2 h-8 text-[12px] bg-background"
                  >
                    <option value="">Todos los estados</option>
                    {(Object.keys(STATUS_STYLE) as TestRunResponse["status"][]).map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  {hasActiveFilters && (
                    <ActionButton
                      icon={<X className="h-3 w-3" />}
                      onClick={() => {
                        setDatasetFilter("");
                        setStatusFilter("");
                      }}
                    >
                      Limpiar
                    </ActionButton>
                  )}
                </>
              }
              tableActions={
                <>
                  <ActionButton
                    tone="primary"
                    size="md"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    disabled={showNewRunModal}
                    onClick={() => setShowNewRunModal(true)}
                  >
                    Nueva prueba
                  </ActionButton>
                  {selectedRunIds.size > 0 && (
                    <ActionButton
                      tone="danger"
                      onClick={handleDeleteSelected}
                      disabled={deleteMutation.isPending}
                      icon={
                        deleteMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )
                      }
                    >
                      Borrar ({selectedRunIds.size})
                    </ActionButton>
                  )}
                </>
              }
            />

            {/* Generador scenarios - separate shape/microservice from
            TestRunRecord above, so a small section of its own instead of
            being squeezed into "Últimas pruebas"'s columns. */}
            {scenarios.length > 0 && (
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Escenarios de simulación
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Generadores de eventos sintéticos lanzados desde "Nueva prueba" → Generador.
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {scenarios.map((s) => (
                    <Link
                      key={s.id}
                      to="/testing/scenarios/$scenarioId"
                      params={{ scenarioId: s.id }}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-surface"
                    >
                      <span className="text-[13px] font-medium text-text-primary flex-1 truncate">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-text-secondary w-32 shrink-0">
                        {s.output_mode === "DATASET" ? "Dataset" : "Pipeline en vivo"}
                      </span>
                      <span className="text-[11px] text-text-secondary w-28 text-right shrink-0">
                        {s.events_emitted} eventos
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${SCENARIO_STATUS_STYLE[s.status]}`}
                      >
                        {s.status}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
          {showNewRunModal && (
            <NewTestRunPanel
              onClose={() => setShowNewRunModal(false)}
              initialConfigurationId={deepLinkConfigurationId ?? null}
              initialConfigVersion={deepLinkVersion ?? null}
            />
          )}
        </div>

        <ConfirmDeleteDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          itemName={`${selectedRunIds.size} prueba${selectedRunIds.size > 1 ? "s" : ""}`}
          consequence="Se borran también todos sus casos, alertas y operaciones asociadas. Esta acción no se puede deshacer."
          pending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(Array.from(selectedRunIds))}
        />
      </div>
    </DashboardLayout>
  );
}
