import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useRef, useState } from "react";
import {
  Play,
  Loader2,
  ChevronRight,
  Database,
  AlertTriangle,
  ArrowUpDown,
  Trash2,
  Upload,
  Radio,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DatasetDetailModal } from "@/components/testing/DatasetDetailModal";
import {
  deleteTestRuns,
  getDatasets,
  listTestRuns,
  startTestRun,
  uploadDataset,
  type TestRunResponse,
} from "@/lib/api/testing.functions";
import { listConfigurations } from "@/lib/api/configurations.functions";

export const Route = createFileRoute("/testing/")({
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

function configurationLabel(
  ref: { configuration_id: string; version: number } | null,
  configurations: { configuration_id: string; name: string }[],
): string {
  if (!ref) return "Configuración activa al momento";
  const match = configurations.find((c) => c.configuration_id === ref.configuration_id);
  return `${match?.name ?? ref.configuration_id}:${ref.version}`;
}

const TRUNCATE_MAX_CHARS = 23;

function truncateText(text: string, max = TRUNCATE_MAX_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function TestingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [runName, setRunName] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState("");
  // User-facing "intentos" = total classification tries (1 initial + N
  // feedback loops back from adversarial review). Backend's
  // max_feedback_iterations is intentos - 1; default 2 matches the
  // backend's own default of 1 (alert_dtos.py, schemas.py, test_run_port.py).
  const [maxAttempts, setMaxAttempts] = useState("2");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [datasetFilter, setDatasetFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TestRunResponse["status"] | "">("");

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const configurationsQuery = useQuery({
    queryKey: ["configurations"],
    queryFn: () => listConfigurations(),
  });
  const testRunsQuery = useQuery({
    queryKey: ["testRuns", order],
    queryFn: () => listTestRuns({ data: { order } }),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadDataset({ data: formData });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      setSelectedDataset(res.name);
    },
  });

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadMutation.mutate(file);
  }

  const deleteMutation = useMutation({
    mutationFn: (testRunIds: string[]) => deleteTestRuns({ data: { test_run_ids: testRunIds } }),
    onSuccess: () => {
      setSelectedRunIds(new Set());
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

  function handleDeleteSelected() {
    const ids = Array.from(selectedRunIds);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `¿Borrar ${ids.length} prueba${ids.length > 1 ? "s" : ""} y todos sus casos, alertas y operaciones asociadas? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    deleteMutation.mutate(ids);
  }

  const parsedSampleSize = sampleSize.trim() ? Number(sampleSize) : undefined;
  const parsedMaxAttempts = maxAttempts.trim() ? Number(maxAttempts) : 2;
  const selectedConfiguration = (configurationsQuery.data ?? []).find(
    (c) => c.configuration_id === selectedConfigurationId,
  );

  const startMutation = useMutation({
    mutationFn: () =>
      startTestRun({
        data: {
          name: runName.trim() || `Prueba ${new Date().toLocaleString()}`,
          dataset_name: selectedDataset!,
          config: {
            max_feedback_iterations: Math.max(0, parsedMaxAttempts - 1),
            configuration_ref: selectedConfiguration
              ? {
                  configuration_id: selectedConfiguration.configuration_id,
                  version: selectedConfiguration.version,
                }
              : undefined,
          },
          sample_size: parsedSampleSize,
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["testRuns"] });
      navigate({ to: "/testing/$runId", params: { runId: res.test_run_id } });
    },
  });

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

  const datasets = datasetsQuery.data ?? [];
  const configurations = configurationsQuery.data ?? [];
  const runs = testRunsQuery.data ?? [];
  const runDatasetNames = Array.from(new Set(runs.map((r) => r.dataset_name))).sort();
  const filteredRuns = runs.filter(
    (run) =>
      (!nameFilter || run.name.toLowerCase().includes(nameFilter.toLowerCase())) &&
      (!datasetFilter || run.dataset_name === datasetFilter) &&
      (!statusFilter || run.status === statusFilter),
  );
  const hasActiveFilters = !!(nameFilter || datasetFilter || statusFilter);

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold text-text-primary">Testing del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">
            Ejecuta el pipeline de 7 pasos sobre un dataset controlado y revisa el detalle por caso.
          </p>
        </header>

        {/* New run form */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 space-y-4">
          <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
            Nueva prueba
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] text-text-secondary block mb-1">
                Nombre (opcional)
              </label>
              <input
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="Ej: Regresión semanal"
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-text-secondary">Dataset</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-40"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Cargar dataset
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </div>
              {datasetsQuery.isLoading && (
                <p className="text-[12px] text-text-secondary py-2">Cargando datasets…</p>
              )}
              {datasetsQuery.isError && (
                <p className="text-[12px] text-danger py-2">No se pudieron cargar los datasets.</p>
              )}
              {datasetsQuery.isSuccess && (
                <select
                  value={selectedDataset ?? ""}
                  onChange={(e) => setSelectedDataset(e.target.value || null)}
                  className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background"
                >
                  <option value="">Selecciona un dataset…</option>
                  {datasets.map((ds) => (
                    <option key={ds.name} value={ds.name}>
                      {ds.name} ({ds.row_count} filas)
                    </option>
                  ))}
                </select>
              )}
              {uploadMutation.isError && (
                <p className="text-[11px] text-danger mt-1">
                  {(uploadMutation.error as Error).message}
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] text-text-secondary block mb-1">
                Cantidad de muestras (opcional)
              </label>
              <input
                type="number"
                min={1}
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                placeholder="Todas las filas del dataset"
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background"
              />
              <p className="text-[10px] text-text-secondary mt-1">
                Estratificado por no-risk / risk-suspected / risk según la distribución real del
                dataset.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-text-secondary block mb-1">
                Intentos máx. del clasificador
              </label>
              <input
                type="number"
                min={1}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background"
              />
              <p className="text-[10px] text-text-secondary mt-1">
                Veces que clasificación puede reintentar tras ser rechazada por adversarial antes de
                escalar a un analista.
              </p>
            </div>
          </div>

          {/* Configuration selector - which stored ConfigurationRecord
              (by lineage, pinned to its latest version) this run resolves
              segments against. Empty selection = whatever is active at
              dispatch time, same as before this existed. */}
          <div>
            <label className="text-[11px] text-text-secondary block mb-1">
              Configuración a probar (opcional)
            </label>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto divide-y divide-border">
                {configurationsQuery.isLoading && (
                  <p className="px-3 py-3 text-[12px] text-text-secondary">
                    Cargando configuraciones…
                  </p>
                )}
                {configurationsQuery.isError && (
                  <p className="px-3 py-3 text-[12px] text-danger">
                    No se pudieron cargar las configuraciones.
                  </p>
                )}
                {configurationsQuery.isSuccess && configurations.length === 0 && (
                  <p className="px-3 py-3 text-[12px] text-text-secondary">
                    Aún no hay configuraciones creadas.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedConfigurationId(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    selectedConfigurationId === null ? "bg-primary/5" : "hover:bg-surface"
                  }`}
                >
                  <span className="text-[13px] font-medium text-text-primary">
                    La configuración activa al momento
                  </span>
                </button>
                {configurations.map((c) => {
                  const selected = c.configuration_id === selectedConfigurationId;
                  return (
                    <button
                      key={c.configuration_id}
                      type="button"
                      onClick={() => setSelectedConfigurationId(c.configuration_id)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}
                    >
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate">
                          {c.name}:{c.version}
                        </span>
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">
                          {c.description}
                        </p>
                      </div>
                      {c.active && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                          <Radio className="h-3.5 w-3.5" /> Producción
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => startMutation.mutate()}
              disabled={!selectedDataset || startMutation.isPending}
              className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Iniciar prueba
            </button>
            {startMutation.isError && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                {(startMutation.error as Error).message}
              </span>
            )}
          </div>
        </section>

        <DatasetDetailModal datasetName={selectedDataset} onClose={() => setSelectedDataset(null)} />

        {/* Last runs */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Últimas pruebas</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Historial de ejecuciones.</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedRunIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-1.5 bg-danger/10 text-danger px-3 py-1.5 rounded-md text-[12px] font-medium hover:bg-danger/20 disabled:opacity-40"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Borrar seleccionadas ({selectedRunIds.size})
                </button>
              )}
              <button
                onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
                className="inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-md text-[12px] text-text-secondary hover:bg-surface"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Fecha: {order === "desc" ? "más reciente primero" : "más antigua primero"}
              </button>
            </div>
          </div>

          {/* Organization controls: client-side filters over the already
              fetched page of runs (no dedicated filter query params on the
              backend today). */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap bg-surface/50">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Buscar por nombre…"
                className="pl-8 pr-3 py-1.5 rounded-md border border-border text-[12px] bg-background w-52"
              />
            </div>
            <select
              value={datasetFilter}
              onChange={(e) => setDatasetFilter(e.target.value)}
              className="rounded-md border border-border px-2 py-1.5 text-[12px] bg-background"
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
              onChange={(e) => setStatusFilter(e.target.value as TestRunResponse["status"] | "")}
              className="rounded-md border border-border px-2 py-1.5 text-[12px] bg-background"
            >
              <option value="">Todos los estados</option>
              {(Object.keys(STATUS_STYLE) as TestRunResponse["status"][]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setNameFilter("");
                  setDatasetFilter("");
                  setStatusFilter("");
                }}
                className="inline-flex items-center gap-1 text-[12px] text-text-secondary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" /> Limpiar filtros
              </button>
            )}
            <span className="text-[11px] text-text-secondary ml-auto">
              {filteredRuns.length} de {runs.length}
            </span>
          </div>

          {testRunsQuery.isLoading && (
            <p className="px-5 py-6 text-[13px] text-text-secondary">Cargando…</p>
          )}
          {testRunsQuery.isError && (
            <p className="px-5 py-6 text-[13px] text-danger">No se pudo cargar el historial.</p>
          )}
          {testRunsQuery.isSuccess && runs.length === 0 && (
            <p className="px-5 py-6 text-[13px] text-text-secondary">
              Aún no hay pruebas ejecutadas.
            </p>
          )}
          {testRunsQuery.isSuccess && runs.length > 0 && filteredRuns.length === 0 && (
            <p className="px-5 py-6 text-[13px] text-text-secondary">
              Ningún resultado coincide con los filtros.
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

          <div className="divide-y divide-border">
            {filteredRuns.map((run) => {
              const isRetrying = retryMutation.isPending && retryMutation.variables?.id === run.id;
              return (
                <div key={run.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={selectedRunIds.has(run.id)}
                    onChange={() => toggleRunSelected(run.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                    aria-label={`Seleccionar prueba ${run.name}`}
                  />
                  <Link
                    to="/testing/$runId"
                    params={{ runId: run.id }}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <span
                      title={new Date(run.created_at).toLocaleString()}
                      className="text-[12px] tabular-nums text-text-secondary w-20 shrink-0"
                    >
                      {new Date(run.created_at).toLocaleDateString()}
                    </span>
                    <span
                      title={run.name}
                      className="text-[13px] font-medium text-text-primary flex-1 truncate"
                    >
                      {truncateText(run.name)}
                    </span>
                    <span
                      title={run.dataset_name}
                      className="text-[11px] text-text-secondary flex items-center gap-1 w-40 shrink-0"
                    >
                      <Database className="h-3 w-3 shrink-0" /> {truncateText(run.dataset_name)}
                    </span>
                    <span
                      title={configurationLabel(run.config.configuration_ref, configurations)}
                      className="text-[11px] text-text-secondary truncate w-44 shrink-0"
                    >
                      {truncateText(
                        configurationLabel(run.config.configuration_ref, configurations),
                      )}
                    </span>
                    <span className="text-[11px] text-text-secondary w-20 text-right shrink-0">
                      {run.total} casos
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${STATUS_STYLE[run.status]}`}
                    >
                      {run.status}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                  </Link>
                  <button
                    type="button"
                    title="Nuevo intento con la misma configuración"
                    onClick={() => retryMutation.mutate(run)}
                    disabled={retryMutation.isPending}
                    className="inline-flex items-center text-primary hover:text-primary/70 disabled:opacity-40 shrink-0"
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
