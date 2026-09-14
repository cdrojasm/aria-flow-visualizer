import { SectionTabs } from "@/components/ui/section-tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Save, X, RotateCcw,
  Loader2, AlertTriangle,
  Power, Clock, Radio, Eye, ExternalLink, FileSpreadsheet,
  Rocket, Zap, CalendarClock, Download, DollarSign,
} from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfigurationVersionGuide } from "@/components/configuracion/ConfigurationVersionGuide";
import { SegmentAgentTab } from "@/components/configuracion/SegmentAgentTab";
import { SegmentEvaluationTab } from "@/components/configuracion/SegmentEvaluationTab";
import { SegmentSamplingTab } from "@/components/configuracion/SegmentSamplingTab";
import { SegmentoTab } from "@/components/configuracion/SegmentoTab";
import { TagMultiSelect } from "@/components/configuracion/TagMultiSelect";
import { Field, LimitField } from "@/components/configuracion/shared/FormControls";
import { ResolutionMethodCatalogManager } from "@/components/configuracion/ResolutionMethodCatalogManager";
import {
  PROFILE_COLORS, defaultSettings, buildSegmentsFromChannels, RESOLUTION_TAG_LABELS,
  type TabKey, type DayProfile,
  type SamplingIntervalUnit,
  type ShortageBehavior, type ResolutionTag, type AnalystCapacity, type TestCleanupPolicy,
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

const MIN_MIGRATION_LEAD_TIME_MS = 30 * 60 * 1000;

// Sentinel "Basada en" value for the New config modal's explicit
// "start from defaults" choice - distinct from "" so it's never confused
// with an unselected/loading state, and picked as a real option instead of
// only working by accident when configListItems happens to be empty.
const NEW_CONFIG_NONE_BASE_ID = "__none__";

// Persists the in-progress editing state (drafts + which config/version/tab
// was open) so a refresh doesn't wipe unsaved work — mirrors the
// try/catch-guarded localStorage convention in useRole.ts / ColumnVisibilityMenu.tsx.
// Versioned suffix (matches aria.model-training.draft.v1's convention):
// DraftState embeds ConfigSettings, whose shape changes over time (e.g. the
// ProfilingConfig.fieldCategorizations -> fieldEnrichment migration) — a
// draft persisted under an older shape must never be restored as-is (it
// crashes components expecting the current shape). Bump this suffix on any
// future breaking ConfigSettings change; an old key is simply never read
// again and hydration falls back to defaults, same as "no draft yet".
const CONFIGURACION_STORAGE_KEY = "aria.configuracion.editorState.v2";

const formatDatetimeLocal = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const minimumMigrationDatetime = (now = new Date()) => {
  const minimum = new Date(now.getTime() + MIN_MIGRATION_LEAD_TIME_MS);
  minimum.setSeconds(0, 0);
  if (minimum.getTime() < now.getTime() + MIN_MIGRATION_LEAD_TIME_MS) minimum.setMinutes(minimum.getMinutes() + 1);
  return formatDatetimeLocal(minimum);
};

const isMigrationDatetimeValid = (value: string, now = new Date()) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= now.getTime() + MIN_MIGRATION_LEAD_TIME_MS;
};

const formatMigrationDatetime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  baseline?: ConfigSettings;
  dirtyTabs: TabKey[];
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

