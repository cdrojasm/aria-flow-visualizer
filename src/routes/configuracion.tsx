import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Save, X,
  PlayCircle, Loader2, AlertTriangle, ShieldCheck, ShieldAlert,
  Power, Clock, Radio, Eye, ExternalLink, FileSpreadsheet,
  Rocket, Zap, CalendarClock, Download, DollarSign,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SegmentAgentTab } from "@/components/configuracion/SegmentAgentTab";
import { SegmentEvaluationTab } from "@/components/configuracion/SegmentEvaluationTab";
import { SegmentSamplingTab } from "@/components/configuracion/SegmentSamplingTab";
import { SegmentoTab } from "@/components/configuracion/SegmentoTab";
import { TagMultiSelect } from "@/components/configuracion/TagMultiSelect";
import { Field, LimitField } from "@/components/configuracion/shared/FormControls";
import { ResolutionMethodCatalogManager } from "@/components/configuracion/ResolutionMethodCatalogManager";
import { registerTestRun, type TestRunIndicators } from "@/data/testRuns";
import {
  PROFILE_COLORS, defaultSettings, buildSegmentsFromChannels, RESOLUTION_TAG_LABELS,
  type TabKey, type DayProfile,
  type SamplingIntervalUnit,
  type ShortageBehavior, type ResolutionTag, type AnalystCapacity, type DraftResult, type TestCleanupPolicy,
  type VersionEntry, type AgentConfig, type ConfigSettings,
  type SegmentCode, type SegmentSettings,
} from "@/data/configs";
import {
  listConfigurations, getActiveConfiguration, listConfigurationVersions,
  getConfigurationVersion, createConfiguration, activateConfiguration, testConfiguration,
  type CreateConfigurationRequest, type TestConfigurationResponse,
} from "@/lib/api/configurations.functions";
import { toCreateConfigurationRequest, settingsFromConfigurationDetail } from "@/lib/api/configurationMapping";
import { uploadAnalystCapacityImport, getAnalystCapacityImport } from "@/lib/api/analystCapacity.functions";
import { listChannelLibraryEntries } from "@/lib/api/channelLibrary.functions";
import { listResolutionMethods, type ResolutionMethodResponse } from "@/lib/api/resolutionMethod.functions";
import { listTestRuns } from "@/lib/api/testing.functions";
import { useApiHealth } from "@/hooks/useApiHealth";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Configura ARIA a nivel de infraestructura, operación, test y agente." },
    ],
  }),
  component: ConfiguracionPage,
});

/* ─── Static data ────────────────────────────────────── */

const TAB_META: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "infra", label: "Infraestructura" },
  { key: "ops", label: "Operación" },
  { key: "test", label: "Test" },
  { key: "segmento", label: "Segmento" },
  { key: "segmentoAgente", label: "Agente" },
  { key: "segmentoMuestreo", label: "Muestreo" },
  { key: "segmentoEvaluacion", label: "Evaluación" },
];

const CHANGE_SECTION_LABELS: Record<string, string> = {
  general: "General",
  infra: "Infraestructura",
  ops: "Operación",
  test: "Test",
  segments: "Segmentos",
};

const formatChangePath = (path: string) => path
  .split(".")
  .map((part, index) => index === 0
    ? (CHANGE_SECTION_LABELS[part] ?? part)
    : part.replaceAll("_", " "))
  .join(" › ");

const formatChangeValue = (value: unknown) => {
  if (value === null || value === undefined) return "No definido";
  if (value === true) return "Activado";
  if (value === false) return "Desactivado";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
};

/* ─── Page ───────────────────────────────────────────── */

type DraftState = {
  workingCopy: ConfigSettings;
  dirtyTabs: TabKey[];
  testState: "idle" | "testing";
  lastTestResult?: DraftResult;
  // Version this draft was seeded from — sent back as based_on_version so
  // the backend can reject the save (409) if the lineage moved on since.
  // undefined for a brand-new lineage (nothing to conflict with).
  basedOnVersion?: number;
};

type PendingSave = {
  forceNewVersion: boolean;
  request: CreateConfigurationRequest;
  preview: TestConfigurationResponse;
};

