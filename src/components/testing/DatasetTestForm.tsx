import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Play,
  Loader2,
  Upload,
  Download,
  Eye,
  ExternalLink,
  Radio,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

import { DialogFooter } from "@/components/ui/dialog";
import { startTestRun } from "@/lib/api/testing.functions";
import { getDatasets, uploadDataset } from "@/lib/api/datasets.functions";
import { listConfigurations, listConfigurationVersions } from "@/lib/api/configurations.functions";
import { downloadSampleDatasetCsv } from "@/lib/sampleDataset";
import { DatasetDetailModal } from "./DatasetDetailModal";

/* ─── Dataset strategy, extracted verbatim out of NewTestRunModal.tsx
   (Phase C - strategy switcher) ───────────────────────────────────────────
   Same fields, same validation, same POST /test-runs call, same
   navigate-to-/testing/$runId on success as before this file existed - only
   the Dialog/Tabs chrome moved up into NewTestRunModal.tsx. */

// Remembers the last configuración/versión picked across modal openings
// (and page reloads) - per the useRole.ts/configuracion.tsx localStorage
// convention. Dataset/name/sample-size intentionally aren't persisted here:
// those are per-run inputs, not a standing choice like which configuration
// lineage to test against.
const CONFIG_SELECTION_STORAGE_KEY = "aria.new-test-run.config-selection.v1";

type PersistedConfigSelection = {
  selectedConfigurationId: string | null;
  selectedConfigVersion: number | null;
};

