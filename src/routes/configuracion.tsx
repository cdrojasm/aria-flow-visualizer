import { SectionTabs } from "@/components/ui/section-tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import {
  Plus,
  Pencil,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Clock,
  Radio,
  Eye,
  ExternalLink,
  Rocket,
  Send,
  ClipboardList,
  CheckCircle2,
  Zap,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ConfigurationVersionGuide } from "@/components/configuracion/ConfigurationVersionGuide";
import { SegmentAgentTab } from "@/components/configuracion/SegmentAgentTab";
import { SegmentEvaluationTab } from "@/components/configuracion/SegmentEvaluationTab";
import { AlertSchemaEditor } from "@/components/configuracion/schema/AlertSchemaEditor";
import { rubricValidationErrors } from "@/components/configuracion/SegmentRubricsSection";
import { SegmentoTab } from "@/components/configuracion/SegmentoTab";
import { Field, LimitField } from "@/components/configuracion/shared/FormControls";
import { OperationsPanel } from "@/components/configuracion/OperationsPanel";
import {
  defaultSettings,
  defaultSegmentAgent,
  buildSegmentsFromChannels,
  type TabKey,
  type TestCleanupPolicy,
  type VersionEntry,
  type AgentConfig,
  type ConfigSettings,
  type SegmentCode,
  type SegmentSettings,
} from "@/data/configs";
import {
  listConfigurations,
  getActiveConfiguration,
  listConfigurationVersions,
  getConfigurationVersion,
  createConfiguration,
  activateConfiguration,
  testConfiguration,
  previewConfigurationDeployRequest,
  createConfigurationDeployRequest,
  listConfigurationDeployRequests,
  approveConfigurationDeployRequest,
  type CreateConfigurationRequest,
  type TestConfigurationResponse,
} from "@/lib/api/configurations.functions";
import {
  toCreateConfigurationRequest,
  settingsFromConfigurationDetail,
} from "@/lib/api/configurationMapping";
import { listChannelLibraryEntries } from "@/lib/api/channelLibrary.functions";
import { listTestRuns } from "@/lib/api/testing.functions";
import { useApiHealth } from "@/hooks/useApiHealth";
import { useRole } from "@/hooks/useRole";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Configura ARIA a nivel de infraestructura, operación, test y agente.",
      },
    ],
  }),
  component: ConfiguracionPage,
});

/* ─── Static data ────────────────────────────────────── */

const GENERAL_TAB_META: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "infra", label: "Infraestructura" },
  { key: "ops", label: "Operación (inmediata)" },
  { key: "test", label: "Test" },
  { key: "segmento", label: "Segmento" },
  { key: "schema", label: "Esquema" },
];

const SEGMENT_CONFIGURATION_TAB_META: { key: TabKey; label: string }[] = [
  { key: "segmento", label: "Segmento" },
  { key: "segmentoAgente", label: "Agente" },
  { key: "segmentoEvaluacion", label: "Evaluación" },
];

const RELEASE_TAB_META: { key: TabKey; label: string }[] = [
  ...GENERAL_TAB_META,
  { key: "segmentoAgente", label: "Agente" },
  { key: "segmentoEvaluacion", label: "Evaluación" },
];

// Used only for restoring draft metadata and labels; rendering always chooses
// exactly one of the role-scoped collections above.
const TAB_META = [...GENERAL_TAB_META, ...SEGMENT_CONFIGURATION_TAB_META.filter((tab) => tab.key !== "segmento")];

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
// ProfilingConfig.fieldCategorizations -> fieldEnrichment migration, or the
// Wave 6 detector/detectorAdversarial/executor/rubrics split) — a draft
// persisted under an older shape must never be restored as-is (it crashes
// components expecting the current shape, e.g. SegmentExecutorSection doing
// value.voicebotCall.categoryPrompts.map(...) with no `executor` key on an
// old draft). Bump this suffix on any future breaking ConfigSettings change;
// an old key is simply never read again and hydration falls back to
// defaults, same as "no draft yet".
const CONFIGURACION_STORAGE_KEY = "aria.configuracion.editorState.v4";

const formatDatetimeLocal = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const minimumMigrationDatetime = (now = new Date()) => {
  const minimum = new Date(now.getTime() + MIN_MIGRATION_LEAD_TIME_MS);
  minimum.setSeconds(0, 0);
  if (minimum.getTime() < now.getTime() + MIN_MIGRATION_LEAD_TIME_MS)
    minimum.setMinutes(minimum.getMinutes() + 1);
  return formatDatetimeLocal(minimum);
};

const isMigrationDatetimeValid = (value: string, now = new Date()) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= now.getTime() + MIN_MIGRATION_LEAD_TIME_MS;
};

const formatMigrationDatetime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatChangePath = (path: string) =>
  path
    .split(".")
    .map((part, index) =>
      index === 0 ? (CHANGE_SECTION_LABELS[part] ?? part) : part.replaceAll("_", " "),
    )
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Recursively checks that every key present in `expected` also exists in
// `actual` (missing entirely, not just falsy - a saved `null`/`0`/`""` is a
// real value, an absent key is not). Catches a localStorage draft saved by
// an older build whose ConfigSettings shape has since gained fields (e.g.
// detector.outputLabels, adversarial.builtInTools - see the Wave 6/7
// detector-adversarial split) - restoring one of those as-is doesn't error
// here, it errors later when e.g. SegmentDetectorSection does
// `value.outputLabels.join(...)` on the now-missing field. Only existence
// is checked, not deep type/value correctness - this is a crash guard, not
// a schema migration.
const hasExpectedShape = (expected: unknown, actual: unknown): boolean => {
  if (Array.isArray(expected)) return Array.isArray(actual);
  if (isPlainObject(expected)) {
    if (!isPlainObject(actual)) return false;
    return Object.keys(expected).every(
      (key) => key in actual && hasExpectedShape(expected[key], actual[key]),
    );
  }
  return actual !== undefined;
};

// Only the per-segment `agent` (the actual detector/classification/
// adversarial/... pipeline config) is checked - that's what the Segment*
// components read without defaults, so it's the only part that crashes on
// a stale shape. Segment codes come from the channel catalog and can
// legitimately differ per draft, so the segments map itself isn't compared
// key-for-key against a template.
const isDraftShapeValid = (draft: DraftState): boolean => {
  const agentTemplate = defaultSegmentAgent();
  return Object.values(draft.workingCopy.segments ?? {}).every((segment) =>
    hasExpectedShape(agentTemplate, segment.agent),
  );
};