// Shape written to/read from CONFIGURACION_STORAGE_KEY. Everything here is
// plain JSON-safe state (ConfigSettings, TabKey, etc all are already).
type PersistedConfiguracionState = {
  selectedConfigId: string | null;
  selectedVersion: number | "draft";
  activeTab: TabKey;
  drafts: Record<string, DraftState>;
  localConfigs: { id: string; name: string; description: string }[];
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

  // baseVersion "latest" clones the base config's current draft (if one is
  // open) or its latest saved version - a specific number pins one exact
  // historical version instead, fetched fresh regardless of any open draft.
  const [newConfigForm, setNewConfigForm] = useState<{ name: string; baseId: string; baseVersion: number | "latest" } | null>(null);
  const [configPickerCollapsed, setConfigPickerCollapsed] = useState(true);
  const [versionPickerCollapsed, setVersionPickerCollapsed] = useState(true);

  const [deployTarget, setDeployTarget] = useState<{ configId: string; version: number } | null>(null);
  const [deployMode, setDeployMode] = useState<"immediate" | "window">("immediate");
  const [deployConfirmText, setDeployConfirmText] = useState("");
  const [scheduledDeploys, setScheduledDeploys] = useState<Record<string, { version: number; hour: string }>>({});
  // Set when saveVersion's POST comes back 409 — the lineage moved on since
  // this draft was seeded. Cleared by reloadLatestVersion or a new save attempt.
  const [versionConflict, setVersionConflict] = useState(false);
  const [pendingAction, setPendingAction] = useState<"restore" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [savePreviewLoading, setSavePreviewLoading] = useState(false);
  const [savePreviewError, setSavePreviewError] = useState<string | null>(null);
  // Confirm-before-discard for startNewVersionFrom below — a native
  // window.confirm() would look out of place next to every other
  // confirmation in this page being a custom modal.
  const [pendingVersionSwitch, setPendingVersionSwitch] = useState<{ fromVersion?: number; toVersion: number } | null>(null);

  // Guards the persistence effects below. Starts false so the very first
  // render (server-rendered — this route is SSR'd — and the pre-hydration
  // client render) matches, then flips once the restore effect has read
  // localStorage, per the useRole.ts/ColumnVisibilityMenu.tsx convention.
  const [editorStateHydrated, setEditorStateHydrated] = useState(false);
  // Set synchronously (a ref, not state) by the restore effect below when it
  // finds a persisted selection, so the "pick default selection" effect that
  // runs right after it in the same commit knows not to clobber it — both
  // effects would otherwise still see the pre-restore `selectedConfigId`
  // (state updates from the earlier effect haven't re-rendered yet).
  const hydratedSelectionRef = useRef(false);

  const backendConfigs = configsQuery.data ?? [];
  const isTempId = (id: string | null) => !!id && localConfigs.some((c) => c.id === id);
  const configListItems = [
    ...backendConfigs.map((c) => ({ id: c.configuration_id, name: c.name, description: c.description, latestVersion: c.version as number | null })),
    ...localConfigs.map((c) => ({ id: c.id, name: c.name, description: c.description, latestVersion: null as number | null })),
  ];

  const running = activeQuery.data
    ? { configId: activeQuery.data.configuration_id, version: activeQuery.data.version }
    : { configId: "", version: -1 };

  // Version history for whichever config is picked as "Basada en" in the
  // New config modal - separate from versionsQuery above (that one tracks
  // selectedConfigId, which may differ from the modal's in-progress choice).
  // Only meaningful for a backend-persisted base; a local/temp lineage has
  // no saved versions to pick from, only its current draft.
  const newConfigBaseItem = newConfigForm && newConfigForm.baseId !== NEW_CONFIG_NONE_BASE_ID
    ? configListItems.find((c) => c.id === newConfigForm.baseId)
    : undefined;
  const newConfigBaseIsTemp = !!newConfigBaseItem && isTempId(newConfigBaseItem.id);
  const newConfigBaseVersionsQuery = useQuery({
    queryKey: ["configurationVersions", newConfigBaseItem?.id],
    queryFn: () => listConfigurationVersions({ data: { configurationId: newConfigBaseItem!.id } }),
    enabled: !!newConfigBaseItem && !newConfigBaseIsTemp,
  });
  const newConfigBaseVersions = newConfigBaseIsTemp ? [] : (newConfigBaseVersionsQuery.data ?? []);

  // Restore the editing object + which config/version/tab was open, so a
  // refresh doesn't lose unsaved work. Must run (and, if it finds anything,
  // flag hydratedSelectionRef) before the "pick default selection" effect
  // right below it — declaration order is execution order for effects in
  // the same commit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIGURACION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedConfiguracionState>;
        if (parsed.drafts && typeof parsed.drafts === "object") setDrafts(parsed.drafts);
        if (Array.isArray(parsed.localConfigs)) setLocalConfigs(parsed.localConfigs);
        if (parsed.activeTab && TAB_META.some((t) => t.key === parsed.activeTab)) setActiveTab(parsed.activeTab);
        if (parsed.selectedConfigId) {
          setSelectedConfigId(parsed.selectedConfigId);
          setSelectedVersion(
            parsed.selectedVersion === "draft" || typeof parsed.selectedVersion === "number" ? parsed.selectedVersion : "draft",
          );
          hydratedSelectionRef.current = true;
        }
      }
    } catch {
      // localStorage no disponible o corrupto — se queda en los valores por defecto.
    } finally {
      setEditorStateHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persists the editing object + current tab/selection on every change,
  // once past the restore above (otherwise this would fire first, on the
  // blank initial state, and overwrite what's in storage before the restore
  // effect's setState calls above ever take effect).
  useEffect(() => {
    if (!editorStateHydrated) return;
    try {
      const toPersist: PersistedConfiguracionState = { selectedConfigId, selectedVersion, activeTab, drafts, localConfigs };
      localStorage.setItem(CONFIGURACION_STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
      // localStorage no disponible — la preferencia solo dura la sesión actual.
    }
  }, [editorStateHydrated, selectedConfigId, selectedVersion, activeTab, drafts, localConfigs]);

  // Pick a default selection once configs have loaded: whatever is active
  // in production, else the first config in the list.
  useEffect(() => {
    if (selectedConfigId || hydratedSelectionRef.current) return;
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
      setDrafts((prev) => (prev[selectedConfigId] ? prev : { ...prev, [selectedConfigId]: { workingCopy: settingsFromConfigurationDetail(detail), baseline: settingsFromConfigurationDetail(detail), dirtyTabs: [], basedOnVersion: summary.version } }));
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
      everActivated: v.ever_activated,
    }));

  const selectedConfig: AgentConfig = {
    id: selectedConfigId ?? "",
    name: selectedListItem?.name ?? "",
    description: selectedListItem?.description ?? "",
    versions,
    workingCopy: selectedDraft?.workingCopy ?? defaultSettings(),
    dirtyTabs: selectedDraft?.dirtyTabs ?? [],
  };

  const configs: AgentConfig[] = configListItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    versions: [],
    workingCopy: defaultSettings(),
    dirtyTabs: drafts[item.id]?.dirtyTabs ?? [],
  }));

  const isDraftView = selectedVersion === "draft";
  const viewingVersion = isDraftView ? undefined : versions.find((v) => v.version === selectedVersion);
  const settingsLoading = !isDraftView && !viewingVersion?.settings;
  const settings = isDraftView ? selectedConfig.workingCopy : (viewingVersion?.settings ?? defaultSettings());
  const migrationDatetimeMin = minimumMigrationDatetime();
  const migrationDatetimeInvalid = settings.migrationWindowEnabled && !isMigrationDatetimeValid(settings.migrationWindowDatetime);
  const readOnlyHistorical = !isDraftView;
  // Task 2 fix: the historical banner used to call every non-draft version
  // "histórica" — including the one actually running in production, right
  // next to its green "Producción" badge in the version list. Distinguish
  // the live version from a genuinely superseded one.
  const viewingIsLive = readOnlyHistorical && running.configId === selectedConfig.id && running.version === selectedVersion;
  const locked = saving || restoring || !selectedDraft || readOnlyHistorical || settingsLoading || apiDown || savePreviewLoading;
  const unsaved = isTempId(selectedConfigId);
  // Mirrors CreateConfigurationUseCase's overwrite condition: a save only
  // mints a new version if the draft's base was never activated - and only
  // once that base version is actually known (not unsaved/loading), so the
  // label defaults to the safe "nueva versión" phrasing while unsure.
  const basedOnVersionEntry = selectedDraft?.basedOnVersion != null
    ? versions.find((v) => v.version === selectedDraft.basedOnVersion)
    : undefined;
  const canEditVersion = (version: number) => {
    const entry = backendVersions.find((v) => v.version === version);
    return !!entry && versionsQuery.isSuccess && testRunsQuery.isSuccess && activeQuery.isSuccess
      && version === Math.max(...backendVersions.map((v) => v.version))
      && !entry.active && !entry.ever_activated && !(entry as typeof entry & { ever_tested?: boolean }).ever_tested
      && !(running.configId === selectedConfigId && running.version === version)
      && !(testRunsQuery.data ?? []).some((run) =>
        run.config.configuration_ref?.configuration_id === selectedConfigId
        && run.config.configuration_ref.version === version);
  };
  const willOverwrite = !unsaved && selectedDraft?.basedOnVersion != null && canEditVersion(selectedDraft.basedOnVersion);
  // Task 5 fix: only show the pseudo "Cambios sin guardar" row inside the
  // version dropdown for a config that has no real versions yet (brand-new,
  // never saved) — there's nothing else to list. Once real versions exist,
  // the dirty draft gets its own persistent banner instead of a fake row
  // mixed in with real version identities (see below).
  const showDraftRow = versions.length === 0;

  const defaultVersionFor = (c: AgentConfig): number | "draft" => {
    if (drafts[c.id]?.dirtyTabs.length) return "draft";
    const item = configListItems.find((x) => x.id === c.id);
    if (!item || item.latestVersion == null) return "draft";
    return item.latestVersion;
  };

  const selectConfigRow = (c: AgentConfig) => { setSelectedConfigId(c.id); setSelectedVersion(defaultVersionFor(c)); };

  // Task 1 fix: previously the "Iniciar nueva versión basada en vN" button
  // just flipped to draft view (setSelectedVersion("draft")) without ever
  // seeding the draft from vN — since only one draft slot exists per
  // configuration (seeded once from the latest version, see the effect
  // above), clicking it from ANY historical version silently reopened
  // whatever draft already existed, regardless of which vN was requested.
  // This seeds the draft from the actual requested version every time.
  const applyStartNewVersionFrom = async (version: number) => {
    if (!selectedConfigId) return;
    const detail = selectedVersion === version && historicalDetailQuery.data
      ? historicalDetailQuery.data
      : await queryClient.fetchQuery({
          queryKey: ["configurationVersion", selectedConfigId, version],
          queryFn: () => getConfigurationVersion({ data: { configurationId: selectedConfigId, version } }),
        });
    setDrafts((prev) => ({ ...prev, [selectedConfigId]: { workingCopy: settingsFromConfigurationDetail(detail), baseline: settingsFromConfigurationDetail(detail), dirtyTabs: [], basedOnVersion: version } }));
    setSelectedVersion("draft");
  };

  // Warns before clobbering a dirty draft based on a different version —
  // via the app's own modal (see pendingVersionSwitch render below), not a
  // native window.confirm().
  const startNewVersionFrom = (version: number) => {
    if (!selectedConfigId) return;
    const currentDraft = drafts[selectedConfigId];
    if (currentDraft?.basedOnVersion === version) { setSelectedVersion("draft"); return; }
    if (currentDraft && currentDraft.dirtyTabs.length > 0) {
      setPendingVersionSwitch({ fromVersion: currentDraft.basedOnVersion, toVersion: version });
      return;
    }
    void applyStartNewVersionFrom(version);
  };

  const restoreChanges = async () => {
    if (!selectedConfigId || !selectedDraft) return;
    const configId = selectedConfigId;
    setRestoring(true);
    setActionError(null);
    try {
      let baseline = selectedDraft.baseline;
      if (!baseline && selectedDraft.basedOnVersion != null) {
        const detail = await queryClient.fetchQuery({
          queryKey: ["configurationVersion", configId, selectedDraft.basedOnVersion],
          queryFn: () => getConfigurationVersion({ data: { configurationId: configId, version: selectedDraft.basedOnVersion! } }),
        });
        baseline = settingsFromConfigurationDetail(detail);
      }
      const restoredSettings = baseline ?? { ...defaultSettings(), segments: buildSegmentsFromChannels(channels) };
      setDrafts((prev) => ({ ...prev, [configId]: { workingCopy: structuredClone(restoredSettings), baseline: restoredSettings, basedOnVersion: selectedDraft.basedOnVersion, dirtyTabs: [] } }));
      setVersionConflict(false);
      setSavePreviewError(null);
      setPendingAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudieron restaurar los cambios.");
    } finally {
      setRestoring(false);
    }
  };

  const patchSettings = (tab: TabKey, patch: Partial<ConfigSettings>) => {
    if (locked || !isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [] };
      const dirtyTabs = current.dirtyTabs.includes(tab) ? current.dirtyTabs : [...current.dirtyTabs, tab];
      return { ...prev, [selectedConfigId]: { ...current, workingCopy: { ...current.workingCopy, ...patch }, dirtyTabs } };
    });
  };

  const patchSegment = (tab: TabKey, code: SegmentCode, patch: Partial<SegmentSettings>) => {
    if (locked || !isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [] };
      const dirtyTabs = current.dirtyTabs.includes(tab) ? current.dirtyTabs : [...current.dirtyTabs, tab];
      const segments = { ...current.workingCopy.segments, [code]: { ...current.workingCopy.segments[code], ...patch } };
      return { ...prev, [selectedConfigId]: { ...current, workingCopy: { ...current.workingCopy, segments }, dirtyTabs } };
    });
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
      basedOnVersion: wasTemp || forceNewVersion || !willOverwrite ? null : selectedDraft?.basedOnVersion,
    });
  };

  const requestSave = async (forceNewVersion = false) => {
    if (!isDraftView || !selectedConfigId || locked) return;
    setSavePreviewError(null);
    if (settings.migrationWindowEnabled && !isMigrationDatetimeValid(settings.migrationWindowDatetime)) {
      setSavePreviewError("La fecha y hora de migración debe ser al menos 30 minutos posterior a la hora actual.");
      return;
    }
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
    const wasTemp = isTempId(selectedConfigId);
    setVersionConflict(false);
    let created;
    try {
      created = await createMutation.mutateAsync(request);
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) { setVersionConflict(true); return; }
      throw err;
    }

    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedConfigId];
      next[created.configuration_id] = { workingCopy: settingsFromConfigurationDetail(created), baseline: settingsFromConfigurationDetail(created), dirtyTabs: [], basedOnVersion: created.version };
      return next;
    });
    if (wasTemp) setLocalConfigs((prev) => prev.filter((c) => c.id !== selectedConfigId));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      queryClient.invalidateQueries({ queryKey: ["configurationVersions", created.configuration_id] }),
      queryClient.invalidateQueries({ queryKey: ["configurationVersion", created.configuration_id] }),
    ]);
    setSelectedConfigId(created.configuration_id);
    setSelectedVersion(created.version);
  };

  const confirmSave = async () => {
    if (!pendingSave || saving) return;
    if (pendingSave.request.general.migration_window_enabled
      && !isMigrationDatetimeValid(pendingSave.request.general.migration_window_datetime)) {
      setPendingSave(null);
      setSavePreviewError("La fecha y hora de migración debe ser al menos 30 minutos posterior a la hora actual.");
      return;
    }
    setSaving(true);
    try {
      await saveVersion(pendingSave.request);
      setPendingSave(null);
    } catch (error) {
      setSavePreviewError(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
      setPendingSave(null);
    } finally {
      setSaving(false);
    }
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
  const deployWindowDatetime = deployDetailQuery.data?.general.migration_window_datetime ?? "2000-01-01T02:00";
  const deployWindowDatetimeValid = isMigrationDatetimeValid(deployWindowDatetime);
  const deployConfirmed = deployConfirmText.trim().toUpperCase() === "CONFIRMAR";
  const canConfirmDeploy = deployConfirmed && hasSucceededTestRun
    && (deployMode === "immediate" || (deployWindowEnabled && deployWindowDatetimeValid));

  const confirmDeploy = async () => {
    if (!deployTarget || !deployConfirmed || !hasSucceededTestRun) return;
    if (deployMode === "window" && (!deployWindowEnabled || !isMigrationDatetimeValid(deployWindowDatetime))) return;
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
      setScheduledDeploys((prev) => ({ ...prev, [configId]: { version, hour: deployWindowDatetime } }));
    }
    closeDeploy();
  };

  const cancelScheduledDeploy = (configId: string) =>
    setScheduledDeploys((prev) => { const n = { ...prev }; delete n[configId]; return n; });

  const createConfig = async () => {
    if (!newConfigForm || !newConfigForm.name.trim()) return;
    const baseItem = newConfigForm.baseId === NEW_CONFIG_NONE_BASE_ID
      ? undefined
      : configListItems.find((c) => c.id === newConfigForm.baseId);
    const pinnedVersion = newConfigForm.baseVersion !== "latest" ? newConfigForm.baseVersion : null;
    let baseSettings: ConfigSettings;
    let baseVersionLabel: number | null = null;
    const baseDraft = baseItem && pinnedVersion === null ? drafts[baseItem.id] : undefined;
    if (baseDraft) {
      baseSettings = baseDraft.workingCopy;
      baseVersionLabel = baseDraft.basedOnVersion ?? baseItem!.latestVersion;
    } else if (baseItem && pinnedVersion !== null) {
      // A specific historical version was picked - fetch it fresh even if
      // there's an open draft for this lineage, so the pin is honored
      // exactly instead of silently preferring unsaved edits.
      const detail = await queryClient.fetchQuery({
        queryKey: ["configurationVersion", baseItem.id, pinnedVersion],
        queryFn: () => getConfigurationVersion({ data: { configurationId: baseItem.id, version: pinnedVersion } }),
      });
      baseSettings = settingsFromConfigurationDetail(detail);
      baseVersionLabel = pinnedVersion;
    } else if (baseItem?.latestVersion != null) {
      const detail = await queryClient.fetchQuery({
        queryKey: ["configurationVersion", baseItem.id, baseItem.latestVersion],
        queryFn: () => getConfigurationVersion({ data: { configurationId: baseItem.id, version: baseItem.latestVersion! } }),
      });
      baseSettings = settingsFromConfigurationDetail(detail);
      baseVersionLabel = baseItem.latestVersion;
    } else {
      // Explicit "Ninguna" choice, or a base with nothing saved yet.
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
    setLocalConfigs((prev) => [...prev, { id, name: newConfigForm.name.trim(), description: baseItem ? `Basada en ${baseItem.name}${baseVersionLabel != null ? `:v${baseVersionLabel}` : ""}.` : "" }]);
    setDrafts((prev) => ({ ...prev, [id]: { workingCopy: clonedSettings, baseline: structuredClone(clonedSettings), dirtyTabs: [] } }));
    setSelectedConfigId(id);
    setSelectedVersion("draft");
    setActiveTab("general");
    setNewConfigForm(null);
  };

  const dirtyTabLabels = selectedConfig.dirtyTabs.map((k) => TAB_META.find((t) => t.key === k)?.label).filter(Boolean).join(", ");

  // Single consolidated message shown in the save-confirmation modal, folding
  // together what dirty tabs exist, which version the draft is based on,
  // and the overwrite-vs-new-version consequence — previously three
  // separate stacked banners repeating the same version name, then a
  // persistent "Ciclo de validación" card (retired: see UX_FIXES_ARIA.md R1).
  const showBasedOnVersion = !unsaved && !!basedOnVersionEntry;
  const versionLabel = showBasedOnVersion ? `${selectedConfig.name}:v${selectedDraft?.basedOnVersion}` : null;
  const nextVersionLabel = `${selectedConfig.name}:v${Math.max(0, ...backendVersions.map((v) => v.version)) + 1}`;
  const validationSummary = dirtyTabLabels && versionLabel
    ? <>Cambios sin guardar en <span className="font-medium">{dirtyTabLabels}</span>, basados en <span className="font-medium">{versionLabel}</span>. {willOverwrite ? <>Guardar sobrescribe esa versión — usa &quot;Guardar como nueva versión&quot; para conservarla y crear <span className="font-medium">{nextVersionLabel}</span> aparte.</> : "Guardar siempre crea una nueva versión; esa se conserva intacta."}</>
    : dirtyTabLabels
      ? <>Cambios sin guardar en <span className="font-medium">{dirtyTabLabels}</span>.</>
      : versionLabel
        ? <><span className="font-medium">{versionLabel}</span> {willOverwrite ? <>es la última versión, sin producción ni pruebas — guardar la modifica; usa &quot;Guardar como nueva versión&quot; para conservarla y crear <span className="font-medium">{nextVersionLabel}</span> aparte.</> : "está protegida o es anterior — guardar crea una nueva versión; se conserva intacta."}</>
        : null;
  const saveButtonLabel = savePreviewLoading ? "Validando cambios…" : willOverwrite ? `Guardar cambios en ${selectedConfig.name}:v${selectedDraft?.basedOnVersion}` : "Guardar como nueva versión";

  const editorStatus = !selectedConfigId ? "Selecciona una configuración"
    : !isDraftView ? `Consultando configuración ${selectedConfig.name} · Versión ${selectedVersion}${viewingIsLive ? " · Producción" : ""} · Solo lectura`
    : unsaved ? `Creando configuración ${selectedConfig.name} · Versión 1`
    : willOverwrite ? `Modificando configuración ${selectedConfig.name} · Versión ${selectedDraft?.basedOnVersion}`
    : `Creando nueva versión de configuración ${selectedConfig.name} · Basada en versión ${selectedDraft?.basedOnVersion ?? "…"}`;

  const hasChanges = !!selectedDraft && (selectedDraft.baseline
    ? JSON.stringify(selectedDraft.workingCopy) !== JSON.stringify(selectedDraft.baseline)
    : selectedDraft.dirtyTabs.length > 0);
  const canSave = !locked && !!selectedConfigId && (unsaved || hasChanges);
  const canRestore = isDraftView && !!selectedDraft && hasChanges && !saving && !restoring && !savePreviewLoading;
  const actionButtonClass = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <DashboardLayout bottomBar={
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
        <div className="min-w-0 text-[12px] text-text-secondary" role="status">
          <p className="font-medium text-text-primary">{editorStatus}</p>
          <p>{saving ? "Guardando…" : restoring ? "Restaurando cambios…" : savePreviewLoading ? "Validando cambios…" : !isDraftView ? "Versión guardada · Solo lectura" : unsaved ? "Configuración nueva sin guardar" : hasChanges ? "Cambios pendientes de guardar" : "Sin cambios pendientes"}</p>
        </div>
        {isDraftView && <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!canRestore} onClick={() => { setActionError(null); setPendingAction("restore"); }} className={`${actionButtonClass} border border-border hover:bg-surface`}>
            <RotateCcw className="h-4 w-4" /> Restaurar cambios
          </button>
          {willOverwrite && isDraftView && <button type="button" disabled={!canSave} onClick={() => requestSave(true)} className={`${actionButtonClass} border border-primary text-primary hover:bg-primary/5`}>
            <Plus className="h-4 w-4" /> Guardar como nueva versión
          </button>}
          <button type="button" disabled={!canSave} title={saveButtonLabel} onClick={() => requestSave(false)} className={`${actionButtonClass} bg-primary text-white hover:bg-primary/90`}>
            {saving || savePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? "Guardando…" : savePreviewLoading ? "Validando…" : willOverwrite ? "Guardar cambios" : "Crear versión"}
          </button>
        </div>}
      </div>
    }>
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
                <p className="text-[12px] text-text-primary">Cargando versión {selectedConfig.name}:v{selectedVersion}…</p>
              </div>
            ) : (
              <div className={`flex items-center gap-2.5 border rounded-lg px-4 py-2.5 ${viewingIsLive ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}>
                {viewingIsLive ? <Radio className="h-4 w-4 text-success shrink-0" /> : <Eye className="h-4 w-4 text-warning shrink-0" />}
                <p className="text-[12px] text-text-primary">
                  Viendo la versión <span className="font-medium">{selectedConfig.name}:v{selectedVersion}</span> — {viewingIsLive ? "en producción, de solo lectura." : "versión guardada, de solo lectura."}
                </p>
                <button onClick={() => startNewVersionFrom(selectedVersion as number)}
                  className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/10 shrink-0">
                  <Pencil className="h-3.5 w-3.5" /> {canEditVersion(selectedVersion as number) ? "Modificar" : "Crear nueva versión basada en"} {selectedConfig.name}:v{selectedVersion}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Config + version selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">Configuraciones</h2>
              <ConfigurationVersionGuide />
            </div>
            <button onClick={() => setNewConfigForm({ name: "", baseId: selectedConfigId ?? NEW_CONFIG_NONE_BASE_ID, baseVersion: "latest" })}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nueva configuración
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="self-start border border-border rounded-lg overflow-hidden">
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
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Despliegue en ventana programado — ${c.name}:v${scheduledDeploys[c.id].version} el ${formatMigrationDatetime(scheduledDeploys[c.id].hour)}`}>
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

            <div className="self-start border border-border rounded-lg overflow-hidden">
              <button onClick={() => setVersionPickerCollapsed((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary">
                Versión
                {versionPickerCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              {versionPickerCollapsed ? (
                <button onClick={() => setVersionPickerCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface">
                  <span className={`text-[13px] font-medium ${isDraftView ? "text-warning" : "text-text-primary"}`}>
                    {isDraftView ? "Cambios sin guardar" : `${selectedConfig.name}:v${selectedVersion}`}
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
                          <span className="text-[13px] font-medium text-text-primary">{selectedConfig.name}:v{v.version}</span>
                          <p className="text-[11px] text-text-secondary">
                            {v.testRun
                              ? `${v.testRun.date} · ${v.testRun.accuracy.toFixed(1)}% precisión`
                              : isRunningVersion
                                ? "En producción — sin ciclo corrido en esta sesión"
                                : v.everActivated
                                  ? "Desplegada anteriormente — sin ciclo corrido en esta sesión"
                                  : "Nunca desplegada — sin ciclo corrido en esta sesión"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isScheduledVersion && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Programado para el ${formatMigrationDatetime(scheduled!.hour)}`}>
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

        {/* Dirty-draft reminder for when the user has wandered off to a
            different version/config while a draft is still pending — once
            they're actually in the draft view, this same information shows
            up in the save-confirmation modal instead of duplicating it here. */}
        {!unsaved && !isDraftView && selectedConfig.dirtyTabs.length > 0 && (
          <div className="flex items-center gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-2.5">
            <Pencil className="h-4 w-4 text-warning shrink-0" />
            <p className="text-[12px] text-text-primary">
              Tienes cambios sin guardar{selectedDraft?.basedOnVersion != null ? <> basados en <span className="font-medium">{selectedConfig.name}:v{selectedDraft.basedOnVersion}</span></> : null}.
            </p>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <button onClick={() => setSelectedVersion("draft")} className="text-[12px] font-medium text-primary hover:underline">
                Ver borrador
              </button>

            </div>
          </div>
        )}

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

        {scheduledDeploys[selectedConfig.id] && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[12px] text-text-primary">
              Despliegue en ventana programado: <span className="font-medium">{selectedConfig.name}:v{scheduledDeploys[selectedConfig.id].version}</span> se aplicará el <span className="font-medium">{formatMigrationDatetime(scheduledDeploys[selectedConfig.id].hour)}</span>.
            </p>
            <button onClick={() => cancelScheduledDeploy(selectedConfig.id)} className="ml-auto text-[12px] font-medium text-danger hover:underline shrink-0">Cancelar despliegue</button>
          </div>
        )}

        {/* Tabs */}
        <SectionTabs
          label="Secciones de configuración"
          items={TAB_META.map((tab) => ({ ...tab, dirty: selectedConfig.dirtyTabs.includes(tab.key) }))}
          value={activeTab}
          onValueChange={setActiveTab}
          disabled={apiDown}
        />

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
                    <Field label="Fecha y hora de migración" hint="Fecha y hora en que se cierra la cola, se cambia la configuración y se reinicia la operación.">
                      <div className="flex items-center gap-2 max-w-[260px]">
                        <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                        <input type="datetime-local" min={migrationDatetimeMin} value={settings.migrationWindowDatetime} onChange={(e) => patchSettings("general", { migrationWindowDatetime: e.target.value })}
                          aria-invalid={migrationDatetimeInvalid}
                          className={`w-full h-9 rounded-md border px-3 text-[13px] focus:outline-none ${migrationDatetimeInvalid ? "border-danger focus:border-danger" : "border-border focus:border-primary"}`} />
                      </div>
                      {migrationDatetimeInvalid && (
                        <p className="text-[12px] text-danger mt-1">Selecciona una fecha y hora al menos 30 minutos en el futuro.</p>
                      )}
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


      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open && !restoring) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se descartarán los cambios sin guardar de ${selectedConfig.name} y se restaurará ${selectedDraft?.basedOnVersion != null ? `la versión base v${selectedDraft.basedOnVersion}` : "la configuración inicial del borrador"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={restoring || !canRestore} onClick={(event) => {
              event.preventDefault();
              void restoreChanges();
            }}>
              {restoring ? "Restaurando…" : "Confirmar restauración"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save confirmation modal — populated by POST /configuration/test. */}
      {pendingSave && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-border w-full max-w-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">Confirmar cambios de configuración</h3>
              </div>
              <button onClick={() => setPendingSave(null)} disabled={saving || createMutation.isPending} className="text-text-secondary hover:text-text-primary disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Revisa los cambios antes de {pendingSave.forceNewVersion ? "crear la nueva versión" : willOverwrite ? `sobrescribir ${selectedConfig.name}:v${selectedDraft?.basedOnVersion}` : "guardar la nueva versión"}.
              </p>

              {validationSummary && <p className="text-[12px] text-text-secondary">{validationSummary}</p>}

              {!hasSucceededTestRun && !testRunsQuery.isLoading ? (
                <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12px] text-text-primary">
                    Guardar no pone esta versión en producción. Además, ARIA aún no ha pasado ningún test — no podrás desplegarla hasta correr al menos uno en Testing. <Link to="/testing" className="underline">Ir a Testing</Link>
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-text-secondary">
                  Guardar no pone esta versión en producción. Usa "Desplegar" desde el historial de versiones para llevarla a producción.
                </p>
              )}

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
              <button onClick={() => setPendingSave(null)} disabled={saving || createMutation.isPending}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmSave} disabled={saving || createMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {createMutation.isPending ? "Guardando…" : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Discard-draft confirmation modal — replaces a window.confirm() so it
          matches every other confirmation in this page. */}
      {pendingVersionSwitch && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setPendingVersionSwitch(null)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h3 className="text-[14px] font-semibold text-text-primary">Descartar cambios sin guardar</h3>
              </div>
              <button onClick={() => setPendingVersionSwitch(null)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-text-primary">
                Tienes cambios sin guardar{pendingVersionSwitch.fromVersion != null ? <> basados en {selectedConfig.name}:v{pendingVersionSwitch.fromVersion}</> : null}. Si continúas, se perderán y se cargará {selectedConfig.name}:v{pendingVersionSwitch.toVersion} para editar.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setPendingVersionSwitch(null)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button
                onClick={() => { const { toVersion } = pendingVersionSwitch; setPendingVersionSwitch(null); void applyStartNewVersionFrom(toVersion); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-danger text-white font-medium hover:bg-danger/90">
                Descartar y continuar
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
              <Field label="Basada en" hint="Clona las taxonomías, límites y prompts de la configuración elegida, o arranca en blanco.">
                <select value={newConfigForm.baseId}
                  onChange={(e) => setNewConfigForm({ ...newConfigForm, baseId: e.target.value, baseVersion: "latest" })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  <option value={NEW_CONFIG_NONE_BASE_ID}>Ninguna (valores por defecto)</option>
                  {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {newConfigBaseItem && !newConfigBaseIsTemp && (
                <Field label="Versión" hint="La versión más reciente incluye cambios sin guardar de esa configuración, si la tienes abierta ahora mismo.">
                  <select
                    value={newConfigForm.baseVersion === "latest" ? "latest" : String(newConfigForm.baseVersion)}
                    onChange={(e) => setNewConfigForm({ ...newConfigForm, baseVersion: e.target.value === "latest" ? "latest" : Number(e.target.value) })}
                    disabled={newConfigBaseVersionsQuery.isLoading}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50">
                    <option value="latest">
                      Más reciente{newConfigBaseItem.latestVersion != null ? ` (v${newConfigBaseItem.latestVersion})` : ""}
                    </option>
                    {[...newConfigBaseVersions].sort((a, b) => b.version - a.version).map((v) => (
                      <option key={v.version} value={v.version}>v{v.version}{v.ever_activated ? " · estuvo en producción" : ""}</option>
                    ))}
                  </select>
                </Field>
              )}
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
                <h3 className="text-[14px] font-semibold text-text-primary">Desplegar {configs.find((c) => c.id === deployTarget.configId)?.name}:v{deployTarget.version} a producción</h3>
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
                      <>
                        <p className="text-[12px] text-text-secondary mt-0.5">Se aplica en la próxima ventana de migración (<span className="font-medium text-text-primary">{formatMigrationDatetime(deployWindowDatetime)}</span>): ARIA cierra la cola de alertas pendientes, aplica esta versión y reinicia la operación.</p>
                        {!deployWindowDatetimeValid && (
                          <p className="text-[12px] text-danger mt-1">La ventana debe estar al menos 30 minutos en el futuro. Edita y guarda la configuración antes de programar el despliegue.</p>
                        )}
                      </>
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

              {/* Task 4 fix: this was a plain warning paragraph, easy to miss
                  scrolling past it, sitting above a "Desplegar ahora" button
                  that still looked fully clickable (just disabled:opacity-50
                  on the same solid primary color) and gave zero feedback on
                  click. Give it a bordered box right against the button, and
                  make the button itself switch to a visibly neutral/disabled
                  look instead of a dimmed version of the active one. */}
              {!hasSucceededTestRun && !testRunsQuery.isLoading && (
                <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12px] text-text-primary">
                    Esta configuración no ha sido probada y no puede desplegarse hasta satisfacer esta condición — corre al menos un test en Testing. <Link to="/testing" className="underline font-medium">Ir a Testing</Link>
                  </p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={closeDeploy} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={confirmDeploy} disabled={!canConfirmDeploy}
                title={!hasSucceededTestRun ? "Corre al menos un test en Testing antes de desplegar" : !deployConfirmed ? "Escribe CONFIRMAR para habilitar el despliegue" : undefined}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium ${canConfirmDeploy ? "bg-primary text-white hover:bg-primary/90" : "bg-border text-text-secondary cursor-not-allowed"}`}>
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