function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const { healthy: apiHealthy, checked: apiChecked } = useApiHealth();
  const apiDown = apiChecked && !apiHealthy;

  // Real backend-sourced lineages (each entry = latest version of a
  // configuration_id). New, not-yet-saved configs live only in
  // localConfigs+drafts until the first "Guardar como nueva versión"
  // persists them (see saveVersion) — mirrors the old mock's versions:[]
  // draft.
  const configsQuery = useQuery({ queryKey: ["configurations"], queryFn: () => listConfigurations() });
  const activeQuery = useQuery({ queryKey: ["activeConfiguration"], queryFn: () => getActiveConfiguration() });
  // Gates "Activar esta versión" below: test runs (src/routes/testing.index.tsx)
  // have no configuration_id link back to a draft yet, so this is a coarse
  // system-wide guardrail ("has ARIA ever passed a real test") rather than
  // "has THIS draft been tested" - tighten once that link exists.
  const testRunsQuery = useQuery({ queryKey: ["testRuns", "desc"], queryFn: () => listTestRuns({ data: { order: "desc" } }) });
  const hasSucceededTestRun = (testRunsQuery.data ?? []).some((run) => run.status === "SUCCEEDED");
  // Same resolution-method catalog AnalystPlaybook uses (see
  // SegmentAnalystSection.tsx) - shortage behavior picks from it too now,
  // via the block_soft/block_hard tags reserved for this use.
  const resolutionMethodsQuery = useQuery({
    queryKey: ["resolutionMethods"],
    queryFn: () => listResolutionMethods({ data: { activeOnly: true } }),
  });
  const resolutionMethods = resolutionMethodsQuery.data ?? [];
  const [showShortageResolutionCatalog, setShowShortageResolutionCatalog] = useState(false);
  // Segment keys come from this catalog now (see biblioteca.tsx's
  // "Canales" tab) - a fresh draft with no base config seeds its segments
  // from these instead of the old fixed 2-value enum.
  const channelsQuery = useQuery({
    queryKey: ["channelLibrary"],
    queryFn: () => listChannelLibraryEntries({ data: { activeOnly: true } }),
  });
  const channels = channelsQuery.data ?? [];
  const channelLabels = Object.fromEntries(channels.map((c) => [c.code, c.name]));

  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | "draft">("draft");
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const [localConfigs, setLocalConfigs] = useState<{ id: string; name: string; description: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [versionTestRuns, setVersionTestRuns] = useState<Record<string, TestRunIndicators>>({});

  const [newConfigForm, setNewConfigForm] = useState<{ name: string; baseId: string } | null>(null);
  const [configPickerCollapsed, setConfigPickerCollapsed] = useState(true);
  const [versionPickerCollapsed, setVersionPickerCollapsed] = useState(true);

  const [deployTarget, setDeployTarget] = useState<{ configId: string; version: number } | null>(null);
  const [deployMode, setDeployMode] = useState<"immediate" | "window">("immediate");
  const [deployConfirmText, setDeployConfirmText] = useState("");
  const [scheduledDeploys, setScheduledDeploys] = useState<Record<string, { version: number; hour: string }>>({});
  // Set when saveVersion's POST comes back 409 — the lineage moved on since
  // this draft was seeded. Cleared by reloadLatestVersion or a new save attempt.
  const [versionConflict, setVersionConflict] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savePreviewLoading, setSavePreviewLoading] = useState(false);
  const [savePreviewError, setSavePreviewError] = useState<string | null>(null);

  const backendConfigs = configsQuery.data ?? [];
  const isTempId = (id: string | null) => !!id && localConfigs.some((c) => c.id === id);
  const configListItems = [
    ...backendConfigs.map((c) => ({ id: c.configuration_id, name: c.name, description: c.description, latestVersion: c.version as number | null })),
    ...localConfigs.map((c) => ({ id: c.id, name: c.name, description: c.description, latestVersion: null as number | null })),
  ];

  const running = activeQuery.data
    ? { configId: activeQuery.data.configuration_id, version: activeQuery.data.version }
    : { configId: "", version: -1 };

  // Pick a default selection once configs have loaded: whatever is active
  // in production, else the first config in the list.
  useEffect(() => {
    if (selectedConfigId) return;
    if (activeQuery.data) { setSelectedConfigId(activeQuery.data.configuration_id); setSelectedVersion(activeQuery.data.version); return; }
    if (configListItems.length > 0) { setSelectedConfigId(configListItems[0].id); setSelectedVersion("draft"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId, activeQuery.data, configListItems.length]);

  // Seed a config's draft from its latest saved version the first time it's
  // selected in a session — after that, local edits (drafts state) win.
  useEffect(() => {
    if (!selectedConfigId || isTempId(selectedConfigId) || drafts[selectedConfigId]) return;
    const summary = backendConfigs.find((c) => c.configuration_id === selectedConfigId);
    if (!summary) return;
    let cancelled = false;
    queryClient.fetchQuery({
      queryKey: ["configurationVersion", selectedConfigId, summary.version],
      queryFn: () => getConfigurationVersion({ data: { configurationId: selectedConfigId, version: summary.version } }),
    }).then((detail) => {
      if (cancelled) return;
      setDrafts((prev) => (prev[selectedConfigId] ? prev : { ...prev, [selectedConfigId]: { workingCopy: settingsFromConfigurationDetail(detail), dirtyTabs: [], testState: "idle", basedOnVersion: summary.version } }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId, backendConfigs.length]);

  const versionsQuery = useQuery({
    queryKey: ["configurationVersions", selectedConfigId],
    queryFn: () => listConfigurationVersions({ data: { configurationId: selectedConfigId! } }),
    enabled: !!selectedConfigId && !isTempId(selectedConfigId),
  });

  const historicalDetailQuery = useQuery({
    queryKey: ["configurationVersion", selectedConfigId, selectedVersion],
    queryFn: () => getConfigurationVersion({ data: { configurationId: selectedConfigId!, version: selectedVersion as number } }),
    enabled: !!selectedConfigId && selectedVersion !== "draft" && !isTempId(selectedConfigId),
  });

  const selectedListItem = configListItems.find((c) => c.id === selectedConfigId);
  const selectedDraft = selectedConfigId ? drafts[selectedConfigId] : undefined;
  const backendVersions = versionsQuery.data ?? [];
  const versions: VersionEntry[] = [...backendVersions]
    .sort((a, b) => a.version - b.version)
    .map((v) => ({
      version: v.version,
      settings: v.version === selectedVersion && historicalDetailQuery.data ? settingsFromConfigurationDetail(historicalDetailQuery.data) : undefined,
      testRun: versionTestRuns[`${selectedConfigId}:${v.version}`],
      everActivated: v.ever_activated,
    }));

  const selectedConfig: AgentConfig = {
    id: selectedConfigId ?? "",
    name: selectedListItem?.name ?? "",
    description: selectedListItem?.description ?? "",
    versions,
    workingCopy: selectedDraft?.workingCopy ?? defaultSettings(),
    dirtyTabs: selectedDraft?.dirtyTabs ?? [],
    testState: selectedDraft?.testState ?? "idle",
    lastTestResult: selectedDraft?.lastTestResult,
  };

  const configs: AgentConfig[] = configListItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    versions: [],
    workingCopy: defaultSettings(),
    dirtyTabs: drafts[item.id]?.dirtyTabs ?? [],
    testState: drafts[item.id]?.testState ?? "idle",
    lastTestResult: drafts[item.id]?.lastTestResult,
  }));

  const isDraftView = selectedVersion === "draft";
  const viewingVersion = isDraftView ? undefined : versions.find((v) => v.version === selectedVersion);
  const settingsLoading = !isDraftView && !viewingVersion?.settings;
  const settings = isDraftView ? selectedConfig.workingCopy : (viewingVersion?.settings ?? defaultSettings());
  const readOnlyHistorical = !isDraftView;
  const locked = readOnlyHistorical || selectedConfig.testState === "testing" || settingsLoading || apiDown || savePreviewLoading;
  const unsaved = isTempId(selectedConfigId);
  // Mirrors CreateConfigurationUseCase's overwrite condition: a save only
  // mints a new version if the draft's base was never activated - and only
  // once that base version is actually known (not unsaved/loading), so the
  // label defaults to the safe "nueva versión" phrasing while unsure.
  const basedOnVersionEntry = selectedDraft?.basedOnVersion != null
    ? versions.find((v) => v.version === selectedDraft.basedOnVersion)
    : undefined;
  const willOverwrite = !unsaved && !!basedOnVersionEntry && basedOnVersionEntry.everActivated === false;
  const showDraftRow = selectedConfig.dirtyTabs.length > 0 || (selectedListItem?.latestVersion == null);

  const defaultVersionFor = (c: AgentConfig): number | "draft" => {
    if (drafts[c.id]?.dirtyTabs.length) return "draft";
    const item = configListItems.find((x) => x.id === c.id);
    if (!item || item.latestVersion == null) return "draft";
    return item.latestVersion;
  };

  const selectConfigRow = (c: AgentConfig) => { setSelectedConfigId(c.id); setSelectedVersion(defaultVersionFor(c)); };

  const patchSettings = (tab: TabKey, patch: Partial<ConfigSettings>) => {
    if (!isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [], testState: "idle" as const };
      const dirtyTabs = current.dirtyTabs.includes(tab) ? current.dirtyTabs : [...current.dirtyTabs, tab];
      return { ...prev, [selectedConfigId]: { ...current, workingCopy: { ...current.workingCopy, ...patch }, dirtyTabs, lastTestResult: undefined } };
    });
  };

  const patchSegment = (tab: TabKey, code: SegmentCode, patch: Partial<SegmentSettings>) => {
    if (!isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [], testState: "idle" as const };
      const dirtyTabs = current.dirtyTabs.includes(tab) ? current.dirtyTabs : [...current.dirtyTabs, tab];
      const segments = { ...current.workingCopy.segments, [code]: { ...current.workingCopy.segments[code], ...patch } };
      return { ...prev, [selectedConfigId]: { ...current, workingCopy: { ...current.workingCopy, segments }, dirtyTabs, lastTestResult: undefined } };
    });
  };

  // ponytail: still a local simulation — the backend has no endpoint for
  // "quickly validate a draft config" (only the full dataset-driven
  // /testing test-run exists, a heavier, separate feature). Wire this to
  // startTestRun (src/lib/api/testing.functions.ts) if that's meant to gate
  // activation for real.
  const runCycle = () => {
    if (!isDraftView || !selectedConfigId || isTempId(selectedConfigId)) return;
    setDrafts((prev) => ({ ...prev, [selectedConfigId]: { ...prev[selectedConfigId], testState: "testing" } }));
    setTimeout(() => {
      const accuracy = 92 + Math.random() * 7;
      const result: DraftResult = { accuracy, samples: 1240, passed: accuracy >= 95 };
      setDrafts((prev) => ({ ...prev, [selectedConfigId]: { ...prev[selectedConfigId], testState: "idle", dirtyTabs: [], lastTestResult: result } }));
    }, 1600);
  };

  const createMutation = useMutation({
    mutationFn: (request: CreateConfigurationRequest) => createConfiguration({ data: request }),
  });
  const activateMutation = useMutation({
    mutationFn: (payload: { configurationId: string; version: number }) => activateConfiguration({ data: payload }),
  });

  // Saves the draft as a new version — does NOT touch production. Going
  // live is a separate, explicit step via openDeploy/confirmDeploy below
  // (the same "Desplegar" flow every other saved version already uses),
  // which is where the real-test-run gate (hasSucceededTestRun) applies.
  // forceNewVersion skips based_on_version so the backend always mints
  // latest+1 instead of overwriting in place, even when the latest version
  // was never activated (see create_configuration.py's `overwrite` rule).
  const buildSaveRequest = (forceNewVersion: boolean): CreateConfigurationRequest => {
    const wasTemp = isTempId(selectedConfigId);
    return toCreateConfigurationRequest(selectedDraft?.workingCopy ?? settings, {
      name: selectedConfig.name,
      description: selectedConfig.description,
      configurationId: wasTemp ? null : selectedConfigId,
      basedOnVersion: wasTemp || forceNewVersion ? null : selectedDraft?.basedOnVersion,
    });
  };

  const requestSave = async (forceNewVersion = false) => {
    if (!isDraftView || !selectedConfigId || locked) return;
    setSavePreviewError(null);
    setVersionConflict(false);
    setSavePreviewLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    const request = buildSaveRequest(forceNewVersion);
    try {
      const preview = await testConfiguration({ data: request, signal: controller.signal });
      if (!preview.valid) throw new Error("La configuración propuesta no superó la validación.");
      setPendingSave({ forceNewVersion, request, preview });
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) {
        setVersionConflict(true);
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setSavePreviewError("La validación tardó más de 5 segundos. Intenta guardar nuevamente.");
      } else {
        setSavePreviewError(err instanceof Error ? err.message : "No se pudo validar la configuración.");
      }
    } finally {
      window.clearTimeout(timeout);
      setSavePreviewLoading(false);
    }
  };

  const saveVersion = async (request: CreateConfigurationRequest) => {
    if (!isDraftView || !selectedConfigId || locked) return;
    const draftResult = selectedDraft?.lastTestResult;
    const wasTemp = isTempId(selectedConfigId);
    setVersionConflict(false);
    let created;
    try {
      created = await createMutation.mutateAsync(request);
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) { setVersionConflict(true); return; }
      throw err;
    }

    // The validation cycle is optional at save time (it can take a while,
    // per user request) — only attach a testRun stat if one was actually
    // run against this draft.
    if (draftResult) {
      const testRun: TestRunIndicators = {
        id: `run-${created.configuration_id}-v${created.version}-${Date.now()}`,
        configId: created.configuration_id,
        configName: created.name,
        version: created.version,
        date: new Date().toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        dataset: "Dataset de validación",
        duration: "—",
        processed: draftResult.samples,
        total: draftResult.samples,
        failed: 0,
        fraudeNoDetectado: `${(100 - draftResult.accuracy).toFixed(1)}%`,
        falsosPositivos: `${(Math.random() * 10).toFixed(1)}%`,
        tiempoAhorrado: `${(Math.random() * 8 + 2).toFixed(1)} h`,
        latencia: `${Math.round(800 + Math.random() * 400)} ms`,
        accuracy: draftResult.accuracy,
        passed: draftResult.passed,
      };
      registerTestRun(testRun);
      setVersionTestRuns((prev) => ({ ...prev, [`${created.configuration_id}:${created.version}`]: testRun }));
    }

    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedConfigId];
      next[created.configuration_id] = { workingCopy: settingsFromConfigurationDetail(created), dirtyTabs: [], testState: "idle", basedOnVersion: created.version };
      return next;
    });
    if (wasTemp) setLocalConfigs((prev) => prev.filter((c) => c.id !== selectedConfigId));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      queryClient.invalidateQueries({ queryKey: ["configurationVersions", created.configuration_id] }),
    ]);
    setSelectedConfigId(created.configuration_id);
    setSelectedVersion(created.version);
  };

  const confirmSave = async () => {
    if (!pendingSave) return;
    await saveVersion(pendingSave.request);
    setPendingSave(null);
  };

  // ponytail: drops the local draft rather than rebasing it onto the new
  // latest version — simplest correct response to a 409, at the cost of
  // losing unsaved edits. Add a merge/rebase UX if that turns out to bite.
  const reloadLatestVersion = () => {
    if (!selectedConfigId) return;
    setVersionConflict(false);
    setDrafts((prev) => { const next = { ...prev }; delete next[selectedConfigId]; return next; });
    queryClient.invalidateQueries({ queryKey: ["configurations"] });
  };

  const openDeploy = (configId: string, version: number) => {
    setDeployTarget({ configId, version });
    setDeployMode("immediate");
    setDeployConfirmText("");
  };
  const closeDeploy = () => { setDeployTarget(null); setDeployConfirmText(""); };

  const deployDetailQuery = useQuery({
    queryKey: ["configurationVersion", deployTarget?.configId, deployTarget?.version],
    queryFn: () => getConfigurationVersion({ data: { configurationId: deployTarget!.configId, version: deployTarget!.version } }),
    enabled: !!deployTarget,
  });
  const deployWindowEnabled = deployDetailQuery.data?.general.migration_window_enabled ?? false;
  const deployWindowHour = deployDetailQuery.data ? `${String(deployDetailQuery.data.general.migration_window_hour).padStart(2, "0")}:00` : "02:00";
  const deployConfirmed = deployConfirmText.trim().toUpperCase() === "CONFIRMAR";
  const canConfirmDeploy = deployConfirmed && hasSucceededTestRun && (deployMode === "immediate" || deployWindowEnabled);

  const confirmDeploy = async () => {
    if (!deployTarget || !canConfirmDeploy) return;
    const { configId, version } = deployTarget;
    if (deployMode === "immediate") {
      await activateMutation.mutateAsync({ configurationId: configId, version });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activeConfiguration"] }),
        queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      ]);
      setScheduledDeploys((prev) => { const n = { ...prev }; delete n[configId]; return n; });
    } else {
      // ponytail: no backend concept of a scheduled/windowed activation yet
      // (activate is immediate-only) — stays client-local until one exists.
      setScheduledDeploys((prev) => ({ ...prev, [configId]: { version, hour: deployWindowHour } }));
    }
    closeDeploy();
  };

  const cancelScheduledDeploy = (configId: string) =>
    setScheduledDeploys((prev) => { const n = { ...prev }; delete n[configId]; return n; });

  const createConfig = async () => {
    if (!newConfigForm || !newConfigForm.name.trim()) return;
    const baseItem = configListItems.find((c) => c.id === newConfigForm.baseId);
    let baseSettings: ConfigSettings;
    const baseDraft = baseItem ? drafts[baseItem.id] : undefined;
    if (baseDraft) {
      baseSettings = baseDraft.workingCopy;
    } else if (baseItem?.latestVersion != null) {
      const detail = await queryClient.fetchQuery({
        queryKey: ["configurationVersion", baseItem.id, baseItem.latestVersion],
        queryFn: () => getConfigurationVersion({ data: { configurationId: baseItem.id, version: baseItem.latestVersion! } }),
      });
      baseSettings = settingsFromConfigurationDetail(detail);
    } else {
      baseSettings = defaultSettings();
      if (channels.length > 0) {
        baseSettings = { ...baseSettings, segments: buildSegmentsFromChannels(channels) };
      }
    }
    const clonedSettings: ConfigSettings = {
      ...baseSettings,
      queueDiscardBehavior: { ...baseSettings.queueDiscardBehavior },
      voicebotShortageBehavior: { ...baseSettings.voicebotShortageBehavior },
      analystShortageBehavior: { ...baseSettings.analystShortageBehavior },
      // ponytail: JSON round-trip clone, fine while SegmentSettings holds only JSON-safe data.
      segments: JSON.parse(JSON.stringify(baseSettings.segments)),
    };
    const id = `cfg-temp-${Date.now()}`;
    setLocalConfigs((prev) => [...prev, { id, name: newConfigForm.name.trim(), description: baseItem ? `Basada en ${baseItem.name}.` : "" }]);
    setDrafts((prev) => ({ ...prev, [id]: { workingCopy: clonedSettings, dirtyTabs: [], testState: "idle" } }));
    setSelectedConfigId(id);
    setSelectedVersion("draft");
    setActiveTab("general");
    setNewConfigForm(null);
  };

  const dirtyTabLabels = selectedConfig.dirtyTabs.map((k) => TAB_META.find((t) => t.key === k)?.label).filter(Boolean).join(", ");

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="mb-2">
          <h1 className="text-[20px] font-semibold text-text-primary">Configuración del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">Configura a ARIA aquí. Es posible realizar configuraciones a nivel de infraestructura, operación, test, agente.</p>
        </header>

        {/* Sticky historical-version banner — always visible above the picker while browsing an old version */}
        {readOnlyHistorical && (
          <div className="sticky top-0 z-20 -mx-8 px-8 py-2 bg-background/95 backdrop-blur border-b border-border">
            {settingsLoading ? (
              <div className="flex items-center gap-2.5 bg-text-secondary/10 border border-border rounded-lg px-4 py-2.5">
                <Loader2 className="h-4 w-4 text-text-secondary shrink-0 animate-spin" />
                <p className="text-[12px] text-text-primary">Cargando versión v{selectedVersion}…</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-2.5">
                <Eye className="h-4 w-4 text-warning shrink-0" />
                <p className="text-[12px] text-text-primary">
                  Viendo la versión <span className="font-medium">v{selectedVersion}</span> — histórica, de solo lectura.
                </p>
                <button onClick={() => setSelectedVersion("draft")}
                  className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/10 shrink-0">
                  <Pencil className="h-3.5 w-3.5" /> Iniciar nueva versión basada en v{selectedVersion}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Config + version selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">Configuraciones</h2>
            <button onClick={() => setNewConfigForm({ name: "", baseId: selectedConfigId ?? "" })}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nueva configuración
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <button onClick={() => setConfigPickerCollapsed((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary">
                Configuración
                {configPickerCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              {configPickerCollapsed ? (
                <button onClick={() => setConfigPickerCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface">
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-text-primary truncate">{selectedListItem?.name ?? "—"}</span>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">{selectedListItem?.description}</p>
                  </div>
                </button>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {apiDown ? (
                    <div className="px-3 py-6 text-center">
                      <p className="text-[13px] font-medium text-danger">No disponible</p>
                      <p className="text-[11px] text-text-secondary mt-1">Verifica el proveedor del servicio.</p>
                    </div>
                  ) : configs.map((c) => {
                    const selected = c.id === selectedConfigId;
                    const isRunning = running.configId === c.id;
                    return (
                      <button key={c.id} onClick={() => selectConfigRow(c)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}>
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-text-primary truncate">{c.name}</span>
                          <p className="text-[11px] text-text-secondary truncate mt-0.5">{c.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.dirtyTabs.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Cambios sin guardar" />}
                          {scheduledDeploys[c.id] && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Despliegue en ventana programado — v${scheduledDeploys[c.id].version} a las ${scheduledDeploys[c.id].hour}`}>
                              <CalendarClock className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {isRunning && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                              <Radio className="h-3.5 w-3.5" /> Producción
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <button onClick={() => setVersionPickerCollapsed((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary">
                Versión
                {versionPickerCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              {versionPickerCollapsed ? (
                <button onClick={() => setVersionPickerCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface">
                  <span className={`text-[13px] font-medium ${isDraftView ? "text-warning" : "text-text-primary"}`}>
                    {isDraftView ? "Cambios sin guardar" : `v${selectedVersion}`}
                  </span>
                </button>
              ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {showDraftRow && (
                  <button onClick={() => setSelectedVersion("draft")}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${isDraftView ? "bg-primary/5" : "hover:bg-surface"}`}>
                    <div>
                      <span className="text-[13px] font-medium text-warning">Cambios sin guardar</span>
                      <p className="text-[11px] text-text-secondary">Borrador editable, aún no validado.</p>
                    </div>
                  </button>
                )}
                {[...selectedConfig.versions].reverse().map((v) => {
                  const isRunningVersion = running.configId === selectedConfig.id && running.version === v.version;
                  const isSelected = !isDraftView && selectedVersion === v.version;
                  const scheduled = scheduledDeploys[selectedConfig.id];
                  const isScheduledVersion = scheduled?.version === v.version;
                  return (
                    <div key={v.version} className="group">
                      <div role="button" tabIndex={0} onClick={() => setSelectedVersion(v.version)}
                        onKeyDown={(e) => { if (e.key === "Enter") setSelectedVersion(v.version); }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-surface"}`}>
                        <div>
                          <span className="text-[13px] font-medium text-text-primary">v{v.version}</span>
                          <p className="text-[11px] text-text-secondary">
                            {v.testRun ? `${v.testRun.date} · ${v.testRun.accuracy.toFixed(1)}% precisión` : "Sin datos de ciclo en esta sesión"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isScheduledVersion && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Programado para las ${scheduled!.hour}`}>
                              <CalendarClock className="h-3.5 w-3.5" /> Programado
                            </span>
                          )}
                          {isRunningVersion ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                              <Radio className="h-3.5 w-3.5" /> Producción
                            </span>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); openDeploy(selectedConfig.id, v.version); }}
                              title="Desplegar a producción"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10">
                              <Rocket className="h-3.5 w-3.5" /> Desplegar
                            </button>
                          )}
                        </div>
                      </div>
                      {v.testRun && (
                        <Link to="/testing/$runId" params={{ runId: v.testRun.id }} onClick={(e) => e.stopPropagation()}
                          className="hidden group-hover:flex flex-col gap-1.5 mx-3 mb-2 p-2.5 rounded-md border border-border bg-surface hover:border-primary/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-text-primary">Salida del test guardado</span>
                            <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-text-secondary">
                            <span>Fraude no detectado: <b className="text-text-primary font-medium">{v.testRun.fraudeNoDetectado}</b></span>
                            <span>Falsos positivos: <b className="text-text-primary font-medium">{v.testRun.falsosPositivos}</b></span>
                            <span>Tiempo ahorrado: <b className="text-text-primary font-medium">{v.testRun.tiempoAhorrado}</b></span>
                            <span>Latencia: <b className="text-text-primary font-medium">{v.testRun.latencia}</b></span>
                          </div>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        </section>

        {versionConflict && (
          <div className="flex items-center gap-2.5 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[12px] text-text-primary">
              Alguien más guardó una versión más nueva de esta configuración desde que cargaste este borrador. Recarga la última versión antes de reintentar — tus cambios sin guardar se perderán.
            </p>
            <button onClick={reloadLatestVersion}
              className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-danger border border-danger/30 rounded-md px-2.5 py-1 hover:bg-danger/10 shrink-0">
              Recargar última versión
            </button>
          </div>
        )}

        {savePreviewError && (
          <div className="flex items-center gap-2.5 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[12px] text-text-primary">{savePreviewError}</p>
            <button onClick={() => setSavePreviewError(null)} className="ml-auto text-text-secondary hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isDraftView && (selectedConfig.dirtyTabs.length > 0 || selectedConfig.lastTestResult) && (
          <section className="bg-card rounded-xl border border-warning/30 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-6 py-4 border-b border-warning/30 bg-warning/5 rounded-t-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <h2 className="text-[14px] font-semibold text-text-primary">Ciclo de validación</h2>
              </div>
              <p className="text-[12px] text-text-secondary mt-0.5">
                {dirtyTabLabels
                  ? <>Cambios sin validar en <span className="font-medium">{dirtyTabLabels}</span>. El ciclo de prueba puede tardar — puedes guardar esta configuración {willOverwrite ? "sin esperarlo" : "como nueva versión sin esperarlo"}.</>
                  : `El ciclo de prueba puede tardar — puedes guardar esta configuración ${willOverwrite ? "sin esperarlo" : "como nueva versión sin esperarlo"}.`}
              </p>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <button onClick={runCycle} disabled={locked || unsaved} title={unsaved ? "Guarda esta configuración como versión antes de correr el ciclo" : undefined}
                  className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {selectedConfig.testState === "testing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  {selectedConfig.testState === "testing" ? "Corriendo ciclo…" : "Correr ciclo"}
                </button>
                <button onClick={() => requestSave(false)} disabled={locked}
                  className="inline-flex items-center gap-2 border border-primary text-primary px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed">
                  {savePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savePreviewLoading ? "Validando cambios…" : willOverwrite ? `Guardar cambios en v${selectedDraft?.basedOnVersion}` : "Guardar como nueva versión"}
                </button>
                {willOverwrite && (
                  <button onClick={() => requestSave(true)} disabled={locked}
                    className="inline-flex items-center gap-2 text-primary px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Plus className="h-4 w-4" /> Guardar como nueva versión
                  </button>
                )}
              </div>

              {unsaved && (
                <p className="text-[11px] text-warning">Guarda esta configuración como versión primero — el ciclo de validación corre sobre una versión guardada.</p>
              )}
              {willOverwrite && (
                <p className="text-[11px] text-text-secondary">
                  Esta versión nunca se ha desplegado a producción — "Guardar cambios" sobrescribe v{selectedDraft?.basedOnVersion} en vez de crear una versión nueva. Usa "Guardar como nueva versión" para conservar v{selectedDraft?.basedOnVersion} y crear v{(selectedDraft?.basedOnVersion ?? 0) + 1} aparte.
                </p>
              )}

              {!hasSucceededTestRun && !testRunsQuery.isLoading ? (
                <p className="text-[11px] text-warning">
                  Esta configuración no ha sido probada y no puede desplegarse hasta satisfacer esta condición — corre al menos un test en Testing. <Link to="/testing" className="underline">Ir a Testing</Link>
                </p>
              ) : (
                <p className="text-[11px] text-text-secondary">
                  Guardar no pone la versión en producción. Usa "Desplegar" desde el historial de versiones para llevarla a producción.
                </p>
              )}

              {selectedConfig.lastTestResult && !locked && (
                <div className={`rounded-lg border p-4 ${selectedConfig.lastTestResult.passed ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {selectedConfig.lastTestResult.passed ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-danger" />}
                    <span className={`text-[13px] font-semibold ${selectedConfig.lastTestResult.passed ? "text-success" : "text-danger"}`}>
                      {selectedConfig.lastTestResult.passed ? "Ciclo aprobado" : "Ciclo no aprobado — precisión bajo el umbral (95%)"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[12px]">
                    <div>
                      <p className="text-text-secondary">Precisión</p>
                      <p className="text-[16px] font-semibold text-text-primary font-mono">{selectedConfig.lastTestResult.accuracy.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-text-secondary">Alertas evaluadas</p>
                      <p className="text-[16px] font-semibold text-text-primary font-mono">{selectedConfig.lastTestResult.samples.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {!selectedConfig.lastTestResult && !locked && (
                <p className="text-[12px] text-text-secondary">Sin resultados todavía. Corre el ciclo para poder activar esta configuración.</p>
              )}
            </div>
          </section>
        )}

        {selectedConfig.testState === "testing" && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
            <p className="text-[12px] text-text-primary">Ciclo de validación en curso — edición bloqueada para evitar comportamiento inconsistente y pérdida de trazabilidad.</p>
          </div>
        )}

        {scheduledDeploys[selectedConfig.id] && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[12px] text-text-primary">
              Despliegue en ventana programado: <span className="font-medium">v{scheduledDeploys[selectedConfig.id].version}</span> se aplicará a las <span className="font-medium">{scheduledDeploys[selectedConfig.id].hour}</span>.
            </p>
            <button onClick={() => cancelScheduledDeploy(selectedConfig.id)} className="ml-auto text-[12px] font-medium text-danger hover:underline shrink-0">Cancelar despliegue</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {TAB_META.map((t) => {
            const active = activeTab === t.key;
            const dirty = selectedConfig.dirtyTabs.includes(t.key);
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)} disabled={apiDown}
                className={`relative px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"} ${apiDown ? "opacity-40 cursor-not-allowed" : ""}`}>
                {t.label}
                {dirty && <span className="absolute top-1.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warning" />}
              </button>
            );
          })}
        </div>

        <fieldset disabled={locked} className="contents">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Estado del agente */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Estado del agente</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Enciende o apaga la operación de ARIA para esta configuración.</p>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center justify-center h-9 w-9 rounded-full ${settings.agentEnabled ? "bg-success/10 text-success" : "bg-text-secondary/10 text-text-secondary"}`}>
                      <Power className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">{settings.agentEnabled ? "Agente encendido" : "Agente apagado"}</p>
                      <p className="text-[12px] text-text-secondary">{settings.agentEnabled ? "ARIA está procesando alertas normalmente." : "ARIA no procesará nuevas alertas hasta que se encienda."}</p>
                    </div>
                  </div>
                  <button onClick={() => patchSettings("general", { agentEnabled: !settings.agentEnabled })}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium ${settings.agentEnabled ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-success text-white hover:bg-success/90"}`}>
                    <Power className="h-4 w-4" /> {settings.agentEnabled ? "Apagar" : "Prender"}
                  </button>
                </div>
                <div className="px-6 pb-6 flex flex-wrap gap-3 border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-4 flex-1 min-w-[260px] rounded-lg border border-border p-4">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">Escalado a analistas</p>
                      <p className="text-[12px] text-text-secondary mt-0.5">{settings.analystEscalationEnabled ? "ARIA puede escalar alertas a un analista humano." : "ARIA no escalará alertas a analistas."}</p>
                    </div>
                    <button onClick={() => patchSettings("general", { analystEscalationEnabled: !settings.analystEscalationEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings.analystEscalationEnabled ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.analystEscalationEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 flex-1 min-w-[260px] rounded-lg border border-border p-4">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">Escalado a voicebot</p>
                      <p className="text-[12px] text-text-secondary mt-0.5">{settings.voicebotEscalationEnabled ? "ARIA puede escalar alertas a voicebot." : "ARIA no escalará alertas a voicebot."}</p>
                    </div>
                    <button onClick={() => patchSettings("general", { voicebotEscalationEnabled: !settings.voicebotEscalationEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings.voicebotEscalationEnabled ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.voicebotEscalationEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              </section>

              {/* Ventana de migración */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Ventana de migración de configuración</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Define la hora en la que se aplican los cambios de configuración: ARIA procesa y cierra la cola de alertas pendientes, aplica la nueva configuración y reinicia la operación.</p>
                </div>
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[13px] font-medium text-text-primary">Migración programada</label>
                      <p className="text-[12px] text-text-secondary mt-0.5">Si está desactivada, la activación ocurre de inmediato al correr el ciclo.</p>
                    </div>
                    <button onClick={() => patchSettings("general", { migrationWindowEnabled: !settings.migrationWindowEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.migrationWindowEnabled ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.migrationWindowEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  {settings.migrationWindowEnabled && (
                    <Field label="Hora de migración" hint="Hora del día en que se cierra la cola, se cambia la configuración y se reinicia la operación.">
                      <div className="flex items-center gap-2 max-w-[180px]">
                        <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                        <input type="time" value={settings.migrationWindowHour} onChange={(e) => patchSettings("general", { migrationWindowHour: e.target.value })}
                          className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                      </div>
                    </Field>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === "infra" && (
            <div className="space-y-6">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Límites operativos</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Controla el consumo de recursos del agente.</p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField label="Máxima cantidad de instancias del agente" hint="Número máximo de sub-agentes ejecutándose en paralelo." value={settings.maxInstances} onChange={(v) => patchSettings("infra", { maxInstances: v })} min={1} max={32} suffix="instancias" />
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-text-primary">Autoescalado de instancias</label>
                    <p className="text-[12px] text-text-secondary mt-0.5 mb-3">Permitir que ARIA escale dinámicamente hasta el límite definido.</p>
                    <button onClick={() => patchSettings("infra", { autoScale: !settings.autoScale })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoScale ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.autoScale ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Retención de histórico de fraude</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Controla cuándo se mueve y elimina el histórico de fraude entre la base de datos activa y el almacenamiento en frío (cold storage).</p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField label="Retención en base de datos" hint="Tiempo desde su creación tras el cual un registro del histórico de fraude se mueve de la base de datos activa al cold storage." value={settings.fraudHistoryDbRetentionDays} onChange={(v) => patchSettings("infra", { fraudHistoryDbRetentionDays: v })} min={1} max={3650} suffix="días" />
                  <LimitField label="Retención en cold storage" hint="Tiempo adicional tras el cual un registro se elimina definitivamente del cold storage." value={settings.fraudHistoryColdStorageRetentionMonths} onChange={(v) => patchSettings("infra", { fraudHistoryColdStorageRetentionMonths: v })} min={1} max={120} suffix="meses" />
                </div>
              </section>
            </div>
          )}

          {activeTab === "ops" && (
            <div className="space-y-6">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Voicebot</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Capacidad del recurso físico de voicebot.</p>
                </div>
                <div className="p-6 space-y-6">
                  <LimitField label="Máximo de llamadas concurrentes" hint="Cantidad máxima de llamadas simultáneas que el componente voicebot puede sostener en paralelo." value={settings.voicebotMaxConcurrentCalls} onChange={(v) => patchSettings("ops", { voicebotMaxConcurrentCalls: v })} min={1} max={500} suffix="llamadas" />
                  <Field label="Escasez de voicebot" hint="Qué debe hacer ARIA cuando no logra asignar una llamada de voicebot disponible para una alerta.">
                    <ShortageBehaviorEditor name="voicebot-shortage" excludeTag="send_to_voicebot" resolutionMethods={resolutionMethods} onManage={() => setShowShortageResolutionCatalog(true)} value={settings.voicebotShortageBehavior} onChange={(v) => patchSettings("ops", { voicebotShortageBehavior: v })} />
                  </Field>
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Analista — disponibilidad</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Cantidad de analistas listos para escalar alertas, por hora del día. Define perfiles de disponibilidad y asígnalos a días del mes (ej. días de pago).</p>
                </div>
                <div className="p-6 space-y-6">
                  <AnalystCapacityEditor value={settings.analystCapacity} onChange={(v) => patchSettings("ops", { analystCapacity: v })} />
                  <Field label="Escasez de analistas" hint="Qué debe hacer ARIA cuando no hay analistas disponibles para recibir una alerta escalada.">
                    <ShortageBehaviorEditor name="analyst-shortage" excludeTag="scale_to_analyst" resolutionMethods={resolutionMethods} onManage={() => setShowShortageResolutionCatalog(true)} value={settings.analystShortageBehavior} onChange={(v) => patchSettings("ops", { analystShortageBehavior: v })} />
                  </Field>
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Manejo de encolamiento</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Tiempo máximo que una alerta puede esperar en cola antes de ser saltada (skip), y monto mínimo para que valga la pena encolarla.</p>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field label="Tiempo de vida máximo en cola" hint="Si una alerta lleva encolada más de este tiempo, ARIA la saltea en vez de procesarla.">
                    <div className="flex items-center gap-2 max-w-xs">
                      <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                      <input type="number" min={1} value={settings.queueMaxLifetimeValue}
                        onChange={(e) => patchSettings("ops", { queueMaxLifetimeValue: Number(e.target.value) })}
                        className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                      <select value={settings.queueMaxLifetimeUnit}
                        onChange={(e) => patchSettings("ops", { queueMaxLifetimeUnit: e.target.value as SamplingIntervalUnit })}
                        className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                        <option value="days">Días</option>
                      </select>
                    </div>
                  </Field>
                  <Field label="Descartar por monto" hint="Si el monto de la alerta es menor a este valor, ARIA la descarta en vez de encolarla.">
                    <div className="flex items-center gap-2 max-w-xs">
                      <DollarSign className="h-4 w-4 text-text-secondary shrink-0" />
                      <input type="number" min={0} value={settings.queueDiscardAmountThreshold}
                        onChange={(e) => patchSettings("ops", { queueDiscardAmountThreshold: Number(e.target.value) })}
                        className="w-32 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                      <span className="text-[12px] text-text-secondary">0 = sin descarte por monto</span>
                    </div>
                  </Field>
                  <div className="md:col-span-2 flex items-center justify-between">
                    <div>
                      <label className="text-[13px] font-medium text-text-primary">Restringir por regla disparada</label>
                      <p className="text-[12px] text-text-secondary mt-0.5">
                        {settings.queueRuleFilterMode === "not_belongs"
                          ? "Si está activo, se descartan las alertas cuya regla disparada pertenezca a la lista; el resto se encola."
                          : "Si está activo, solo se encolan alertas cuya regla disparada pertenezca a la lista; el resto se descarta."}
                      </p>
                    </div>
                    <button onClick={() => patchSettings("ops", { queueRuleFilterEnabled: !settings.queueRuleFilterEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${settings.queueRuleFilterEnabled ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.queueRuleFilterEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  {settings.queueRuleFilterEnabled && (
                    <div className="md:col-span-2 space-y-4">
                      <Field label="Condición de la lista" hint="Define si la lista de abajo es de reglas permitidas (pertenencia) o de reglas excluidas (no pertenencia).">
                        <div className="inline-flex rounded-md border border-border p-0.5 bg-background">
                          <button type="button" onClick={() => patchSettings("ops", { queueRuleFilterMode: "belongs" })}
                            className={`h-8 px-3 rounded text-[13px] font-medium transition-colors ${settings.queueRuleFilterMode === "belongs" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                            Pertenece a la lista
                          </button>
                          <button type="button" onClick={() => patchSettings("ops", { queueRuleFilterMode: "not_belongs" })}
                            className={`h-8 px-3 rounded text-[13px] font-medium transition-colors ${settings.queueRuleFilterMode === "not_belongs" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}>
                            No pertenece a la lista
                          </button>
                        </div>
                      </Field>
                      <Field
                        label={settings.queueRuleFilterMode === "not_belongs" ? "Reglas disparadas excluidas de cola" : "Reglas disparadas permitidas en cola"}
                        hint={settings.queueRuleFilterMode === "not_belongs"
                          ? "Alertas cuya regla disparada esté en esta lista se descartan en vez de encolarse."
                          : "Alertas cuya regla disparada no esté en esta lista se descartan en vez de encolarse."}
                      >
                        <TagMultiSelect category="triggered_rule" value={settings.queueAllowedTriggeredRules} onChange={(v) => patchSettings("ops", { queueAllowedTriggeredRules: v })} />
                      </Field>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Field label="Descarte de cola" hint="Qué debe hacer ARIA con una alerta en vez de encolarla normalmente, ya sea por tiempo de vida, monto mínimo o filtro de regla disparada.">
                      <ShortageBehaviorEditor name="queue-discard" resolutionMethods={resolutionMethods} onManage={() => setShowShortageResolutionCatalog(true)} value={settings.queueDiscardBehavior} onChange={(v) => patchSettings("ops", { queueDiscardBehavior: v })} />
                    </Field>
                  </div>
                </div>
              </section>
            </div>
          )}

        </fieldset>

        {activeTab === "test" && (
          <div className="space-y-6">
            <fieldset disabled={locked} className="contents">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Escala del ciclo de test</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Controla cuántas instancias y experimentos usa el ciclo de validación al correr.</p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField label="Máxima cantidad de instancias para test" hint="Número de sub-agentes en paralelo usados exclusivamente durante el ciclo de validación." value={settings.maxTestInstances} onChange={(v) => patchSettings("test", { maxTestInstances: v })} min={1} max={32} suffix="instancias" />
                  <LimitField label="Máximo de experimentos concurrentes" hint="Cuántos ciclos de validación (de la misma o distintas configuraciones) pueden correr al mismo tiempo." value={settings.maxConcurrentExperiments} onChange={(v) => patchSettings("test", { maxConcurrentExperiments: v })} min={1} max={20} suffix="experimentos" />
                  <LimitField label="Timeout por experimento" hint="Minutos máximos que puede tomar un ciclo antes de marcarse como fallido y liberar sus instancias." value={settings.experimentTimeoutMinutes} onChange={(v) => patchSettings("test", { experimentTimeoutMinutes: v })} min={5} max={180} suffix="minutos" />
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Almacenamiento de resultados de test</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Cuántos resultados de ciclos se conservan y qué hacer cuando se supera el límite.</p>
                </div>
                <div className="p-6 space-y-5">
                  <LimitField label="Máxima cantidad de test runs almacenados" hint="Tope de resultados de ciclos guardados por configuración." value={settings.maxStoredTestRuns} onChange={(v) => patchSettings("test", { maxStoredTestRuns: v })} min={1} max={100} suffix="runs" />
                  <Field label="Política de limpieza" hint="Qué hacer cuando se alcanza el máximo de test runs almacenados.">
                    <select value={settings.testCleanupPolicy} onChange={(e) => patchSettings("test", { testCleanupPolicy: e.target.value as TestCleanupPolicy })}
                      className="w-full max-w-xs h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                      <option value="oldest">Borrar automáticamente los más antiguos</option>
                      <option value="failed-first">Borrar automáticamente los fallidos primero</option>
                      <option value="manual">No borrar — requiere limpieza manual</option>
                    </select>
                  </Field>
                </div>
              </section>
            </fieldset>
          </div>
        )}

        {activeTab === "segmento" && (
          <fieldset disabled={locked} className="contents">
            <SegmentoTab
              value={settings.segments}
              onChange={(segments) => patchSettings("segmento", { segments })}
              channels={channels}
              disabled={locked}
            />
          </fieldset>
        )}

        {activeTab === "segmentoAgente" && (
          <SegmentAgentTab
            value={settings.segments}
            onChange={(code, patch) => patchSegment("segmentoAgente", code, patch)}
            channelLabels={channelLabels}
            disabled={locked}
          />
        )}

        {activeTab === "segmentoMuestreo" && (
          <SegmentSamplingTab
            value={settings.segments}
            onChange={(code, patch) => patchSegment("segmentoMuestreo", code, patch)}
            channelLabels={channelLabels}
            disabled={locked}
          />
        )}

        {activeTab === "segmentoEvaluacion" && (
          <SegmentEvaluationTab
            value={settings.segments}
            onChange={(code, patch) => patchSegment("segmentoEvaluacion", code, patch)}
            channelLabels={channelLabels}
            disabled={locked}
          />
        )}
      </div>


      {/* Save confirmation modal — populated by POST /configuration/test. */}
      {pendingSave && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">Confirmar cambios de configuración</h3>
              </div>
              <button onClick={() => setPendingSave(null)} disabled={createMutation.isPending} className="text-text-secondary hover:text-text-primary disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Revisa los cambios antes de {pendingSave.forceNewVersion ? "crear la nueva versión" : willOverwrite ? `sobrescribir v${selectedDraft?.basedOnVersion}` : "guardar la nueva versión"}.
              </p>

              {pendingSave.preview.warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12px] font-medium text-text-primary">{warning}</p>
                </div>
              ))}

              <div>
                <h4 className="text-[12px] font-semibold text-text-primary mb-2">
                  Cambios que se guardarán ({pendingSave.preview.changes.length})
                </h4>
                {pendingSave.preview.changes.length === 0 ? (
                  <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[12px] text-text-secondary">
                    No se detectaron cambios de valores. Se conservará la configuración propuesta tal como está.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {pendingSave.preview.changes.map((change) => (
                      <div key={change.path} className="px-4 py-3">
                        <p className="text-[12px] font-medium text-text-primary capitalize">{formatChangePath(change.path)}</p>
                        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-[11px]">
                          <span className="text-text-secondary break-all">{formatChangeValue(change.previous)}</span>
                          <span className="text-text-secondary">→</span>
                          <span className="text-primary font-medium break-all">{formatChangeValue(change.proposed)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setPendingSave(null)} disabled={createMutation.isPending}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmSave} disabled={createMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {createMutation.isPending ? "Guardando…" : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* New config modal */}
      {newConfigForm && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setNewConfigForm(null)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Nueva configuración</h3>
              <button onClick={() => setNewConfigForm(null)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre">
                <input value={newConfigForm.name} onChange={(e) => setNewConfigForm({ ...newConfigForm, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Ej: Canario 5%" />
              </Field>
              <Field label="Basada en" hint="Clona las taxonomías, límites y prompts de la configuración elegida.">
                <select value={newConfigForm.baseId} onChange={(e) => setNewConfigForm({ ...newConfigForm, baseId: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setNewConfigForm(null)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={createConfig} disabled={!newConfigForm.name.trim()}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                Crear borrador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy to production modal */}
      {deployTarget && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={closeDeploy}>
          <div className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">Desplegar v{deployTarget.version} a producción</h3>
              </div>
              <button onClick={closeDeploy} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Esta versión de <span className="font-medium text-text-primary">{configs.find((c) => c.id === deployTarget.configId)?.name}</span> reemplazará la configuración activa en producción. Elige cómo aplicar el cambio.
              </p>

              <div className="space-y-2.5">
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${deployMode === "immediate" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
                  <input type="radio" name="deploy-mode" checked={deployMode === "immediate"} onChange={() => setDeployMode("immediate")} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Zap className="h-3.5 w-3.5 text-warning" /> Despliegue inmediato
                    </span>
                    <p className="text-[12px] text-text-secondary mt-0.5">La versión reemplaza la configuración de producción de inmediato. Las alertas en curso se procesan con la nueva configuración tan pronto se confirme.</p>
                  </span>
                </label>

                <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${!deployWindowEnabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${deployMode === "window" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
                  <input type="radio" name="deploy-mode" checked={deployMode === "window"} disabled={!deployWindowEnabled} onChange={() => setDeployMode("window")} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Despliegue en ventana
                    </span>
                    {deployWindowEnabled ? (
                      <p className="text-[12px] text-text-secondary mt-0.5">Se aplica en la próxima ventana de migración (<span className="font-medium text-text-primary">{deployWindowHour}</span>): ARIA cierra la cola de alertas pendientes, aplica esta versión y reinicia la operación.</p>
                    ) : (
                      <p className="text-[12px] text-text-secondary mt-0.5">Esta versión no tiene ventana de migración configurada. Actívala en la pestaña General para usar esta opción.</p>
                    )}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-text-primary mb-1">Escribe CONFIRMAR para autorizar el despliegue</label>
                <input value={deployConfirmText} onChange={(e) => setDeployConfirmText(e.target.value)} placeholder="CONFIRMAR"
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
              </div>

              {!hasSucceededTestRun && !testRunsQuery.isLoading && (
                <p className="text-[12px] text-warning">
                  Esta configuración no ha sido probada y no puede desplegarse hasta satisfacer esta condición — corre al menos un test en Testing. <Link to="/testing" className="underline">Ir a Testing</Link>
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={closeDeploy} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={confirmDeploy} disabled={!canConfirmDeploy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                <Rocket className="h-4 w-4" /> {deployMode === "immediate" ? "Desplegar ahora" : "Programar despliegue"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ResolutionMethodCatalogManager
        open={showShortageResolutionCatalog}
        onOpenChange={setShowShortageResolutionCatalog}
      />
    </DashboardLayout>
  );
}


/* ─── Analyst capacity editor ────────────────────────── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function AnalystCapacityEditor({ value, onChange }: { value: AnalystCapacity; onChange: (v: AnalystCapacity) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [importInfo, setImportInfo] = useState<{ file: string; count: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadAnalystCapacityImport({ data: formData });
    },
  });

  const importQuery = useQuery({
    queryKey: ["analystCapacityImport", pollingTaskId],
    queryFn: () => getAnalystCapacityImport({ data: { taskId: pollingTaskId! } }),
    enabled: !!pollingTaskId,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 1200 : false),
  });

  useEffect(() => {
    const result = importQuery.data;
    if (!result || result.status === "PENDING") return;
    if (result.status === "READY") {
      const importedProfiles: DayProfile[] = result.profiles.map((p) => ({ ...p }));
      const dayOverrides = { ...value.dayOverrides };
      for (const [day, profileId] of Object.entries(result.day_overrides)) dayOverrides[Number(day)] = profileId;
      onChange({ ...value, profiles: [...value.profiles, ...importedProfiles], dayOverrides });
      setImportState("done");
      setImportInfo({ file: pendingFileName ?? "", count: importedProfiles.length });
      setTimeout(() => setImportState("idle"), 4000);
    } else {
      setImportState("error");
      setImportError(result.error ?? "No se pudo importar el archivo.");
    }
    setPollingTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importQuery.data]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportState("loading");
    setImportError(null);
    setPendingFileName(file.name);
    uploadMutation.mutate(file, {
      onSuccess: (res) => setPollingTaskId(res.task_id),
      onError: (err) => {
        setImportState("error");
        setImportError(err instanceof Error ? err.message : String(err));
      },
    });
  };

  const colorFor = (profileId: string) => {
    const idx = value.profiles.findIndex((p) => p.id === profileId);
    return PROFILE_COLORS[idx % PROFILE_COLORS.length] ?? "bg-text-secondary/10 text-text-secondary border-border";
  };

  const updateProfile = (id: string, patch: Partial<DayProfile>) =>
    onChange({ ...value, profiles: value.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const updateHour = (id: string, hour: number, hourly: number) =>
    updateProfile(id, { hourly: value.profiles.find((p) => p.id === id)!.hourly.map((h, i) => (i === hour ? hourly : h)) });

  const addProfile = () => {
    const id = `profile-${Date.now()}`;
    onChange({ ...value, profiles: [...value.profiles, { id, name: "Nuevo perfil", description: "", hourly: Array(24).fill(4) }] });
  };

  const removeProfile = (id: string) => {
    if (value.profiles.length <= 1) return;
    const remainingProfiles = value.profiles.filter((p) => p.id !== id);
    const defaultProfileId = value.defaultProfileId === id ? remainingProfiles[0].id : value.defaultProfileId;
    const dayOverrides = Object.fromEntries(Object.entries(value.dayOverrides).filter(([, pid]) => pid !== id));
    onChange({ profiles: remainingProfiles, defaultProfileId, dayOverrides });
  };

  const cycleDay = (day: number) => {
    const current = value.dayOverrides[day] ?? value.defaultProfileId;
    const idx = value.profiles.findIndex((p) => p.id === current);
    const next = value.profiles[(idx + 1) % value.profiles.length];
    const dayOverrides = { ...value.dayOverrides };
    if (next.id === value.defaultProfileId) delete dayOverrides[day];
    else dayOverrides[day] = next.id;
    onChange({ ...value, dayOverrides });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-medium text-text-secondary">Perfiles de disponibilidad (analistas por hora)</p>
          <div className="flex items-center gap-3">
            <a href="/templates/plantilla-disponibilidad-analistas.xlsx" download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-primary hover:underline">
              <Download className="h-3.5 w-3.5" /> Descargar plantilla
            </a>
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFile} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={importState === "loading"}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
              {importState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              {importState === "loading" ? "Importando…" : "Cargar desde Excel"}
            </button>
            <button onClick={addProfile} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nuevo perfil
            </button>
          </div>
        </div>
        {importState === "done" && importInfo && (
          <p className="text-[11px] text-success mb-2">Se importaron {importInfo.count} perfiles desde "{importInfo.file}".</p>
        )}
        {importState === "error" && importError && (
          <p className="text-[11px] text-danger mb-2">{importError}</p>
        )}
        <div className="space-y-4 mt-3">
          {value.profiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2 mb-2">
                <span title={p.name} className={`h-3 w-3 rounded-full border shrink-0 ${colorFor(p.id)}`} />
                <input value={p.name} onChange={(e) => updateProfile(p.id, { name: e.target.value })}
                  className="h-8 rounded-md border border-border px-2 text-[13px] font-medium bg-card focus:outline-none focus:border-primary" />
                <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary ml-2">
                  <input type="radio" name="defaultProfile" checked={value.defaultProfileId === p.id} onChange={() => onChange({ ...value, defaultProfileId: p.id })} />
                  Perfil por defecto
                </label>
                <button onClick={() => removeProfile(p.id)} disabled={value.profiles.length <= 1} className="ml-auto p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input value={p.description} onChange={(e) => updateProfile(p.id, { description: e.target.value })} placeholder="Descripción del perfil (ej. cuándo aplica, qué lo distingue)"
                className="w-full h-8 rounded-md border border-border px-2 text-[12px] bg-card focus:outline-none focus:border-primary mb-2" />
              <div className="flex gap-1 overflow-x-auto pb-1">
                {HOURS.map((h) => (
                  <div key={h} className="flex flex-col items-center shrink-0">
                    <span className="text-[9px] text-text-secondary font-mono mb-0.5">{h}</span>
                    <input type="number" min={0} value={p.hourly[h]} onChange={(e) => updateHour(p.id, h, Number(e.target.value))}
                      className="w-9 h-8 rounded border border-border px-1 text-[11px] text-center bg-card focus:outline-none focus:border-primary" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium text-text-secondary mb-2">Asignación por día del mes</p>
        <p className="text-[11px] text-text-secondary mb-3">Clic sobre un día para rotar entre perfiles. Patrón recurrente: aplica todos los meses (ej. días de pago 15, 20, 30).</p>
        <div className="grid grid-cols-7 gap-1.5 max-w-lg">
          {DAYS.map((d) => {
            const profileId = value.dayOverrides[d] ?? value.defaultProfileId;
            const profile = value.profiles.find((p) => p.id === profileId);
            return (
              <button key={d} onClick={() => cycleDay(d)} title={profile?.name}
                className={`h-9 rounded-md border text-[12px] font-mono transition-colors ${colorFor(profileId)}`}>
                {d}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {value.profiles.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
              <span className={`h-2.5 w-2.5 rounded-full border ${colorFor(p.id)}`} /> {p.name}{p.id === value.defaultProfileId && " (defecto)"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Shortage behavior editor ──────────────────────── */
/* Picks from the same resolution-method catalog AnalystPlaybook uses (see
   SegmentAnalystSection.tsx + ResolutionMethodCatalogManager) - block_soft/
   block_hard are the two tags reserved for this editor, on top of the 3
   tags a playbook can use. excludeTag guards against a self-referential
   loop (e.g. voicebot shortage routed right back to the voicebot). */

function ShortageBehaviorEditor({
  value,
  onChange,
  name,
  excludeTag,
  resolutionMethods,
  onManage,
}: {
  value: ShortageBehavior;
  onChange: (v: ShortageBehavior) => void;
  name: string;
  excludeTag?: ResolutionTag;
  resolutionMethods: ResolutionMethodResponse[];
  onManage: () => void;
}) {
  const options = resolutionMethods.filter((m) => m.resolution_tag !== excludeTag);
  return (
    <div aria-label={name} className="flex items-center gap-2">
      <select
        value={value.resolutionMethodId ?? ""}
        onChange={(e) => {
          const method = options.find((m) => m.id === e.target.value);
          if (!method) return;
          onChange({ resolutionMethodId: method.id, resolutionTag: method.resolution_tag as ResolutionTag });
        }}
        className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
      >
        {!value.resolutionMethodId && (
          <option value="" disabled>
            Selecciona un método
          </option>
        )}
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.value} ({RESOLUTION_TAG_LABELS[m.resolution_tag as ResolutionTag]})
          </option>
        ))}
      </select>
      <button type="button" onClick={onManage} className="text-[11px] font-medium text-primary hover:underline">
        Gestionar métodos
      </button>
    </div>
  );
}
