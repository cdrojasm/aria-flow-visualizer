import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Play,
  Loader2,
  ChevronRight,
  Database,
  AlertTriangle,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  deleteTestRuns,
  getDatasets,
  listTestRuns,
  startTestRun,
  type TestRunResponse,
} from "@/lib/api/testing.functions";

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

// Overrides are optional and only apply to LLM-backed steps.
const OVERRIDE_STEPS = ["profiling", "classification", "adversarial", "analyst"] as const;
const OVERRIDE_LABELS: Record<(typeof OVERRIDE_STEPS)[number], string> = {
  profiling: "Profiling",
  classification: "Clasificación",
  adversarial: "Adversarial",
  analyst: "Analista",
};

const STATUS_STYLE: Record<TestRunResponse["status"], string> = {
  PENDING: "bg-warning/10 text-warning",
  RUNNING: "bg-primary/10 text-primary",
  SUCCEEDED: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

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
  const [promptOverrides, setPromptOverrides] = useState<Record<string, string>>({});
  const [modelOverrides, setModelOverrides] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const testRunsQuery = useQuery({
    queryKey: ["testRuns", order],
    queryFn: () => listTestRuns({ data: { order } }),
  });

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

  const startMutation = useMutation({
    mutationFn: () =>
      startTestRun({
        data: {
          name: runName.trim() || `Prueba ${new Date().toLocaleString()}`,
          dataset_name: selectedDataset!,
          config: {
            prompt_overrides: stripEmpty(promptOverrides),
            model_overrides: stripEmpty(modelOverrides),
            max_feedback_iterations: Math.max(0, parsedMaxAttempts - 1),
          },
          sample_size: parsedSampleSize,
        },
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["testRuns"] });
      navigate({ to: "/testing/$runId", params: { runId: res.test_run_id } });
    },
  });

  const datasets = datasetsQuery.data ?? [];
  const runs = testRunsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1000px] space-y-6">
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
              <label className="text-[11px] text-text-secondary block mb-1">Dataset</label>
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

        {/* What's actually configurable today */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
              Configuraciones disponibles
            </h2>
            <p className="text-[12px] text-text-secondary mt-1">
              Esto es lo único que el backend soporta hoy: un override de prompt y/o modelo por paso
              LLM, aplicado a todos los casos de esta prueba. Vacío = usa el default configurado en
              el servicio.
            </p>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {OVERRIDE_STEPS.map((step) => (
              <div key={step} className="border border-border rounded-lg p-3 space-y-2">
                <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                  {OVERRIDE_LABELS[step]}
                </p>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">
                    Prompt override
                  </label>
                  <input
                    value={promptOverrides[step] ?? ""}
                    onChange={(e) => setPromptOverrides((s) => ({ ...s, [step]: e.target.value }))}
                    placeholder="Usar default"
                    className="w-full rounded-md border border-border px-2 py-1.5 text-[12px] bg-background"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary block mb-1">
                    Model override
                  </label>
                  <input
                    value={modelOverrides[step] ?? ""}
                    onChange={(e) => setModelOverrides((s) => ({ ...s, [step]: e.target.value }))}
                    placeholder="Usar default (ej: gpt-4o-mini)"
                    className="w-full rounded-md border border-border px-2 py-1.5 text-[12px] bg-background"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

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
          {deleteMutation.isError && (
            <p className="px-5 py-2 text-[12px] text-danger">
              No se pudieron borrar las pruebas seleccionadas.
            </p>
          )}

          <div className="divide-y divide-border">
            {runs.map((run) => (
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
                  <span className="text-[12px] tabular-nums text-text-secondary w-40 shrink-0">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  <span className="text-[13px] font-medium text-text-primary flex-1 truncate">
                    {run.name}
                  </span>
                  <span className="text-[11px] text-text-secondary flex items-center gap-1 w-40 shrink-0">
                    <Database className="h-3 w-3" /> {run.dataset_name}
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
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function stripEmpty(m: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim() !== ""));
}