export function DatasetTestForm({
  onClose,
  initialConfigurationId = null,
  initialConfigVersion = null,
}: {
  onClose: () => void;
  // Deep-link pre-fill (from /testing?configurationId=...&version=...) — set
  // by "Probar configuración" in Configuración. Takes priority over the
  // persisted last-used pick below: it names the exact version the user
  // just created and wants tested, not whatever they tested last time.
  initialConfigurationId?: string | null;
  initialConfigVersion?: number | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [runName, setRunName] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [showDatasetDetail, setShowDatasetDetail] = useState(false);
  const [sampleSize, setSampleSize] = useState("");
  // User-facing "intentos" = total classification tries (1 initial + N
  // feedback loops back from adversarial review). Backend's
  // max_feedback_iterations is intentos - 1; default 2 matches the
  // backend's own default of 1 (alert_dtos.py, schemas.py, test_run_port.py).
  const [maxAttempts, setMaxAttempts] = useState("2");
  const [selectedConfigurationId, setSelectedConfigurationId] = useState<string | null>(null);
  // null = latest version of the selected lineage (default). Set when the
  // user expands a lineage's version history and picks an older one.
  const [selectedConfigVersion, setSelectedConfigVersion] = useState<number | null>(null);
  const [expandedConfigId, setExpandedConfigId] = useState<string | null>(null);
  const [configSelectionHydrated, setConfigSelectionHydrated] = useState(false);

  // Restore the last-used configuración/versión once on mount - unless a
  // deep link named an exact one, which wins over the persisted pick.
  useEffect(() => {
    if (initialConfigurationId) {
      setSelectedConfigurationId(initialConfigurationId);
      setSelectedConfigVersion(initialConfigVersion);
      setConfigSelectionHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(CONFIG_SELECTION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedConfigSelection>;
        if (typeof parsed.selectedConfigurationId === "string") {
          setSelectedConfigurationId(parsed.selectedConfigurationId);
        }
        if (typeof parsed.selectedConfigVersion === "number") {
          setSelectedConfigVersion(parsed.selectedConfigVersion);
        }
      }
    } catch {
      // localStorage no disponible o corrupto - se queda en los valores por defecto.
    } finally {
      setConfigSelectionHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change, once past the restore above (otherwise this
  // fires first on the blank initial state and overwrites storage before
  // the restore effect's setState calls above ever take effect).
  useEffect(() => {
    if (!configSelectionHydrated) return;
    try {
      const toPersist: PersistedConfigSelection = {
        selectedConfigurationId,
        selectedConfigVersion,
      };
      localStorage.setItem(CONFIG_SELECTION_STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
      // localStorage no disponible - la preferencia solo dura la sesión actual.
    }
  }, [configSelectionHydrated, selectedConfigurationId, selectedConfigVersion]);

  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const configurationsQuery = useQuery({
    queryKey: ["configurations"],
    queryFn: () => listConfigurations(),
  });
  const configVersionsQuery = useQuery({
    queryKey: ["configurationVersions", expandedConfigId],
    queryFn: () => listConfigurationVersions({ data: { configurationId: expandedConfigId! } }),
    enabled: !!expandedConfigId,
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

  const parsedSampleSize = sampleSize.trim() ? Number(sampleSize) : undefined;
  const parsedMaxAttempts = maxAttempts.trim() ? Number(maxAttempts) : 2;
  const configurations = configurationsQuery.data ?? [];
  const selectedConfigurationLineage = configurations.find(
    (c) => c.configuration_id === selectedConfigurationId,
  );
  // Version to actually run against: the one explicitly picked from the
  // lineage's history, else the lineage's latest (list_latest's row).
  const selectedConfiguration =
    selectedConfigurationLineage && selectedConfigVersion != null
      ? { ...selectedConfigurationLineage, version: selectedConfigVersion }
      : selectedConfigurationLineage;

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
      onClose();
      navigate({ to: "/testing/$runId", params: { runId: res.test_run_id } });
    },
  });

  const datasets = datasetsQuery.data ?? [];

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] text-text-secondary block mb-1">Nombre (opcional)</label>
          <input
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="Ej: Regresión semanal"
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] bg-background"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="text-[11px] text-text-secondary">Dataset</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadSampleDatasetCsv()}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <Download className="h-3 w-3" /> Descargar dataset
              </button>
              <Link
                to="/biblioteca"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                Gestionar en Biblioteca <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
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
            <div className="flex items-center gap-2">
              <select
                value={selectedDataset ?? ""}
                onChange={(e) => setSelectedDataset(e.target.value || null)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-[13px] bg-background"
              >
                <option value="">Selecciona un dataset…</option>
                {datasets.map((ds) => (
                  <option key={ds.name} value={ds.name}>
                    {ds.name} ({ds.row_count} filas)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                title="Cargar dataset"
                className="inline-flex items-center justify-center text-primary border border-primary/30 rounded-md p-2 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDatasetDetail(true)}
                disabled={!selectedDataset}
                title="Ver detalle del dataset"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-2 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Eye className="h-3.5 w-3.5" /> Ver detalle
              </button>
            </div>
          )}
          {uploadMutation.isError && (
            <p className="text-[11px] text-danger mt-1">
              {(uploadMutation.error as Error).message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] text-text-secondary block mb-1">
              Cantidad de muestras (opcional)
            </label>
            <input
              type="number"
              min={1}
              value={sampleSize}
              onChange={(e) => setSampleSize(e.target.value)}
              placeholder="Todas las filas"
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
                onClick={() => {
                  setSelectedConfigurationId(null);
                  setSelectedConfigVersion(null);
                  setExpandedConfigId(null);
                }}
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
                const expanded = c.configuration_id === expandedConfigId;
                const pickedVersion =
                  selected && selectedConfigVersion != null ? selectedConfigVersion : c.version;
                return (
                  <div key={c.configuration_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConfigurationId(c.configuration_id);
                        setSelectedConfigVersion(null);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}
                    >
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate">
                          {c.name}:v{pickedVersion}
                        </span>
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">
                          {c.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.active && pickedVersion === c.version && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                            <Radio className="h-3.5 w-3.5" /> Producción
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          title="Ver otras versiones"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedConfigId(expanded ? null : c.configuration_id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.stopPropagation();
                            setExpandedConfigId(expanded ? null : c.configuration_id);
                          }}
                          className="p-0.5 text-text-secondary hover:text-text-primary"
                        >
                          {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </div>
                    </button>
                    {expanded && (
                      <div className="bg-surface/60 divide-y divide-border border-t border-border">
                        {configVersionsQuery.isLoading && (
                          <p className="px-3 py-2 pl-6 text-[11px] text-text-secondary">
                            Cargando versiones…
                          </p>
                        )}
                        {configVersionsQuery.isError && (
                          <p className="px-3 py-2 pl-6 text-[11px] text-danger">
                            No se pudieron cargar las versiones.
                          </p>
                        )}
                        {configVersionsQuery.isSuccess &&
                          [...configVersionsQuery.data]
                            .sort((a, b) => b.version - a.version)
                            .map((v) => {
                              const versionSelected = selected && pickedVersion === v.version;
                              return (
                                <button
                                  key={v.version}
                                  type="button"
                                  onClick={() => {
                                    setSelectedConfigurationId(c.configuration_id);
                                    setSelectedConfigVersion(v.version);
                                  }}
                                  className={`w-full flex items-center justify-between gap-2 pl-6 pr-3 py-1.5 text-left transition-colors ${versionSelected ? "bg-primary/10" : "hover:bg-surface"}`}
                                >
                                  <span className="text-[12px] text-text-primary">
                                    {c.name}:v{v.version}
                                  </span>
                                  {v.active && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                                      <Radio className="h-3.5 w-3.5" /> Producción
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="items-center sm:justify-start gap-3">
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
      </DialogFooter>

      <DatasetDetailModal
        datasetName={selectedDataset}
        open={showDatasetDetail}
        onClose={() => setShowDatasetDetail(false)}
      />
    </>
  );
}