function ConfiguracionPage() {
  const { role, user } = useRole();
  const isChannelManager = role === "channel_manager";
  const isReleaseManager = role === "release_manager";
  const isManager = role === "manager";
  const canManageSchema =
    (isManager || isReleaseManager) && Boolean(user?.permissions.includes("alert_schema"));
  const isDeployApprover = isManager || isReleaseManager;
  const canManageChannelMembership = role === "manager" || isReleaseManager;
  const canEditConfiguration = role === "manager" || isChannelManager || isReleaseManager;
  const queryClient = useQueryClient();
  const { healthy: apiHealthy, checked: apiChecked } = useApiHealth();
  const apiDown = apiChecked && !apiHealthy;

  // Real backend-sourced lineages (each entry = latest version of a
  // configuration_id). New, not-yet-saved configs live only in
  // localConfigs+drafts until the first "Guardar como nueva versión"
  // persists them (see saveVersion) — mirrors the old mock's versions:[]
  // draft.
  const configsQuery = useQuery({
    queryKey: ["configurations"],
    queryFn: () => listConfigurations(),
  });
  const activeQuery = useQuery({
    queryKey: ["activeConfiguration"],
    queryFn: () => getActiveConfiguration(),
  });
  // Gates "Activar esta versión" below: test runs (src/routes/testing.index.tsx)
  // have no configuration_id link back to a draft yet, so this is a coarse
  // system-wide guardrail ("has ARIA ever passed a real test") rather than
  // "has THIS draft been tested" - tighten once that link exists.
  const testRunsQuery = useQuery({
    queryKey: ["testRuns", "desc"],
    queryFn: () => listTestRuns({ data: { order: "desc" } }),
  });
  const deployRequestsQuery = useQuery({
    queryKey: ["configurationDeployRequests"],
    queryFn: () => listConfigurationDeployRequests(),
    enabled: isDeployApprover,
  });
  const hasSucceededTestRun = (testRunsQuery.data ?? []).some((run) => run.status === "SUCCEEDED");
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

  // A persisted segment-specific tab must not be visible to a role that only
  // has access to general configuration.
  useEffect(() => {
    if (!isChannelManager && (activeTab === "segmentoAgente" || activeTab === "segmentoEvaluacion"))
      setActiveTab("general");
    if (isChannelManager && (activeTab === "general" || activeTab === "infra" || activeTab === "ops" || activeTab === "test" || activeTab === "schema"))
      setActiveTab("segmento");
    if (!canManageSchema && activeTab === "schema") setActiveTab("general");
  }, [activeTab, isChannelManager, canManageSchema]);

  const [localConfigs, setLocalConfigs] = useState<
    { id: string; name: string; description: string }[]
  >([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  // baseVersion "latest" clones the base config's current draft (if one is
  // open) or its latest saved version - a specific number pins one exact
  // historical version instead, fetched fresh regardless of any open draft.
  const [newConfigForm, setNewConfigForm] = useState<{
    name: string;
    baseId: string;
    baseVersion: number | "latest";
  } | null>(null);
  const [configPickerCollapsed, setConfigPickerCollapsed] = useState(true);
  const [versionPickerCollapsed, setVersionPickerCollapsed] = useState(true);

  const [deployTarget, setDeployTarget] = useState<{ configId: string; version: number } | null>(
    null,
  );
  const [deployMode, setDeployMode] = useState<"immediate" | "window">("immediate");
  const [deployConfirmText, setDeployConfirmText] = useState("");
  const [scheduledDeploys, setScheduledDeploys] = useState<
    Record<string, { version: number; hour: string }>
  >({});
  const [deployRequestTarget, setDeployRequestTarget] = useState<{
    configId: string;
    version: number;
  } | null>(null);
  const [deployRequestTitle, setDeployRequestTitle] = useState("");
  const [deployRequestMessage, setDeployRequestMessage] = useState("");
  const [deployRequestError, setDeployRequestError] = useState<string | null>(null);
  // Set when saveVersion's POST comes back 409 — the lineage moved on since
  // this draft was seeded. Cleared by reloadLatestVersion or a new save attempt.
  const [versionConflict, setVersionConflict] = useState(false);
  const [pendingAction, setPendingAction] = useState<"restore" | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [saveConfirmText, setSaveConfirmText] = useState("");
  const [savePreviewLoading, setSavePreviewLoading] = useState(false);
  const [savePreviewError, setSavePreviewError] = useState<string | null>(null);
  // Confirm-before-discard for startNewVersionFrom below — a native
  // window.confirm() would look out of place next to every other
  // confirmation in this page being a custom modal.
  const [pendingVersionSwitch, setPendingVersionSwitch] = useState<{
    fromVersion?: number;
    toVersion: number;
  } | null>(null);

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
    ...backendConfigs.map((c) => ({
      id: c.configuration_id,
      name: c.name,
      description: c.description,
      latestVersion: c.version as number | null,
    })),
    ...localConfigs.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      latestVersion: null as number | null,
    })),
  ];

  const running = activeQuery.data
    ? { configId: activeQuery.data.configuration_id, version: activeQuery.data.version }
    : { configId: "", version: -1 };

  // Version history for whichever config is picked as "Basada en" in the
  // New config modal - separate from versionsQuery above (that one tracks
  // selectedConfigId, which may differ from the modal's in-progress choice).
  // Only meaningful for a backend-persisted base; a local/temp lineage has
  // no saved versions to pick from, only its current draft.
  const newConfigBaseItem =
    newConfigForm && newConfigForm.baseId !== NEW_CONFIG_NONE_BASE_ID
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
        if (parsed.drafts && typeof parsed.drafts === "object") {
          // Drop drafts saved by an older build whose ConfigSettings shape
          // has since gained fields (see hasExpectedShape above) instead of
          // restoring them as-is and crashing the first Segment* tab that
          // reads a now-missing field. The next persist effect run writes
          // this filtered map back, so the stale entry doesn't linger.
          const cleaned = Object.fromEntries(
            Object.entries(parsed.drafts).filter(([, draft]) => {
              try {
                return isDraftShapeValid(draft);
              } catch {
                return false;
              }
            }),
          );
          if (Object.keys(cleaned).length !== Object.keys(parsed.drafts).length) {
            console.warn(
              "[configuracion] Descartando borrador(es) local(es) con un esquema de configuración desactualizado.",
            );
          }
          setDrafts(cleaned);
        }
        if (Array.isArray(parsed.localConfigs)) setLocalConfigs(parsed.localConfigs);
        if (parsed.activeTab && TAB_META.some((t) => t.key === parsed.activeTab))
          setActiveTab(parsed.activeTab);
        if (parsed.selectedConfigId) {
          setSelectedConfigId(parsed.selectedConfigId);
          setSelectedVersion(
            parsed.selectedVersion === "draft" || typeof parsed.selectedVersion === "number"
              ? parsed.selectedVersion
              : "draft",
          );
          hydratedSelectionRef.current = true;
        }
      }
    } catch {
      // localStorage no disponible o corrupto — se queda en los valores por defecto.
    } finally {
      setEditorStateHydrated(true);
    }
  }, []);

  // Persists the editing object + current tab/selection on every change,
  // once past the restore above (otherwise this would fire first, on the
  // blank initial state, and overwrite what's in storage before the restore
  // effect's setState calls above ever take effect).
  useEffect(() => {
    if (!editorStateHydrated) return;
    try {
      const toPersist: PersistedConfiguracionState = {
        selectedConfigId,
        selectedVersion,
        activeTab,
        drafts,
        localConfigs,
      };
      localStorage.setItem(CONFIGURACION_STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
      // localStorage no disponible — la preferencia solo dura la sesión actual.
    }
  }, [editorStateHydrated, selectedConfigId, selectedVersion, activeTab, drafts, localConfigs]);

  // Pick a default selection once configs have loaded: whatever is active
  // in production, else the first config in the list.
  useEffect(() => {
    if (selectedConfigId || hydratedSelectionRef.current) return;
    if (activeQuery.data) {
      setSelectedConfigId(activeQuery.data.configuration_id);
      setSelectedVersion(activeQuery.data.version);
      return;
    }
    if (configListItems.length > 0) {
      setSelectedConfigId(configListItems[0].id);
      setSelectedVersion("draft");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId, activeQuery.data, configListItems.length]);

  // Seed a config's draft from its latest saved version the first time it's
  // selected in a session — after that, local edits (drafts state) win.
  useEffect(() => {
    if (!selectedConfigId || isTempId(selectedConfigId) || drafts[selectedConfigId]) return;
    const summary = backendConfigs.find((c) => c.configuration_id === selectedConfigId);
    if (!summary) return;
    let cancelled = false;
    queryClient
      .fetchQuery({
        queryKey: ["configurationVersion", selectedConfigId, summary.version],
        queryFn: () =>
          getConfigurationVersion({
            data: { configurationId: selectedConfigId, version: summary.version },
          }),
      })
      .then((detail) => {
        if (cancelled) return;
        setDrafts((prev) =>
          prev[selectedConfigId]
            ? prev
            : {
                ...prev,
                [selectedConfigId]: {
                  workingCopy: settingsFromConfigurationDetail(detail),
                  baseline: settingsFromConfigurationDetail(detail),
                  dirtyTabs: [],
                  basedOnVersion: summary.version,
                },
              },
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConfigId, backendConfigs.length]);

  const versionsQuery = useQuery({
    queryKey: ["configurationVersions", selectedConfigId],
    queryFn: () => listConfigurationVersions({ data: { configurationId: selectedConfigId! } }),
    enabled: !!selectedConfigId && !isTempId(selectedConfigId),
  });

  const historicalDetailQuery = useQuery({
    queryKey: ["configurationVersion", selectedConfigId, selectedVersion],
    queryFn: () =>
      getConfigurationVersion({
        data: { configurationId: selectedConfigId!, version: selectedVersion as number },
      }),
    enabled: !!selectedConfigId && selectedVersion !== "draft" && !isTempId(selectedConfigId),
  });

  const selectedListItem = configListItems.find((c) => c.id === selectedConfigId);
  const selectedDraft = selectedConfigId ? drafts[selectedConfigId] : undefined;
  const backendVersions = versionsQuery.data ?? [];
  const versions: VersionEntry[] = [...backendVersions]
    .sort((a, b) => a.version - b.version)
    .map((v) => ({
      version: v.version,
      settings:
        v.version === selectedVersion && historicalDetailQuery.data
          ? settingsFromConfigurationDetail(historicalDetailQuery.data)
          : undefined,
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
  const viewingVersion = isDraftView
    ? undefined
    : versions.find((v) => v.version === selectedVersion);
  const settingsLoading = !isDraftView && !viewingVersion?.settings;
  const settings = isDraftView
    ? selectedConfig.workingCopy
    : (viewingVersion?.settings ?? defaultSettings());
  const migrationDatetimeMin = minimumMigrationDatetime();
  const migrationDatetimeInvalid =
    settings.migrationWindowEnabled && !isMigrationDatetimeValid(settings.migrationWindowDatetime);
  const readOnlyHistorical = !isDraftView;
  // Task 2 fix: the historical banner used to call every non-draft version
  // "histórica" — including the one actually running in production, right
  // next to its green "Producción" badge in the version list. Distinguish
  // the live version from a genuinely superseded one.
  const viewingIsLive =
    readOnlyHistorical &&
    running.configId === selectedConfig.id &&
    running.version === selectedVersion;
  const locked =
    saving ||
    restoring ||
    !selectedDraft ||
    readOnlyHistorical ||
    settingsLoading ||
    apiDown ||
    savePreviewLoading;
  const unsaved = isTempId(selectedConfigId);
  // Mirrors CreateConfigurationUseCase's overwrite condition: a save only
  // mints a new version if the draft's base was never activated - and only
  // once that base version is actually known (not unsaved/loading), so the
  // label defaults to the safe "nueva versión" phrasing while unsure.
  const basedOnVersionEntry =
    selectedDraft?.basedOnVersion != null
      ? versions.find((v) => v.version === selectedDraft.basedOnVersion)
      : undefined;
  const canEditVersion = (version: number) => {
    const entry = backendVersions.find((v) => v.version === version);
    return (
      !!entry &&
      versionsQuery.isSuccess &&
      testRunsQuery.isSuccess &&
      activeQuery.isSuccess &&
      version === Math.max(...backendVersions.map((v) => v.version)) &&
      !entry.active &&
      !entry.ever_activated &&
      !(entry as typeof entry & { ever_tested?: boolean }).ever_tested &&
      !(running.configId === selectedConfigId && running.version === version) &&
      !(testRunsQuery.data ?? []).some(
        (run) =>
          run.config.configuration_ref?.configuration_id === selectedConfigId &&
          run.config.configuration_ref.version === version,
      )
    );
  };
  const selectedSavedVersion =
    !isDraftView && typeof selectedVersion === "number"
      ? backendVersions.find((version) => version.version === selectedVersion)
      : undefined;
  const canRequestDeploy =
    isChannelManager && !!selectedSavedVersion?.ever_tested && !selectedSavedVersion.active;
  // "Probar configuración" step of the Borrador → Guardar → Probar →
  // Desplegar cycle (see ConfigurationVersionGuide) — a real button next to
  // Guardar/Desplegar's, not just the passive "Ir a Testing" links below.
  // Available to every editor role (manager/channel_manager/release_manager
  // alike): any saved, not-yet-tested, not-yet-live version can be sent to
  // Testing pre-targeted via URL params.
  const canProbarConfiguracion =
    canEditConfiguration &&
    !isDraftView &&
    !!selectedSavedVersion &&
    !selectedSavedVersion.ever_tested &&
    !selectedSavedVersion.active;
  const willOverwrite =
    !unsaved &&
    selectedDraft?.basedOnVersion != null &&
    canEditVersion(selectedDraft.basedOnVersion);
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

  const selectConfigRow = (c: AgentConfig) => {
    setSelectedConfigId(c.id);
    setSelectedVersion(defaultVersionFor(c));
  };

  // Task 1 fix: previously the "Iniciar nueva versión basada en vN" button
  // just flipped to draft view (setSelectedVersion("draft")) without ever
  // seeding the draft from vN — since only one draft slot exists per
  // configuration (seeded once from the latest version, see the effect
  // above), clicking it from ANY historical version silently reopened
  // whatever draft already existed, regardless of which vN was requested.
  // This seeds the draft from the actual requested version every time.
  const applyStartNewVersionFrom = async (version: number) => {
    if (!selectedConfigId) return;
    const detail =
      selectedVersion === version && historicalDetailQuery.data
        ? historicalDetailQuery.data
        : await queryClient.fetchQuery({
            queryKey: ["configurationVersion", selectedConfigId, version],
            queryFn: () =>
              getConfigurationVersion({ data: { configurationId: selectedConfigId, version } }),
          });
    setDrafts((prev) => ({
      ...prev,
      [selectedConfigId]: {
        workingCopy: settingsFromConfigurationDetail(detail),
        baseline: settingsFromConfigurationDetail(detail),
        dirtyTabs: [],
        basedOnVersion: version,
      },
    }));
    setSelectedVersion("draft");
  };

  // Warns before clobbering a dirty draft based on a different version —
  // via the app's own modal (see pendingVersionSwitch render below), not a
  // native window.confirm().
  const startNewVersionFrom = (version: number) => {
    if (!selectedConfigId) return;
    const currentDraft = drafts[selectedConfigId];
    if (currentDraft?.basedOnVersion === version) {
      setSelectedVersion("draft");
      return;
    }
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
          queryFn: () =>
            getConfigurationVersion({
              data: { configurationId: configId, version: selectedDraft.basedOnVersion! },
            }),
        });
        baseline = settingsFromConfigurationDetail(detail);
      }
      const restoredSettings = baseline ?? {
        ...defaultSettings(),
        segments: buildSegmentsFromChannels(channels),
      };
      setDrafts((prev) => ({
        ...prev,
        [configId]: {
          workingCopy: structuredClone(restoredSettings),
          baseline: restoredSettings,
          basedOnVersion: selectedDraft.basedOnVersion,
          dirtyTabs: [],
        },
      }));
      setVersionConflict(false);
      setSavePreviewError(null);
      setPendingAction(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "No se pudieron restaurar los cambios.",
      );
    } finally {
      setRestoring(false);
    }
  };

  const patchSettings = (tab: TabKey, patch: Partial<ConfigSettings>) => {
    if (locked || !isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [] };
      const dirtyTabs = current.dirtyTabs.includes(tab)
        ? current.dirtyTabs
        : [...current.dirtyTabs, tab];
      return {
        ...prev,
        [selectedConfigId]: {
          ...current,
          workingCopy: { ...current.workingCopy, ...patch },
          dirtyTabs,
        },
      };
    });
  };

  const patchSegment = (tab: TabKey, code: SegmentCode, patch: Partial<SegmentSettings>) => {
    if (locked || !isDraftView || !selectedConfigId) return;
    setDrafts((prev) => {
      const current = prev[selectedConfigId] ?? { workingCopy: settings, dirtyTabs: [] };
      const dirtyTabs = current.dirtyTabs.includes(tab)
        ? current.dirtyTabs
        : [...current.dirtyTabs, tab];
      const segments = {
        ...current.workingCopy.segments,
        [code]: { ...current.workingCopy.segments[code], ...patch },
      };
      return {
        ...prev,
        [selectedConfigId]: {
          ...current,
          workingCopy: { ...current.workingCopy, segments },
          dirtyTabs,
        },
      };
    });
  };

  const createMutation = useMutation({
    mutationFn: (request: CreateConfigurationRequest) => createConfiguration({ data: request }),
  });
  const activateMutation = useMutation({
    mutationFn: (payload: { configurationId: string; version: number }) =>
      activateConfiguration({ data: payload }),
  });
  const createDeployRequestMutation = useMutation({
    mutationFn: (payload: { configurationId: string; version: number; title: string; message: string }) =>
      createConfigurationDeployRequest({ data: payload }),
  });
  const approveDeployRequestMutation = useMutation({
    mutationFn: (requestId: string) => approveConfigurationDeployRequest({ data: { requestId } }),
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
      basedOnVersion:
        wasTemp || forceNewVersion || !willOverwrite ? null : selectedDraft?.basedOnVersion,
    });
  };

  const requestSave = async (forceNewVersion = false) => {
    if (!isDraftView || !selectedConfigId || locked) return;
    setSavePreviewError(null);
    if (
      settings.migrationWindowEnabled &&
      !isMigrationDatetimeValid(settings.migrationWindowDatetime)
    ) {
      setSavePreviewError(
        "La fecha y hora de migración debe ser al menos 30 minutos posterior a la hora actual.",
      );
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
      setSaveConfirmText("");
      setPendingSave({ forceNewVersion, request, preview });
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) {
        setVersionConflict(true);
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setSavePreviewError("La validación tardó más de 5 segundos. Intenta guardar nuevamente.");
      } else {
        setSavePreviewError(
          err instanceof Error ? err.message : "No se pudo validar la configuración.",
        );
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
      if (err instanceof Error && err.message.includes("409")) {
        setVersionConflict(true);
        return;
      }
      throw err;
    }

    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedConfigId];
      next[created.configuration_id] = {
        workingCopy: settingsFromConfigurationDetail(created),
        baseline: settingsFromConfigurationDetail(created),
        dirtyTabs: [],
        basedOnVersion: created.version,
      };
      return next;
    });
    if (wasTemp) setLocalConfigs((prev) => prev.filter((c) => c.id !== selectedConfigId));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      queryClient.invalidateQueries({
        queryKey: ["configurationVersions", created.configuration_id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["configurationVersion", created.configuration_id],
      }),
    ]);
    setSelectedConfigId(created.configuration_id);
    setSelectedVersion(created.version);
  };

  const confirmSave = async () => {
    if (!pendingSave || saving || saveConfirmText !== "CONFIRMAR") return;
    if (
      pendingSave.request.general.migration_window_enabled &&
      !isMigrationDatetimeValid(pendingSave.request.general.migration_window_datetime)
    ) {
      setPendingSave(null);
      setSaveConfirmText("");
      setSavePreviewError(
        "La fecha y hora de migración debe ser al menos 30 minutos posterior a la hora actual.",
      );
      return;
    }
    setSaving(true);
    try {
      await saveVersion(pendingSave.request);
      setPendingSave(null);
      setSaveConfirmText("");
    } catch (error) {
      setSavePreviewError(
        error instanceof Error ? error.message : "No se pudieron guardar los cambios.",
      );
      setPendingSave(null);
    } finally {
      setSaving(false);
    }
  };

  // Retain the local draft after a 409. The user can explicitly rebase it
  // onto the latest saved version, which updates its base without dropping edits.
  const reloadLatestVersion = () => {
    if (!selectedConfigId) return;
    const configId = selectedConfigId;
    const latestVersion = configListItems.find((item) => item.id === configId)?.latestVersion;
    if (latestVersion == null) return;
    setVersionConflict(false);
    void queryClient.fetchQuery({
      queryKey: ["configurationVersion", configId, latestVersion],
      queryFn: () =>
        getConfigurationVersion({ data: { configurationId: configId, version: latestVersion } }),
    }).then((latest) => {
      setDrafts((prev) => {
        const draft = prev[configId];
        if (!draft) return prev;
        return {
          ...prev,
          [configId]: {
            ...draft,
            baseline: settingsFromConfigurationDetail(latest),
            basedOnVersion: latestVersion,
          },
        };
      });
    }).catch((error) => {
      setVersionConflict(true);
      setSavePreviewError(error instanceof Error ? error.message : "No se pudo cargar la última versión.");
    });
  };

  const openDeploy = (configId: string, version: number) => {
    setDeployTarget({ configId, version });
    setDeployMode("immediate");
    setDeployConfirmText("");
  };
  const openDeployRequest = (configId: string, version: number) => {
    setDeployRequestTarget({ configId, version });
    setDeployRequestTitle("");
    setDeployRequestMessage("");
    setDeployRequestError(null);
  };
  const closeDeployRequest = () => {
    if (createDeployRequestMutation.isPending) return;
    setDeployRequestTarget(null);
    setDeployRequestError(null);
  };
  const deployRequestPreviewQuery = useQuery({
    queryKey: ["configurationDeployRequestPreview", deployRequestTarget?.configId, deployRequestTarget?.version],
    queryFn: () =>
      previewConfigurationDeployRequest({
        data: { configurationId: deployRequestTarget!.configId, version: deployRequestTarget!.version },
      }),
    enabled: !!deployRequestTarget,
  });
  const submitDeployRequest = async () => {
    if (!deployRequestTarget || !deployRequestTitle.trim() || !deployRequestMessage.trim()) return;
    try {
      await createDeployRequestMutation.mutateAsync({
        configurationId: deployRequestTarget.configId,
        version: deployRequestTarget.version,
        title: deployRequestTitle.trim(),
        message: deployRequestMessage.trim(),
      });
      setDeployRequestTarget(null);
      setDeployRequestError(null);
    } catch (error) {
      setDeployRequestError(error instanceof Error ? error.message : "No se pudo crear la solicitud.");
    }
  };
  const approveDeployRequest = async (requestId: string) => {
    try {
      await approveDeployRequestMutation.mutateAsync(requestId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["configurationDeployRequests"] }),
        queryClient.invalidateQueries({ queryKey: ["activeConfiguration"] }),
        queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo aprobar la solicitud.");
    }
  };
  const closeDeploy = () => {
    setDeployTarget(null);
    setDeployConfirmText("");
  };

  const deployDetailQuery = useQuery({
    queryKey: ["configurationVersion", deployTarget?.configId, deployTarget?.version],
    queryFn: () =>
      getConfigurationVersion({
        data: { configurationId: deployTarget!.configId, version: deployTarget!.version },
      }),
    enabled: !!deployTarget,
  });
  const deployWindowEnabled = deployDetailQuery.data?.general.migration_window_enabled ?? false;
  const deployWindowDatetime =
    deployDetailQuery.data?.general.migration_window_datetime ?? "2000-01-01T02:00";
  const deployWindowDatetimeValid = isMigrationDatetimeValid(deployWindowDatetime);
  const deployConfirmed = deployConfirmText.trim().toUpperCase() === "CONFIRMAR";
  const canConfirmDeploy =
    deployConfirmed &&
    hasSucceededTestRun &&
    (deployMode === "immediate" || (deployWindowEnabled && deployWindowDatetimeValid));

  const confirmDeploy = async () => {
    if (!deployTarget || !deployConfirmed || !hasSucceededTestRun) return;
    if (
      deployMode === "window" &&
      (!deployWindowEnabled || !isMigrationDatetimeValid(deployWindowDatetime))
    )
      return;
    const { configId, version } = deployTarget;
    if (deployMode === "immediate") {
      await activateMutation.mutateAsync({ configurationId: configId, version });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activeConfiguration"] }),
        queryClient.invalidateQueries({ queryKey: ["configurations"] }),
      ]);
      setScheduledDeploys((prev) => {
        const n = { ...prev };
        delete n[configId];
        return n;
      });
    } else {
      // ponytail: no backend concept of a scheduled/windowed activation yet
      // (activate is immediate-only) — stays client-local until one exists.
      setScheduledDeploys((prev) => ({
        ...prev,
        [configId]: { version, hour: deployWindowDatetime },
      }));
    }
    closeDeploy();
  };

  const cancelScheduledDeploy = (configId: string) =>
    setScheduledDeploys((prev) => {
      const n = { ...prev };
      delete n[configId];
      return n;
    });

  const createConfig = async () => {
    if (!newConfigForm || !newConfigForm.name.trim()) return;
    const baseItem =
      newConfigForm.baseId === NEW_CONFIG_NONE_BASE_ID
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
        queryFn: () =>
          getConfigurationVersion({
            data: { configurationId: baseItem.id, version: pinnedVersion },
          }),
      });
      baseSettings = settingsFromConfigurationDetail(detail);
      baseVersionLabel = pinnedVersion;
    } else if (baseItem?.latestVersion != null) {
      const detail = await queryClient.fetchQuery({
        queryKey: ["configurationVersion", baseItem.id, baseItem.latestVersion],
        queryFn: () =>
          getConfigurationVersion({
            data: { configurationId: baseItem.id, version: baseItem.latestVersion! },
          }),
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
      // ponytail: JSON round-trip clone, fine while SegmentSettings holds only JSON-safe data.
      segments: JSON.parse(JSON.stringify(baseSettings.segments)),
    };
    const id = `cfg-temp-${Date.now()}`;
    setLocalConfigs((prev) => [
      ...prev,
      {
        id,
        name: newConfigForm.name.trim(),
        description: baseItem
          ? `Basada en ${baseItem.name}${baseVersionLabel != null ? `:v${baseVersionLabel}` : ""}.`
          : "",
      },
    ]);
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        workingCopy: clonedSettings,
        baseline: structuredClone(clonedSettings),
        dirtyTabs: [],
      },
    }));
    setSelectedConfigId(id);
    setSelectedVersion("draft");
    setActiveTab("general");
    setNewConfigForm(null);
  };

  const dirtyTabLabels = selectedConfig.dirtyTabs
    .map((k) => TAB_META.find((t) => t.key === k)?.label)
    .filter(Boolean)
    .join(", ");

  // Single consolidated message shown in the save-confirmation modal, folding
  // together what dirty tabs exist, which version the draft is based on,
  // and the overwrite-vs-new-version consequence — previously three
  // separate stacked banners repeating the same version name, then a
  // persistent "Ciclo de validación" card (retired: see UX_FIXES_ARIA.md R1).
  const showBasedOnVersion = !unsaved && !!basedOnVersionEntry;
  const versionLabel = showBasedOnVersion
    ? `${selectedConfig.name}:v${selectedDraft?.basedOnVersion}`
    : null;
  const nextVersionLabel = `${selectedConfig.name}:v${Math.max(0, ...backendVersions.map((v) => v.version)) + 1}`;
  const validationSummary =
    dirtyTabLabels && versionLabel ? (
      <>
        Cambios sin guardar en <span className="font-medium">{dirtyTabLabels}</span>, basados en{" "}
        <span className="font-medium">{versionLabel}</span>.{" "}
        {willOverwrite ? (
          <>
            Guardar sobrescribe esa versión — usa &quot;Guardar como nueva versión&quot; para
            conservarla y crear <span className="font-medium">{nextVersionLabel}</span> aparte.
          </>
        ) : (
          "Guardar siempre crea una nueva versión; esa se conserva intacta."
        )}
      </>
    ) : dirtyTabLabels ? (
      <>
        Cambios sin guardar en <span className="font-medium">{dirtyTabLabels}</span>.
      </>
    ) : versionLabel ? (
      <>
        <span className="font-medium">{versionLabel}</span>{" "}
        {willOverwrite ? (
          <>
            es la última versión, sin producción ni pruebas — guardar la modifica; usa &quot;Guardar
            como nueva versión&quot; para conservarla y crear{" "}
            <span className="font-medium">{nextVersionLabel}</span> aparte.
          </>
        ) : (
          "está protegida o es anterior — guardar crea una nueva versión; se conserva intacta."
        )}
      </>
    ) : null;
  const saveButtonLabel = savePreviewLoading
    ? "Validando cambios…"
    : willOverwrite
      ? `Guardar cambios en ${selectedConfig.name}:v${selectedDraft?.basedOnVersion}`
      : "Guardar como nueva versión";

  const editorStatus = !selectedConfigId
    ? "Selecciona una configuración"
    : !isDraftView
      ? `Consultando configuración ${selectedConfig.name} · Versión ${selectedVersion}${viewingIsLive ? " · Producción" : ""} · Solo lectura`
      : unsaved
        ? `Creando configuración ${selectedConfig.name} · Versión 1`
        : willOverwrite
          ? `Modificando configuración ${selectedConfig.name} · Versión ${selectedDraft?.basedOnVersion}`
          : `Creando nueva versión de configuración ${selectedConfig.name} · Basada en versión ${selectedDraft?.basedOnVersion ?? "…"}`;

  const hasChanges =
    !!selectedDraft &&
    (selectedDraft.baseline
      ? JSON.stringify(selectedDraft.workingCopy) !== JSON.stringify(selectedDraft.baseline)
      : selectedDraft.dirtyTabs.length > 0);
  // Rúbricas must sum to exactly 100 pts each (backend returns 422
  // otherwise) - block save up front and say which ones are off.
  const rubricErrors = selectedDraft
    ? rubricValidationErrors(selectedDraft.workingCopy.segments ?? {})
    : [];
  const canSave =
    !locked && !!selectedConfigId && (unsaved || hasChanges) && rubricErrors.length === 0;
  const canRestore =
    isDraftView && !!selectedDraft && hasChanges && !saving && !restoring && !savePreviewLoading;
  const actionButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <DashboardLayout
      bottomBar={
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-0 text-[12px] text-text-secondary" role="status">
            <p className="font-medium text-text-primary">{editorStatus}</p>
            <p>
              {saving
                ? "Guardando…"
                : restoring
                  ? "Restaurando cambios…"
                  : savePreviewLoading
                    ? "Validando cambios…"
                    : !isDraftView
                      ? "Versión guardada · Solo lectura"
                      : unsaved
                        ? "Configuración nueva sin guardar"
                        : hasChanges
                          ? "Cambios pendientes de guardar"
                          : "Sin cambios pendientes"}
            </p>
            {isDraftView && rubricErrors.length > 0 && (
              <p className="text-danger" title={rubricErrors.join("\n")}>
                No se puede guardar: {rubricErrors.length === 1 ? "la rúbrica" : "las rúbricas"}{" "}
                {rubricErrors.join(" · ")} (deben sumar 100 pts).
              </p>
            )}
          </div>
          {canEditConfiguration && isDraftView && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canRestore}
                onClick={() => {
                  setActionError(null);
                  setPendingAction("restore");
                }}
                className={`${actionButtonClass} border border-border hover:bg-surface`}
              >
                <RotateCcw className="h-4 w-4" /> Restaurar cambios
              </button>
              {willOverwrite && isDraftView && (
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={() => requestSave(true)}
                  className={`${actionButtonClass} border border-primary text-primary hover:bg-primary/5`}
                >
                  <Plus className="h-4 w-4" /> Guardar como nueva versión
                </button>
              )}
              <button
                type="button"
                disabled={!canSave}
                title={saveButtonLabel}
                onClick={() => requestSave(false)}
                className={`${actionButtonClass} bg-primary text-white hover:bg-primary/90`}
              >
                {saving || savePreviewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                {saving
                  ? "Guardando…"
                  : savePreviewLoading
                    ? "Validando…"
                    : willOverwrite
                      ? "Guardar cambios"
                      : "Crear versión"}
              </button>
            </div>
          )}
          {canProbarConfiguracion && (
            <Link
              to="/testing"
              search={{ configurationId: selectedConfig.id, version: selectedSavedVersion!.version }}
              className={`${actionButtonClass} border border-primary text-primary hover:bg-primary/5`}
            >
              <ShieldCheck className="h-4 w-4" /> Probar configuración
            </Link>
          )}
          {canRequestDeploy && (
            <button
              type="button"
              onClick={() => openDeployRequest(selectedConfig.id, selectedVersion as number)}
              className={`${actionButtonClass} bg-primary text-white hover:bg-primary/90`}
            >
              <Send className="h-4 w-4" /> Solicitar despliegue
            </button>
          )}
        </div>
      }
    >
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="mb-2">
          <h1 className="text-[20px] font-semibold text-text-primary">Configuración del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">
            Configura a ARIA aquí. Es posible realizar configuraciones a nivel de infraestructura,
            operación, test, agente.
          </p>
        </header>

        {/* Sticky historical-version banner — always visible above the picker while browsing an old version */}
        {(isChannelManager || isReleaseManager || isManager) && readOnlyHistorical && (
          <div className="sticky top-0 z-20 -mx-8 px-8 py-2 bg-background/95 backdrop-blur border-b border-border">
            {settingsLoading ? (
              <div className="flex items-center gap-2.5 bg-text-secondary/10 border border-border rounded-lg px-4 py-2.5">
                <Loader2 className="h-4 w-4 text-text-secondary shrink-0 animate-spin" />
                <p className="text-[12px] text-text-primary">
                  Cargando versión {selectedConfig.name}:v{selectedVersion}…
                </p>
              </div>
            ) : (
              <div
                className={`flex items-center gap-2.5 border rounded-lg px-4 py-2.5 ${viewingIsLive ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}
              >
                {viewingIsLive ? (
                  <Radio className="h-4 w-4 text-success shrink-0" />
                ) : (
                  <Eye className="h-4 w-4 text-warning shrink-0" />
                )}
                <p className="text-[12px] text-text-primary">
                  Viendo la versión{" "}
                  <span className="font-medium">
                    {selectedConfig.name}:v{selectedVersion}
                  </span>{" "}
                  —{" "}
                  {viewingIsLive
                    ? "en producción, de solo lectura."
                    : "versión guardada, de solo lectura."}
                </p>
                <button
                  onClick={() => startNewVersionFrom(selectedVersion as number)}
                  className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/10 shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />{" "}
                  {canEditVersion(selectedVersion as number)
                    ? "Modificar"
                    : "Crear nueva versión basada en"}{" "}
                  {selectedConfig.name}:v{selectedVersion}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Segment configuration is visible only to Channel and Release Managers. */}
        {(isChannelManager || isReleaseManager || isManager) && (
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
                Configuraciones
              </h2>
              <ConfigurationVersionGuide />
            </div>
            {isChannelManager && <button
              onClick={() =>
                setNewConfigForm({
                  name: "",
                  baseId: selectedConfigId ?? NEW_CONFIG_NONE_BASE_ID,
                  baseVersion: "latest",
                })
              }
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Nueva configuración
            </button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="self-start border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setConfigPickerCollapsed((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary"
              >
                Configuración
                {configPickerCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
              {configPickerCollapsed ? (
                <button
                  onClick={() => setConfigPickerCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface"
                >
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-text-primary truncate">
                      {selectedListItem?.name ?? "—"}
                    </span>
                    <p className="text-[11px] text-text-secondary truncate mt-0.5">
                      {selectedListItem?.description}
                    </p>
                  </div>
                </button>
              ) : (
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {apiDown ? (
                    <div className="px-3 py-6 text-center">
                      <p className="text-[13px] font-medium text-danger">No disponible</p>
                      <p className="text-[11px] text-text-secondary mt-1">
                        Verifica el proveedor del servicio.
                      </p>
                    </div>
                  ) : (
                    configs.map((c) => {
                      const selected = c.id === selectedConfigId;
                      const isRunning = running.configId === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => selectConfigRow(c)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}
                        >
                          <div className="min-w-0">
                            <span className="text-[13px] font-medium text-text-primary truncate">
                              {c.name}
                            </span>
                            <p className="text-[11px] text-text-secondary truncate mt-0.5">
                              {c.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {c.dirtyTabs.length > 0 && (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-warning"
                                title="Cambios sin guardar"
                              />
                            )}
                            {scheduledDeploys[c.id] && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                                title={`Despliegue en ventana programado — ${c.name}:v${scheduledDeploys[c.id].version} el ${formatMigrationDatetime(scheduledDeploys[c.id].hour)}`}
                              >
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
                    })
                  )}
                </div>
              )}
            </div>

            <div className="self-start border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setVersionPickerCollapsed((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary"
              >
                Versión
                {versionPickerCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
              {versionPickerCollapsed ? (
                <button
                  onClick={() => setVersionPickerCollapsed(false)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface"
                >
                  <span
                    className={`text-[13px] font-medium ${isDraftView ? "text-warning" : "text-text-primary"}`}
                  >
                    {isDraftView
                      ? "Cambios sin guardar"
                      : `${selectedConfig.name}:v${selectedVersion}`}
                  </span>
                </button>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {showDraftRow && (
                    <button
                      onClick={() => setSelectedVersion("draft")}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${isDraftView ? "bg-primary/5" : "hover:bg-surface"}`}
                    >
                      <div>
                        <span className="text-[13px] font-medium text-warning">
                          Cambios sin guardar
                        </span>
                        <p className="text-[11px] text-text-secondary">
                          Borrador editable, aún no validado.
                        </p>
                      </div>
                    </button>
                  )}
                  {[...selectedConfig.versions].reverse().map((v) => {
                    const isRunningVersion =
                      running.configId === selectedConfig.id && running.version === v.version;
                    const isSelected = !isDraftView && selectedVersion === v.version;
                    const scheduled = scheduledDeploys[selectedConfig.id];
                    const isScheduledVersion = scheduled?.version === v.version;
                    return (
                      <div key={v.version} className="group">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedVersion(v.version)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setSelectedVersion(v.version);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-surface"}`}
                        >
                          <div>
                            <span className="text-[13px] font-medium text-text-primary">
                              {selectedConfig.name}:v{v.version}
                            </span>
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
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                                title={`Programado para el ${formatMigrationDatetime(scheduled!.hour)}`}
                              >
                                <CalendarClock className="h-3.5 w-3.5" /> Programado
                              </span>
                            )}
                            {isRunningVersion ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                                <Radio className="h-3.5 w-3.5" /> Producción
                              </span>
                            ) : !isChannelManager ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDeploy(selectedConfig.id, v.version);
                                }}
                                title="Desplegar a producción"
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10"
                              >
                                <Rocket className="h-3.5 w-3.5" /> Desplegar
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {v.testRun && (
                          <Link
                            to="/testing/$runId"
                            params={{ runId: v.testRun.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="hidden group-hover:flex flex-col gap-1.5 mx-3 mb-2 p-2.5 rounded-md border border-border bg-surface hover:border-primary/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-text-primary">
                                Salida del test guardado
                              </span>
                              <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-text-secondary">
                              <span>
                                Fraude no detectado:{" "}
                                <b className="text-text-primary font-medium">
                                  {v.testRun.fraudeNoDetectado}
                                </b>
                              </span>
                              <span>
                                Falsos positivos:{" "}
                                <b className="text-text-primary font-medium">
                                  {v.testRun.falsosPositivos}
                                </b>
                              </span>
                              <span>
                                Tiempo ahorrado:{" "}
                                <b className="text-text-primary font-medium">
                                  {v.testRun.tiempoAhorrado}
                                </b>
                              </span>
                              <span>
                                Latencia:{" "}
                                <b className="text-text-primary font-medium">
                                  {v.testRun.latencia}
                                </b>
                              </span>
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
        )}

        {isDeployApprover && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">
                  Solicitudes de despliegue
                </h2>
                <p className="text-[12px] text-text-secondary mt-1">
                  Aprueba una solicitud para promover exactamente la versión solicitada a producción.
                </p>
              </div>
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            {deployRequestsQuery.isLoading ? (
              <p className="text-[13px] text-text-secondary">Cargando solicitudes…</p>
            ) : deployRequestsQuery.isError ? (
              <p className="text-[13px] text-danger">No se pudieron cargar las solicitudes.</p>
            ) : (deployRequestsQuery.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-[13px] text-text-secondary">
                No hay solicitudes de despliegue.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {deployRequestsQuery.data?.map((request) => (
                  <div key={request.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-text-primary">{request.title}</p>
                        <p className="mt-1 text-[12px] text-text-secondary">{request.message}</p>
                        <p className="mt-2 text-[11px] text-text-secondary">
                          {request.requested_by} solicita {request.target_configuration_id}:v{request.target_version}
                          {request.current_configuration_id
                            ? ` · producción actual ${request.current_configuration_id}:v${request.current_version}`
                            : ""}
                          {` · ${request.changes.length} cambios`}
                        </p>
                      </div>
                      {request.status === "pending" ? (
                        <button
                          type="button"
                          disabled={approveDeployRequestMutation.isPending}
                          onClick={() => void approveDeployRequest(request.id)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar y desplegar
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-success">
                          Aprobada por {request.approved_by ?? "—"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Dirty-draft reminder for when the user has wandered off to a
            different version/config while a draft is still pending — once
            they're actually in the draft view, this same information shows
            up in the save-confirmation modal instead of duplicating it here. */}
        {isChannelManager && !unsaved && !isDraftView && selectedConfig.dirtyTabs.length > 0 && (
          <div className="flex items-center gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-2.5">
            <Pencil className="h-4 w-4 text-warning shrink-0" />
            <p className="text-[12px] text-text-primary">
              Tienes cambios sin guardar
              {selectedDraft?.basedOnVersion != null ? (
                <>
                  {" "}
                  basados en{" "}
                  <span className="font-medium">
                    {selectedConfig.name}:v{selectedDraft.basedOnVersion}
                  </span>
                </>
              ) : null}
              .
            </p>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <button
                onClick={() => setSelectedVersion("draft")}
                className="text-[12px] font-medium text-primary hover:underline"
              >
                Ver borrador
              </button>
            </div>
          </div>
        )}

        {isChannelManager && versionConflict && (
          <div className="flex items-center gap-2.5 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[12px] text-text-primary">
              Alguien más guardó una versión más nueva de esta configuración. Tus cambios siguen
              guardados localmente. Puedes actualizar la versión base y conservar tus ediciones para
              revisarlas antes de reintentar.
            </p>
            <button
              onClick={reloadLatestVersion}
              className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-danger border border-danger/30 rounded-md px-2.5 py-1 hover:bg-danger/10 shrink-0"
            >
              Actualizar base y conservar cambios
            </button>
          </div>
        )}

        {isChannelManager && savePreviewError && (
          <div className="flex items-center gap-2.5 bg-danger/10 border border-danger/30 rounded-lg px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
            <p className="text-[12px] text-text-primary">{savePreviewError}</p>
            <button
              onClick={() => setSavePreviewError(null)}
              className="ml-auto text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isChannelManager && scheduledDeploys[selectedConfig.id] && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[12px] text-text-primary">
              Despliegue en ventana programado:{" "}
              <span className="font-medium">
                {selectedConfig.name}:v{scheduledDeploys[selectedConfig.id].version}
              </span>{" "}
              se aplicará el{" "}
              <span className="font-medium">
                {formatMigrationDatetime(scheduledDeploys[selectedConfig.id].hour)}
              </span>
              .
            </p>
            <button
              onClick={() => cancelScheduledDeploy(selectedConfig.id)}
              className="ml-auto text-[12px] font-medium text-danger hover:underline shrink-0"
            >
              Cancelar despliegue
            </button>
          </div>
        )}

        {/* Tabs */}
        <SectionTabs
          label="Secciones de configuración"
          items={(isChannelManager ? SEGMENT_CONFIGURATION_TAB_META : isReleaseManager ? RELEASE_TAB_META : GENERAL_TAB_META)
            .filter((tab) => tab.key !== "schema" || canManageSchema)
            .map((tab) => ({
            ...tab,
            dirty: selectedConfig.dirtyTabs.includes(tab.key),
          }))}
          value={activeTab}
          onValueChange={setActiveTab}
          disabled={apiDown}
        />

        <fieldset disabled={locked} className="contents">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Ventana de migración */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Ventana de migración de configuración
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Define la hora en la que se aplican los cambios de configuración: ARIA procesa y
                    cierra la cola de alertas pendientes, aplica la nueva configuración y reinicia
                    la operación.
                  </p>
                </div>
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[13px] font-medium text-text-primary">
                        Migración programada
                      </label>
                      <p className="text-[12px] text-text-secondary mt-0.5">
                        Si está desactivada, la activación ocurre de inmediato al correr el ciclo.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        patchSettings("general", {
                          migrationWindowEnabled: !settings.migrationWindowEnabled,
                        })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.migrationWindowEnabled ? "bg-primary" : "bg-border"}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.migrationWindowEnabled ? "translate-x-5" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                  {settings.migrationWindowEnabled && (
                    <Field
                      label="Fecha y hora de migración"
                      hint="Fecha y hora en que se cierra la cola, se cambia la configuración y se reinicia la operación."
                    >
                      <div className="flex items-center gap-2 max-w-[260px]">
                        <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                        <input
                          type="datetime-local"
                          min={migrationDatetimeMin}
                          value={settings.migrationWindowDatetime}
                          onChange={(e) =>
                            patchSettings("general", { migrationWindowDatetime: e.target.value })
                          }
                          aria-invalid={migrationDatetimeInvalid}
                          className={`w-full h-9 rounded-md border px-3 text-[13px] focus:outline-none ${migrationDatetimeInvalid ? "border-danger focus:border-danger" : "border-border focus:border-primary"}`}
                        />
                      </div>
                      {migrationDatetimeInvalid && (
                        <p className="text-[12px] text-danger mt-1">
                          Selecciona una fecha y hora al menos 30 minutos en el futuro.
                        </p>
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
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Límites operativos
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Controla el consumo de recursos del agente.
                  </p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField
                    label="Máxima cantidad de instancias del agente"
                    hint="Número máximo de sub-agentes ejecutándose en paralelo."
                    value={settings.maxInstances}
                    onChange={(v) => patchSettings("infra", { maxInstances: v })}
                    min={1}
                    max={32}
                    suffix="instancias"
                  />
                  <div className="flex flex-col">
                    <label className="text-[13px] font-medium text-text-primary">
                      Autoescalado de instancias
                    </label>
                    <p className="text-[12px] text-text-secondary mt-0.5 mb-3">
                      Permitir que ARIA escale dinámicamente hasta el límite definido.
                    </p>
                    <button
                      onClick={() => patchSettings("infra", { autoScale: !settings.autoScale })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoScale ? "bg-primary" : "bg-border"}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.autoScale ? "translate-x-5" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Retención de histórico de fraude
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Controla cuándo se mueve y elimina el histórico de fraude entre la base de datos
                    activa y el almacenamiento en frío (cold storage).
                  </p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField
                    label="Retención en base de datos"
                    hint="Tiempo desde su creación tras el cual un registro del histórico de fraude se mueve de la base de datos activa al cold storage."
                    value={settings.fraudHistoryDbRetentionDays}
                    onChange={(v) => patchSettings("infra", { fraudHistoryDbRetentionDays: v })}
                    min={1}
                    max={3650}
                    suffix="días"
                  />
                  <LimitField
                    label="Retención en cold storage"
                    hint="Tiempo adicional tras el cual un registro se elimina definitivamente del cold storage."
                    value={settings.fraudHistoryColdStorageRetentionMonths}
                    onChange={(v) =>
                      patchSettings("infra", { fraudHistoryColdStorageRetentionMonths: v })
                    }
                    min={1}
                    max={120}
                    suffix="meses"
                  />
                </div>
              </section>
            </div>
          )}
        </fieldset>

        {/* Not versioned: reads/writes the OperationalSettings singleton and
            applies immediately, so it's outside the version lock above. */}
        {activeTab === "ops" && <OperationsPanel readOnly={apiDown} />}

        {activeTab === "test" && (
          <div className="space-y-6">
            <fieldset disabled={locked} className="contents">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Escala del ciclo de test
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Controla cuántas instancias y experimentos usa el ciclo de validación al correr.
                  </p>
                </div>
                <div className="p-6 grid grid-cols-1 gap-6">
                  <LimitField
                    label="Máxima cantidad de instancias para test"
                    hint="Número de sub-agentes en paralelo usados exclusivamente durante el ciclo de validación."
                    value={settings.maxTestInstances}
                    onChange={(v) => patchSettings("test", { maxTestInstances: v })}
                    min={1}
                    max={32}
                    suffix="instancias"
                  />
                  <LimitField
                    label="Máximo de experimentos concurrentes"
                    hint="Cuántos ciclos de validación (de la misma o distintas configuraciones) pueden correr al mismo tiempo."
                    value={settings.maxConcurrentExperiments}
                    onChange={(v) => patchSettings("test", { maxConcurrentExperiments: v })}
                    min={1}
                    max={20}
                    suffix="experimentos"
                  />
                  <LimitField
                    label="Timeout por experimento"
                    hint="Minutos máximos que puede tomar un ciclo antes de marcarse como fallido y liberar sus instancias."
                    value={settings.experimentTimeoutMinutes}
                    onChange={(v) => patchSettings("test", { experimentTimeoutMinutes: v })}
                    min={5}
                    max={180}
                    suffix="minutos"
                  />
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Almacenamiento de resultados de test
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    Cuántos resultados de ciclos se conservan y qué hacer cuando se supera el
                    límite.
                  </p>
                </div>
                <div className="p-6 space-y-5">
                  <LimitField
                    label="Máxima cantidad de test runs almacenados"
                    hint="Tope de resultados de ciclos guardados por configuración."
                    value={settings.maxStoredTestRuns}
                    onChange={(v) => patchSettings("test", { maxStoredTestRuns: v })}
                    min={1}
                    max={100}
                    suffix="runs"
                  />
                  <Field
                    label="Política de limpieza"
                    hint="Qué hacer cuando se alcanza el máximo de test runs almacenados."
                  >
                    <select
                      value={settings.testCleanupPolicy}
                      onChange={(e) =>
                        patchSettings("test", {
                          testCleanupPolicy: e.target.value as TestCleanupPolicy,
                        })
                      }
                      className="w-full max-w-xs h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                    >
                      <option value="oldest">Borrar automáticamente los más antiguos</option>
                      <option value="failed-first">
                        Borrar automáticamente los fallidos primero
                      </option>
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
              channelsOnly={!isChannelManager && !isReleaseManager}
              allowChannelManagement={canManageChannelMembership}
              allowProcessingToggle={isManager || isReleaseManager}
            />
          </fieldset>
        )}

        {canManageSchema && activeTab === "schema" && (
          <AlertSchemaEditor />
        )}

        {(isChannelManager || isReleaseManager) && activeTab === "segmentoAgente" && (
          <SegmentAgentTab
            value={settings.segments}
            onChange={(code, patch) => patchSegment("segmentoAgente", code, patch)}
            channelLabels={channelLabels}
            disabled={locked}
          />
        )}

        {(isChannelManager || isReleaseManager) && activeTab === "segmentoEvaluacion" && (
          <SegmentEvaluationTab
            value={settings.segments}
            onChange={(code, patch) => patchSegment("segmentoEvaluacion", code, patch)}
            channelLabels={channelLabels}
            disabled={locked}
          />
        )}
      </div>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se descartarán los cambios sin guardar de ${selectedConfig.name} y se restaurará ${selectedDraft?.basedOnVersion != null ? `la versión base v${selectedDraft.basedOnVersion}` : "la configuración inicial del borrador"}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && (
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring || !canRestore}
              onClick={(event) => {
                event.preventDefault();
                void restoreChanges();
              }}
            >
              {restoring ? "Restaurando…" : "Confirmar restauración"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deployRequestTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeDeployRequest}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">Solicitar despliegue</h3>
              </div>
              <button type="button" onClick={closeDeployRequest} className="text-text-secondary hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-[12px] text-text-secondary">
                Solicitarás promover <span className="font-medium text-text-primary">{selectedConfig.name}:v{deployRequestTarget.version}</span>. Un Manager o Release Manager deberá aprobarla.
              </p>
              {deployRequestPreviewQuery.isLoading ? (
                <div className="flex items-center gap-2 text-[12px] text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Detectando cambios…</div>
              ) : deployRequestPreviewQuery.isError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                  No se pudieron detectar los cambios. Esta versión debe haber pasado un test antes de solicitar el despliegue.
                </p>
              ) : (
                <div>
                  <h4 className="mb-2 text-[12px] font-semibold text-text-primary">
                    Cambios frente a producción ({deployRequestPreviewQuery.data?.changes.length ?? 0})
                  </h4>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {(deployRequestPreviewQuery.data?.changes ?? []).map((change) => (
                      <div key={change.path} className="px-3 py-2 text-[11px]">
                        <p className="font-medium text-text-primary">{formatChangePath(change.path)}</p>
                        <p className="mt-0.5 text-text-secondary break-all">{formatChangeValue(change.previous)} → <span className="text-primary">{formatChangeValue(change.proposed)}</span></p>
                      </div>
                    ))}
                    {(deployRequestPreviewQuery.data?.changes ?? []).length === 0 && (
                      <p className="px-3 py-2 text-[11px] text-text-secondary">No hay diferencias con la configuración en producción.</p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-text-primary" htmlFor="deploy-request-title">Título <span className="text-danger">*</span></label>
                <input id="deploy-request-title" value={deployRequestTitle} onChange={(event) => setDeployRequestTitle(event.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-text-primary" htmlFor="deploy-request-message">Mensaje <span className="text-danger">*</span></label>
                <textarea id="deploy-request-message" value={deployRequestMessage} onChange={(event) => setDeployRequestMessage(event.target.value)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:border-primary focus:outline-none" />
              </div>
              {deployRequestError && <p className="text-[12px] text-danger">{deployRequestError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button type="button" onClick={closeDeployRequest} className="rounded-md border border-border px-4 py-2 text-[13px] hover:bg-surface">Cancelar</button>
              <button type="button" disabled={createDeployRequestMutation.isPending || deployRequestPreviewQuery.isLoading || deployRequestPreviewQuery.isError || !deployRequestTitle.trim() || !deployRequestMessage.trim()} onClick={() => void submitDeployRequest()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                {createDeployRequestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save confirmation modal — populated by POST /configuration/test. */}
      {pendingSave && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div
            className="bg-card rounded-xl border border-border w-full max-w-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">
                  Confirmar cambios de configuración
                </h3>
              </div>
              <button
                onClick={() => { setPendingSave(null); setSaveConfirmText(""); }}
                disabled={saving || createMutation.isPending}
                className="text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Revisa los cambios antes de{" "}
                {pendingSave.forceNewVersion
                  ? "crear la nueva versión"
                  : willOverwrite
                    ? `sobrescribir ${selectedConfig.name}:v${selectedDraft?.basedOnVersion}`
                    : "guardar la nueva versión"}
                .
              </p>

              {validationSummary && (
                <p className="text-[12px] text-text-secondary">{validationSummary}</p>
              )}

              {!hasSucceededTestRun && !testRunsQuery.isLoading ? (
                <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[12px] text-text-primary">
                    Guardar no pone esta versión en producción. Además, ARIA aún no ha pasado ningún
                    test — no podrás desplegarla hasta correr al menos uno en Testing.{" "}
                    <Link to="/testing" className="underline">
                      Ir a Testing
                    </Link>
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-text-secondary">
                  Guardar no pone esta versión en producción. Usa "Desplegar" desde el historial de
                  versiones para llevarla a producción.
                </p>
              )}

              {pendingSave.preview.warnings.map((warning) => (
                <div
                  key={warning}
                  className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-4 py-3"
                >
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
                    No se detectaron cambios de valores. Se conservará la configuración propuesta
                    tal como está.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {pendingSave.preview.changes.map((change) => (
                      <div key={change.path} className="px-4 py-3">
                        <p className="text-[12px] font-medium text-text-primary capitalize">
                          {formatChangePath(change.path)}
                        </p>
                        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-[11px]">
                          <span className="text-text-secondary break-all">
                            {formatChangeValue(change.previous)}
                          </span>
                          <span className="text-text-secondary">→</span>
                          <span className="text-primary font-medium break-all">
                            {formatChangeValue(change.proposed)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="save-confirmation" className="block text-[12px] font-medium text-text-primary mb-1.5">
                  Escribe <span className="font-semibold">CONFIRMAR</span> para guardar
                </label>
                <input
                  id="save-confirmation"
                  value={saveConfirmText}
                  onChange={(event) => setSaveConfirmText(event.target.value.toUpperCase())}
                  onPaste={(event) => event.preventDefault()}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-[13px] focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => { setPendingSave(null); setSaveConfirmText(""); }}
                disabled={saving || createMutation.isPending}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSave}
                disabled={saving || createMutation.isPending || saveConfirmText !== "CONFIRMAR"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {createMutation.isPending ? "Guardando…" : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard-draft confirmation modal — replaces a window.confirm() so it
          matches every other confirmation in this page. */}
      {pendingVersionSwitch && (
        <div
          className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setPendingVersionSwitch(null)}
        >
          <div
            className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <h3 className="text-[14px] font-semibold text-text-primary">
                  Descartar cambios sin guardar
                </h3>
              </div>
              <button
                onClick={() => setPendingVersionSwitch(null)}
                className="text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-text-primary">
                Tienes cambios sin guardar
                {pendingVersionSwitch.fromVersion != null ? (
                  <>
                    {" "}
                    basados en {selectedConfig.name}:v{pendingVersionSwitch.fromVersion}
                  </>
                ) : null}
                . Si continúas, se perderán y se cargará {selectedConfig.name}:v
                {pendingVersionSwitch.toVersion} para editar.
              </p>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setPendingVersionSwitch(null)}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const { toVersion } = pendingVersionSwitch;
                  setPendingVersionSwitch(null);
                  void applyStartNewVersionFrom(toVersion);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-danger text-white font-medium hover:bg-danger/90"
              >
                Descartar y continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New config modal */}
      {newConfigForm && (
        <div
          className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setNewConfigForm(null)}
        >
          <div
            className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Nueva configuración</h3>
              <button
                onClick={() => setNewConfigForm(null)}
                className="text-text-secondary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre">
                <input
                  value={newConfigForm.name}
                  onChange={(e) => setNewConfigForm({ ...newConfigForm, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                  placeholder="Ej: Canario 5%"
                />
              </Field>
              <Field
                label="Basada en"
                hint="Clona las taxonomías, límites y prompts de la configuración elegida, o arranca en blanco."
              >
                <select
                  value={newConfigForm.baseId}
                  onChange={(e) =>
                    setNewConfigForm({
                      ...newConfigForm,
                      baseId: e.target.value,
                      baseVersion: "latest",
                    })
                  }
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                >
                  <option value={NEW_CONFIG_NONE_BASE_ID}>Ninguna (valores por defecto)</option>
                  {configs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              {newConfigBaseItem && !newConfigBaseIsTemp && (
                <Field
                  label="Versión"
                  hint="La versión más reciente incluye cambios sin guardar de esa configuración, si la tienes abierta ahora mismo."
                >
                  <select
                    value={
                      newConfigForm.baseVersion === "latest"
                        ? "latest"
                        : String(newConfigForm.baseVersion)
                    }
                    onChange={(e) =>
                      setNewConfigForm({
                        ...newConfigForm,
                        baseVersion:
                          e.target.value === "latest" ? "latest" : Number(e.target.value),
                      })
                    }
                    disabled={newConfigBaseVersionsQuery.isLoading}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50"
                  >
                    <option value="latest">
                      Más reciente
                      {newConfigBaseItem.latestVersion != null
                        ? ` (v${newConfigBaseItem.latestVersion})`
                        : ""}
                    </option>
                    {[...newConfigBaseVersions]
                      .sort((a, b) => b.version - a.version)
                      .map((v) => (
                        <option key={v.version} value={v.version}>
                          v{v.version}
                          {v.ever_activated ? " · estuvo en producción" : ""}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setNewConfigForm(null)}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                onClick={createConfig}
                disabled={!newConfigForm.name.trim()}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Crear borrador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy to production modal */}
      {deployTarget && (
        <div
          className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
          onClick={closeDeploy}
        >
          <div
            className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">
                  Desplegar {configs.find((c) => c.id === deployTarget.configId)?.name}:v
                  {deployTarget.version} a producción
                </h3>
              </div>
              <button onClick={closeDeploy} className="text-text-secondary hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Esta versión de{" "}
                <span className="font-medium text-text-primary">
                  {configs.find((c) => c.id === deployTarget.configId)?.name}
                </span>{" "}
                reemplazará la configuración activa en producción. Elige cómo aplicar el cambio.
              </p>

              <div className="space-y-2.5">
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${deployMode === "immediate" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}
                >
                  <input
                    type="radio"
                    name="deploy-mode"
                    checked={deployMode === "immediate"}
                    onChange={() => setDeployMode("immediate")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Zap className="h-3.5 w-3.5 text-warning" /> Despliegue inmediato
                    </span>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      La versión reemplaza la configuración de producción de inmediato. Las alertas
                      en curso se procesan con la nueva configuración tan pronto se confirme.
                    </p>
                  </span>
                </label>

                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${!deployWindowEnabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${deployMode === "window" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}
                >
                  <input
                    type="radio"
                    name="deploy-mode"
                    checked={deployMode === "window"}
                    disabled={!deployWindowEnabled}
                    onChange={() => setDeployMode("window")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Despliegue en ventana
                    </span>
                    {deployWindowEnabled ? (
                      <>
                        <p className="text-[12px] text-text-secondary mt-0.5">
                          Se aplica en la próxima ventana de migración (
                          <span className="font-medium text-text-primary">
                            {formatMigrationDatetime(deployWindowDatetime)}
                          </span>
                          ): ARIA cierra la cola de alertas pendientes, aplica esta versión y
                          reinicia la operación.
                        </p>
                        {!deployWindowDatetimeValid && (
                          <p className="text-[12px] text-danger mt-1">
                            La ventana debe estar al menos 30 minutos en el futuro. Edita y guarda
                            la configuración antes de programar el despliegue.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[12px] text-text-secondary mt-0.5">
                        Esta versión no tiene ventana de migración configurada. Actívala en la
                        pestaña General para usar esta opción.
                      </p>
                    )}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-text-primary mb-1">
                  Escribe CONFIRMAR para autorizar el despliegue
                </label>
                <input
                  value={deployConfirmText}
                  onChange={(e) => setDeployConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                />
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
                    Esta configuración no ha sido probada y no puede desplegarse hasta satisfacer
                    esta condición — corre al menos un test en Testing.{" "}
                    <Link
                      to="/testing"
                      search={{ configurationId: deployTarget.configId, version: deployTarget.version }}
                      className="underline font-medium"
                    >
                      Ir a Testing
                    </Link>
                  </p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button
                onClick={closeDeploy}
                className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeploy}
                disabled={!canConfirmDeploy}
                title={
                  !hasSucceededTestRun
                    ? "Corre al menos un test en Testing antes de desplegar"
                    : !deployConfirmed
                      ? "Escribe CONFIRMAR para habilitar el despliegue"
                      : undefined
                }
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium ${canConfirmDeploy ? "bg-primary text-white hover:bg-primary/90" : "bg-border text-text-secondary cursor-not-allowed"}`}
              >
                <Rocket className="h-4 w-4" />{" "}
                {deployMode === "immediate" ? "Desplegar ahora" : "Programar despliegue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
