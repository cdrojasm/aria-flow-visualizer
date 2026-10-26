/* ─── Shared agent-config data, keyed by config id ──────────────────── */
/* Seeded here so /configuracion (editor) and /testing (test runner)      */
/* read the same configs/versions without a real backend.                */

import { TEST_RUNS, type TestRunIndicators } from "./testRuns";
import { emptyConfiguration, type FeatureConfiguration } from "@/lib/api/feature-recipes.functions";
import { createId } from "@/lib/createId";

/* ─── Types ──────────────────────────────────────────── */

export type Taxonomy = {
  id: string;
  code: string;
  name: string;
  description: string;
  variables: string[];
  examples: string[];
  active: boolean;
};
export type ModusOperandi = {
  id: string;
  title: string;
  narrative: string;
  taxonomyId: string;
  evolvedVariables: string[];
  active: boolean;
};

/* Many-to-many with ModusOperandi (via modusOperandiIds) - mirrors
   backend's Flag (application/ports/configuration_port.py), the merge of
   what used to be separate RedFlag/YellowFlag types. */
export type FlagType = "red" | "yellow";
export type Flag = {
  id: string;
  flagType: FlagType;
  name: string;
  description: string;
  evolvedVariables: string[];
  modusOperandiIds: string[];
};

/* A similar case belongs to exactly one modus operandi + taxonomy (no
   M2M here) - mirrors backend's ExampleCase. New to the frontend in
   Phase 3, it previously had zero UI representation. */
export type SimilarCase = {
  id: string;
  text: string;
  modusOperandiId: string;
  taxonomyId: string;
};

export type TabKey =
  | "general"
  | "infra"
  | "ops"
  | "agentSettings"
  | "test"
  | "segmento"
  | "schema"
  | "segmentoAgente"
  | "segmentoEvaluacion"
  | "optimizador";

/* ─── Segment configuration (Phase 1) ───────────────────
   Two fixed segments (not user-creatable). Each has an on/off toggle and
   an AND/OR filter tree over the managed tag catalog (integrationPoint /
   triggeredRules / eventType) - see src/lib/api/configuration.functions.ts
   for the tag-catalog backend calls. Mirrors
   backend/src/application/ports/configuration_port.py's SegmentSettings/
   FilterGroup/FilterCondition. */

export type TagCategory = "integration_point" | "triggered_rule" | "event_type";
export type LogicalOperator = "and" | "or";
export type FilterConditionOperator = "in";

export type FilterCondition = {
  id: string;
  category: TagCategory;
  operator: FilterConditionOperator;
  values: string[];
};

export type FilterGroup = {
  id: string;
  operator: LogicalOperator;
  conditions: FilterCondition[];
  groups: FilterGroup[];
};

// Segment key - used to come from a fixed 2-value enum, now any id from
// the channel_library_port.py catalog (see ChannelLibraryManager in
// biblioteca.tsx). Kept as a type alias (not just inlining `string`) so
// call sites documenting "this is a segment key" stay readable.
export type SegmentCode = string;

/* ─── Per-segment Monitoring + Agent config (Phase 2) ───
   Fully independent per segment - no shared global default. Mirrors
   backend's SegmentSettings.monitoring/agent, itself the former global
   MonitoringSettings/AgentSettings relocated. */

export type SegmentMonitoringConfig = {
  samplingIntervalValue: number;
  samplingIntervalUnit: SamplingIntervalUnit;
  samplingCriteria: SamplingCriterion[];
  maxSamples: number;
  promptClasificacion: string;
  promptClasificacionVars: string[];
  promptAnalista: string;
  promptAnalistaVars: string[];
  promptMonitoreo: string;
  promptMonitoreoVars: string[];
};

/* ─── Profiling chain (Phase 3) ──────────────────────────
   Fixed 3-step chain (usuario -> transaccion -> transaccional), run in
   this order. fieldEnrichment (below) is "data enrichment" - a feature-
   recipe configuration (same Recipe/RecipeStep shape modelos/ uses, see
   @/lib/api/feature-recipes.functions) where each enabled recipe's `name`
   is citable from Perfilamiento's own prompts - mirrors backend's
   ProfilingConfig/ProfilingStrategy (configuration_port.py). */

export type ProfilingStrategyKey = "usuario" | "transaccion" | "transaccional";
// Whether mainPrompt is used as a literal f-string (placeholders
// substituted directly, no LLM call) or as an actual prompt sent to an
// LLM - mutually exclusive, exactly one prompt input per strategy (the
// separate always-LLM "categorization" sub-prompt was removed, it just
// duplicated this same toggle in different UI).
export type ProfilingPromptMode = "fstring" | "llm";
export type ProfilingStrategy = {
  key: ProfilingStrategyKey;
  mainPrompt: string;
  mainPromptVars: string[];
  mainPromptMode: ProfilingPromptMode;
  usePandasHistoryMcp: boolean;
};
export type ProfilingConfig = {
  fieldEnrichment: FeatureConfiguration;
  strategies: ProfilingStrategy[];
};

export type RuleComparison = "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "between" | "in";
export type RuleCondition = {
  id: string;
  variable: string;
  comparison: RuleComparison;
  values: string[];
  score: number;
};
export type DeterministicDecision = "risk_suspected" | "risk";
export type AricAction = "soft_block" | "hard_block";
export type DeterministicRule = RuleCondition & {
  decision: DeterministicDecision;
  aricAction: AricAction;
};
export type DeterministicConfig = {
  alertFilter: FilterGroup;
  fieldEnrichment: FeatureConfiguration;
  rules: DeterministicRule[];
};
export type Rubric = { id: string; name: string; conditions: RuleCondition[] };

export const PROFILING_STRATEGY_LABELS: Record<ProfilingStrategyKey, string> = {
  usuario: "Perfilamiento de usuario",
  transaccion: "Perfilamiento de transacción",
  transaccional: "Perfil transaccional",
};

export const PROFILING_STRATEGY_KEYS: ProfilingStrategyKey[] = [
  "usuario",
  "transaccion",
  "transaccional",
];

export const defaultProfilingStrategy = (key: ProfilingStrategyKey): ProfilingStrategy => ({
  key,
  mainPrompt: "",
  mainPromptVars: [],
  mainPromptMode: "fstring",
  usePandasHistoryMcp: false,
});

export const defaultProfilingConfig = (): ProfilingConfig => ({
  fieldEnrichment: emptyConfiguration,
  strategies: PROFILING_STRATEGY_KEYS.map(defaultProfilingStrategy),
});

export const defaultDeterministicConfig = (): DeterministicConfig => ({
  alertFilter: emptyFilterGroup(),
  fieldEnrichment: emptyConfiguration,
  rules: [],
});

/* ─── Classification + Adversarial (Phase 4) ────────────
   Mirrors backend's ClassificationConfig/AdversarialConfig - both carry
   the same shared tool block (ToolPickerFields, backend AgentToolsConfig),
   each read independently. */

/* Tool block shared verbatim by Detector, Adversarial (detector),
   Clasificación and Adversarial (clasificador) - rendered by the single
   shared/AgentToolsSection.tsx. The vector store is only reachable
   through the Búsqueda en Vector Store (delegatedResearch.vectorStore); the
   old separate "Base de conocimiento" switch was the same thing and was
   merged into it. Watchlist membership direction isn't stored here - it's
   intrinsic to each selected watchlist's own list_type. */
export type ToolPickerFields = {
  watchlistEnabled: boolean;
  watchlistIds: string[];
  // Which alert field's value is looked up against the selected
  // watchlists' elements (e.g. "documento", "correo").
  watchlistCompareField: string | null;
  calculatorEnabled: boolean;
  // XGBoost decides only in the Detector (score >= xgboostFraudThreshold
  // -> fraude; < xgboostUncertaintyThreshold -> no fraude; en la banda
  // decide el agente). In every other step its output (score + SHAP) is
  // separate evidence for the agent.
  useXgboostModel: boolean;
  xgboostModelId: string | null;
  xgboostFraudThreshold: number;
  xgboostUncertaintyThreshold: number;
  xgboostShapEnabled: boolean;
  delegatedResearch: DelegatedResearchSettings;
};

export const defaultToolPickerFields = (): ToolPickerFields => ({
  watchlistEnabled: false,
  watchlistIds: [],
  watchlistCompareField: null,
  calculatorEnabled: false,
  useXgboostModel: false,
  xgboostModelId: null,
  xgboostFraudThreshold: 0.8,
  xgboostUncertaintyThreshold: 0.4,
  xgboostShapEnabled: true,
  delegatedResearch: defaultDelegatedResearchSettings(),
});

export type ResearchAgentConfig = {
  enabled: boolean;
  maxDelegations: number;
  timeoutSeconds: number;
  maxResultItems: number;
};
// vectorStore: the agent calls it as a tool; maxDelegations = max
// interactions per step. historyPandas ("Análisis de historial"): selector
// = allowedColumns (vacío = todas) + windowDays (0 = sin límite) +
// maxHistoryRows (las más recientes).
export type DelegatedResearchSettings = {
  vectorStore: ResearchAgentConfig & {
    vectorStoreInstanceId: string | null;
    similarityThreshold: number;
    maxDocumentsPerQuery: number;
    allowedAssetTypes: string[];
  };
  historyPandas: ResearchAgentConfig & {
    maxHistoryRows: number;
    windowDays: number;
    maxAnalysisOperations: number;
    allowedColumns: string[];
    allowedOperations: string[];
  };
};
export const defaultDelegatedResearchSettings = (): DelegatedResearchSettings => ({
  vectorStore: {
    enabled: false,
    maxDelegations: 3,
    timeoutSeconds: 8,
    maxResultItems: 10,
    vectorStoreInstanceId: null,
    similarityThreshold: 0.7,
    maxDocumentsPerQuery: 8,
    allowedAssetTypes: ["taxonomy", "modus_operandi", "similar_case", "flag"],
  },
  historyPandas: {
    enabled: false,
    maxDelegations: 1,
    timeoutSeconds: 8,
    maxResultItems: 10,
    maxHistoryRows: 50,
    windowDays: 30,
    maxAnalysisOperations: 4,
    allowedColumns: [],
    allowedOperations: [
      "filter",
      "group_by",
      "aggregate",
      "distribution",
      "trend",
      "outlier",
      "comparison",
    ],
  },
});

export type ClassificationConfig = ToolPickerFields & {
  prompt: string;
  promptVars: string[];
  // "iteraciones de pensamiento" - max ReAct-style tool-call loops before
  // the agent must answer. Clasificación, Detector and Adversarial
  // (Detector) all carry this field (see DetectorConfig/
  // DetectorAdversarialConfig) - Adversarial (Clasificación) does not.
  maxThoughtIterations: number;
  outputLabels: string[];
};

export type AdversarialConfig = ToolPickerFields & {
  prompt: string;
  promptVars: string[];
  maxCycles: number;
  feedFeedbackToClassification: boolean;
};

export const defaultClassificationConfig = (): ClassificationConfig => ({
  ...defaultToolPickerFields(),
  prompt: "",
  promptVars: [],
  maxThoughtIterations: 5,
  outputLabels: [],
});

export const defaultAdversarialConfig = (): AdversarialConfig => ({
  ...defaultToolPickerFields(),
  prompt: "",
  promptVars: [],
  maxCycles: 1,
  feedFeedbackToClassification: true,
});

/* ─── Detector + Adversarial (Detector) (Wave 6) ─────────
   Runs before Clasificación in the agent pipeline, immediately followed by
   its own adversarial critique step. Same shape as Clasificación - the
   whole tool block (ToolPickerFields) is shared by every step; only
   XGBoost's semantics differ (it decides here). DetectorAdversarialConfig
   has the exact same fields as AdversarialConfig (item 7) plus
   maxThoughtIterations. */

export type DetectorConfig = ClassificationConfig;

export type DetectorAdversarialConfig = AdversarialConfig & {
  maxThoughtIterations: number;
};

export const defaultDetectorConfig = (): DetectorConfig => defaultClassificationConfig();

export const defaultDetectorAdversarialConfig = (): DetectorAdversarialConfig => ({
  ...defaultAdversarialConfig(),
  maxThoughtIterations: 5,
});

/* ─── Analista + Documentación (Phase 5) ────────────────
   Mirrors backend's AnalystConfig/DocumentationConfig. */

export type ResolutionTag =
  "scale_to_analyst" | "send_to_voicebot" | "handle_by_aria" | "block_soft" | "block_hard";

export const RESOLUTION_TAG_LABELS: Record<ResolutionTag, string> = {
  scale_to_analyst: "Escalar a analista",
  send_to_voicebot: "Enviar a voicebot",
  handle_by_aria: "Resolver con ARIA",
  block_soft: "Bloqueo soft",
  block_hard: "Bloqueo hard",
};

export type VoicebotCategoryPrompt = {
  id: string;
  taxonomyId: string;
  prompt: string;
};

export type VoicebotConfig = {
  basePrompt: string;
  basePromptVars: string[];
  categoryPrompts: VoicebotCategoryPrompt[];
};

// Mirrors backend's AnalystConfig: a single prompt authored for the analyst
// stage. The playbook is library knowledge (Biblioteca), resolved at runtime
// and exposed to this prompt as {playbook} - no per-segment playbook list.
export type AnalystConfig = {
  prompt: string;
  promptVars: string[];
};

// Runtime-provided placeholders the backend fills for the analyst prompt.
export const ANALYST_PROMPT_VARIABLES = [
  "modus_operandi",
  "playbook",
  "voicebot_resources",
  "analyst_resources",
];

export type DocumentationStrategy = "template" | "agent";

export type DocumentationConfig = {
  strategy: DocumentationStrategy;
  template: string;
  templateVars: string[];
  agentPrompt: string;
  agentPromptVars: string[];
};

export const defaultVoicebotConfig = (): VoicebotConfig => ({
  basePrompt: "",
  basePromptVars: [],
  categoryPrompts: [],
});

export const defaultAnalystConfig = (): AnalystConfig => ({
  prompt: "",
  promptVars: [],
});

export const defaultDocumentationConfig = (): DocumentationConfig => ({
  strategy: "template",
  template: "",
  templateVars: [],
  agentPrompt: "",
  agentPromptVars: [],
});

/* ─── Ejecutor (Wave 6) ──────────────────────────────────
   Former "Descripción de campos" subtab, renamed and expanded to 4
   sections: the comment the agent leaves at ARIC marking time, the
   voicebot call (moved here from AnalystConfig - a single agent-facing
   "execution" concept, not a human-review one), the final alert
   documentation (unchanged DocumentationConfig, just relocated), and the
   prompt that personalizes the concept handed to the analyst on escalation. */

export type ExecutorConfig = {
  aricMarking: { prompt: string; promptVars: string[] };
  voicebotCall: VoicebotConfig;
  documentador: DocumentationConfig;
  analystEscalation: { prompt: string; promptVars: string[] };
};

export const defaultExecutorConfig = (): ExecutorConfig => ({
  aricMarking: { prompt: "", promptVars: [] },
  voicebotCall: defaultVoicebotConfig(),
  documentador: defaultDocumentationConfig(),
  analystEscalation: { prompt: "", promptVars: [] },
});

export type SegmentAgentConfig = {
  deterministic: DeterministicConfig;
  profiling: ProfilingConfig;
  rubrics: Rubric[];
  detector: DetectorConfig;
  detectorAdversarial: DetectorAdversarialConfig;
  classification: ClassificationConfig;
  adversarial: AdversarialConfig;
  analyst: AnalystConfig;
  executor: ExecutorConfig;
  activeFields: string[];
  // Trained model (models.functions.ts ModelResponse.id) this segment's
  // agent scores alerts with. The standalone "Modelo" subtab that used to
  // set this was removed (redundant with DetectorConfig.xgboostModelId,
  // which is now the only model picker) - kept here only for wire-format
  // compatibility with the backend's AgentSettings.active_model_id.
  activeModelId: string | null;
};

export type SegmentSettings = {
  enabled: boolean;
  filter: FilterGroup;
  monitoring: SegmentMonitoringConfig;
  agent: SegmentAgentConfig;
  // Tie-break order when multiple enabled segments match the same alert
  // (see backend's ResolveAlertSegmentUseCase) - editable via drag-and-drop
  // on the Segmento tab, per configuration version. Lower sorts first.
  order: number;
};

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  integration_point: "Punto de integración",
  triggered_rule: "Regla disparada",
  event_type: "Tipo de evento",
};

export const emptyFilterGroup = (): FilterGroup => ({
  id: crypto.randomUUID(),
  operator: "and",
  conditions: [],
  groups: [],
});

export const defaultSegmentMonitoring = (): SegmentMonitoringConfig => ({
  samplingIntervalValue: 30,
  samplingIntervalUnit: "minutes",
  samplingCriteria: defaultSamplingCriteria(),
  maxSamples: 200,
  promptClasificacion: "",
  promptClasificacionVars: [],
  promptAnalista: "",
  promptAnalistaVars: [],
  promptMonitoreo: "",
  promptMonitoreoVars: [],
});

export const defaultSegmentAgent = (): SegmentAgentConfig => ({
  deterministic: defaultDeterministicConfig(),
  profiling: defaultProfilingConfig(),
  rubrics: [],
  detector: defaultDetectorConfig(),
  detectorAdversarial: defaultDetectorAdversarialConfig(),
  classification: defaultClassificationConfig(),
  adversarial: defaultAdversarialConfig(),
  analyst: defaultAnalystConfig(),
  executor: defaultExecutorConfig(),
  activeFields: [],
  activeModelId: null,
});

// Fallback only (mock/demo data below, and callers before the channel
// catalog query resolves) - NOT the source of truth for a real draft,
// which builds its segments from the live channel_library_port.py catalog
// via buildSegmentsFromChannels once that query loads (see
// configuracion.tsx). Mirrors the backend's own default_segments()
// fallback in configuration_port.py.
export const defaultSegments = (): Record<SegmentCode, SegmentSettings> => ({
  canales_digitales: {
    enabled: false,
    filter: emptyFilterGroup(),
    monitoring: defaultSegmentMonitoring(),
    agent: defaultSegmentAgent(),
    order: 0,
  },
  tarjetas: {
    enabled: false,
    filter: emptyFilterGroup(),
    monitoring: defaultSegmentMonitoring(),
    agent: defaultSegmentAgent(),
    order: 1,
  },
});

// Builds a fresh draft's segments dict from the active channel catalog,
// in catalog list order - the real "new configuration" path, once
// channels have loaded (see configuracion.tsx's channelsQuery).
export const buildSegmentsFromChannels = (
  channels: { code: string }[],
): Record<SegmentCode, SegmentSettings> =>
  Object.fromEntries(
    channels.map((channel, index) => [
      channel.code,
      {
        enabled: false,
        filter: emptyFilterGroup(),
        monitoring: defaultSegmentMonitoring(),
        agent: defaultSegmentAgent(),
        order: index,
      },
    ]),
  );

export type DayProfile = { id: string; name: string; description: string; hourly: number[] };
export type DistributionValue = { id: string; label: string; pct: number };
export type SamplingCriterion = { id: string; name: string; values: DistributionValue[] };
export type SamplingIntervalUnit = "minutes" | "hours" | "days";
export type TestCleanupPolicy = "manual" | "oldest" | "failed-first";
export type ListMembershipMode = "belongs" | "not_belongs";
// Picks from the resolution-method catalog (see
// ResolutionMethodCatalogManager) - resolutionTag stays denormalized
// alongside the picked entry's id.
export type ShortageBehavior = { resolutionTag: ResolutionTag; resolutionMethodId?: string | null };
export type AnalystCapacity = {
  profiles: DayProfile[];
  defaultProfileId: string;
  dayOverrides: Record<number, string>;
};
export type VersionEntry = {
  version: number;
  // Optional: real backend-sourced versions (see /configuracion) don't
  // carry a testRun (only /monitor's mock data does), and settings are
  // lazy-fetched per version rather than eagerly attached.
  settings?: ConfigSettings;
  testRun?: TestRunIndicators;
  // Sticky - true once this version has ever gone to production. A save
  // based on a version where this is false overwrites it in place instead
  // of minting a new version (see saveVersion in routes/configuracion.tsx).
  everActivated?: boolean;
};

export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  versions: VersionEntry[];
  workingCopy: ConfigSettings;
  dirtyTabs: TabKey[];
};

// Agent/analyst/voicebot on-off, resource sizing and queue handling are NOT
// here: they take effect immediately and live in the backend's
// OperationalSettings singleton (see src/lib/api/operations.functions.ts
// and the "Operación" tab), never in a versioned configuration.
export type ConfigSettings = {
  migrationWindowEnabled: boolean;
  migrationWindowDatetime: string;
  maxInstances: number;
  autoScale: boolean;
  fraudHistoryDbRetentionDays: number;
  fraudHistoryColdStorageRetentionMonths: number;
  maxTestInstances: number;
  maxConcurrentExperiments: number;
  experimentTimeoutMinutes: number;
  maxStoredTestRuns: number;
  testCleanupPolicy: TestCleanupPolicy;
  // The alert input contract applies before channel routing, so it is shared
  // by every segment rather than belonging to an individual agent pipeline.
  segments: Record<SegmentCode, SegmentSettings>;
};

/* ─── Static data ────────────────────────────────────── */

export const initialTaxonomies: Taxonomy[] = [
  {
    id: "tx-1",
    code: "FRD-CARD",
    name: "Fraude con tarjeta",
    description: "Uso no autorizado de tarjeta de crédito/débito.",
    variables: ["Última transacción", "Saldo", "Canal de ingreso", "Tipo de cuenta"],
    examples: [
      "Compra en comercio internacional minutos después de un rechazo por fondos insuficientes.",
    ],
    active: true,
  },
  {
    id: "tx-2",
    code: "PHISH",
    name: "Phishing",
    description: "Suplantación de identidad por canales digitales.",
    variables: ["Correo", "Celular", "Teléfono adicional", "Canal de ingreso"],
    examples: ["Cambio de correo y celular horas antes de una transferencia a un tercero nuevo."],
    active: true,
  },
  {
    id: "tx-3",
    code: "AML",
    name: "Lavado de activos",
    description: "Patrones sospechosos de movimientos.",
    variables: ["Saldo", "Última transacción", "Número de cuenta", "Segmento"],
    examples: [
      "Múltiples transferencias pequeñas entrantes seguidas de un único retiro consolidado.",
    ],
    active: true,
  },
  {
    id: "tx-4",
    code: "ID-THEFT",
    name: "Robo de identidad",
    description: "Apertura o uso de cuentas con identidad ajena.",
    variables: ["Documento", "Fecha de nacimiento", "Dirección", "Canal de ingreso"],
    examples: ["Apertura de cuenta 100% digital con documento reportado como perdido."],
    active: true,
  },
  {
    id: "tx-5",
    code: "MULE",
    name: "Cuenta mula",
    description: "Cuentas usadas como puente para transferencias ilícitas.",
    variables: ["Fecha de alta", "Saldo", "Segmento", "Última transacción"],
    examples: [
      "Cuenta reciente sin historial con flujo de entrada/salida muy superior a su segmento.",
    ],
    active: false,
  },
];

export const initialModusOperandi: ModusOperandi[] = [
  {
    id: "mo-1",
    title: "Vishing con suplantación de soporte",
    narrative:
      "Un tercero llama por teléfono al cliente haciéndose pasar por soporte del banco o de Stripe, lo induce a leer el código OTP recibido por SMS y con ese código autoriza una transferencia inmediata hacia una cuenta mula.",
    taxonomyId: "tx-2",
    evolvedVariables: ["Teléfono adicional", "Celular"],
    active: true,
  },
  {
    id: "mo-2",
    title: "Compra fraccionada con tarjeta clonada",
    narrative:
      "Con los datos de una tarjeta clonada en un cajero externo, el defraudador realiza varias compras pequeñas en comercios en línea distintos en pocos minutos para evitar los topes de validación por monto único.",
    taxonomyId: "tx-1",
    evolvedVariables: ["Número de cuenta"],
    active: true,
  },
];

export const initialFlags: Flag[] = [
  {
    id: "rf-1",
    flagType: "red",
    name: "Transacción nocturna",
    description:
      "Movimiento ejecutado en horario atípico (madrugada), fuera del patrón habitual del cliente.",
    evolvedVariables: ["Última transacción", "Canal de ingreso"],
    modusOperandiIds: ["mo-1", "mo-2"],
  },
  {
    id: "rf-2",
    flagType: "red",
    name: "País distinto al habitual",
    description:
      "Transacción originada desde o hacia un país diferente al de residencia u operación habitual del cliente.",
    evolvedVariables: ["País de origen", "Última transacción"],
    modusOperandiIds: ["mo-2"],
  },
  {
    id: "rf-3",
    flagType: "yellow",
    name: "Monto elevado",
    description:
      "Valor de la transacción muy superior al promedio histórico del cliente para ese canal.",
    evolvedVariables: ["Saldo", "Última transacción", "Tipo de cuenta"],
    modusOperandiIds: ["mo-2"],
  },
  {
    id: "rf-4",
    flagType: "red",
    name: "Cambio de datos de contacto",
    description:
      "Modificación reciente de celular o correo seguida de actividad transaccional inusual.",
    evolvedVariables: ["Celular", "Correo", "Teléfono adicional"],
    modusOperandiIds: ["mo-1"],
  },
];

export const initialSimilarCases: SimilarCase[] = [
  {
    id: "sc-1",
    text: "Cliente reporta llamada de 'soporte' pidiendo el código OTP recibido por SMS; minutos después se registra una transferencia a un tercero nuevo.",
    modusOperandiId: "mo-1",
    taxonomyId: "tx-2",
  },
];

export const defaultSamplingCriteria = (): SamplingCriterion[] => [
  {
    id: "crit-canal",
    name: "Canal",
    values: [
      { id: "v-web", label: "Web", pct: 30 },
      { id: "v-glomo", label: "GLOMO", pct: 40 },
      { id: "v-app", label: "App", pct: 20 },
      { id: "v-callcenter", label: "Call center", pct: 10 },
    ],
  },
  {
    id: "crit-monto",
    name: "Monto",
    values: [
      { id: "v-bajo", label: "Bajo", pct: 50 },
      { id: "v-medio", label: "Medio", pct: 35 },
      { id: "v-alto", label: "Alto", pct: 15 },
    ],
  },
  {
    id: "crit-hora",
    name: "Hora",
    values: [
      { id: "v-diurno", label: "Diurno", pct: 70 },
      { id: "v-nocturno", label: "Nocturno", pct: 30 },
    ],
  },
  {
    id: "crit-resultado",
    name: "Resultado",
    values: [
      { id: "v-aprobado", label: "Aprobado", pct: 60 },
      { id: "v-rechazado", label: "Rechazado", pct: 25 },
      { id: "v-escalado", label: "Escalado", pct: 15 },
    ],
  },
];

export const PROFILE_COLORS = [
  "bg-primary/15 text-primary border-primary/40",
  "bg-warning/15 text-warning border-warning/40",
  "bg-success/15 text-success border-success/40",
  "bg-danger/15 text-danger border-danger/40",
];

export const defaultAnalystCapacity = (): AnalystCapacity => ({
  profiles: [
    {
      id: "regular",
      name: "Día regular",
      description: "Cobertura estándar para días hábiles sin eventos especiales.",
      hourly: Array(24).fill(4),
    },
    {
      id: "pago",
      name: "Día de pago",
      description: "Refuerzo por mayor volumen de alertas en fechas de pago.",
      hourly: Array(24).fill(8),
    },
  ],
  defaultProfileId: "regular",
  dayOverrides: { 15: "pago", 20: "pago", 30: "pago" },
});

export const defaultSettings = (): ConfigSettings => ({
  migrationWindowEnabled: false,
  migrationWindowDatetime: "2000-01-01T02:00",
  maxInstances: 8,
  autoScale: true,
  fraudHistoryDbRetentionDays: 90,
  fraudHistoryColdStorageRetentionMonths: 24,
  maxTestInstances: 4,
  maxConcurrentExperiments: 3,
  experimentTimeoutMinutes: 30,
  maxStoredTestRuns: 20,
  testCleanupPolicy: "oldest",
  segments: {
    ...defaultSegments(),
    canales_digitales: {
      ...defaultSegments().canales_digitales,
      monitoring: {
        ...defaultSegmentMonitoring(),
        promptClasificacion: "",
        promptClasificacionVars: ["CoT (cadena de razonamiento)", "Taxonomía asignada"],
        promptAnalista: "",
        promptAnalistaVars: ["Score de confianza"],
        promptMonitoreo: "",
        promptMonitoreoVars: [],
      },
      agent: {
        ...defaultSegmentAgent(),
        profiling: {
          fieldEnrichment: {
            schema_version: 2,
            mappings: { timezone: "America/Bogota", history: "history" },
            recipes: [
              {
                id: "saldo-riesgo",
                name: "saldo_riesgo",
                description: "",
                enabled: true,
                output_type: "string",
                source: "current",
                path: "Saldo",
                missing: { policy: "missing" },
                steps: [
                  { id: "s1", operation: "number" },
                  {
                    id: "s2",
                    operation: "categorize",
                    rules: [
                      { max: 1_000_000, include_max: true, value: "bajo" },
                      { min: 1_000_000, max: 3_000_000, include_max: true, value: "medio" },
                      { min: 3_000_000, max: 7_000_000, include_max: true, value: "alto" },
                    ],
                    fallback: "altisimo",
                  },
                ],
              },
              {
                id: "canal-ingreso-riesgo",
                name: "canal_ingreso_riesgo",
                description: "",
                enabled: true,
                output_type: "string",
                source: "current",
                path: "Canal de ingreso",
                missing: { policy: "missing" },
                steps: [
                  {
                    id: "s1",
                    operation: "categorize",
                    rules: [
                      { equals: "app", value: "bajo" },
                      { equals: "web", value: "bajo" },
                      { equals: "sucursal", value: "alto" },
                    ],
                    fallback: "medio",
                  },
                ],
              },
            ],
          },
          strategies: [
            {
              ...defaultProfilingStrategy("usuario"),
              mainPrompt: "",
              mainPromptVars: ["Fecha de alta", "Segmento", "Canal de ingreso"],
            },
            {
              ...defaultProfilingStrategy("transaccion"),
              mainPrompt: "",
              mainPromptVars: ["Última transacción", "Canal de ingreso", "País de origen"],
            },
            {
              ...defaultProfilingStrategy("transaccional"),
              mainPrompt: "",
              mainPromptVars: ["Saldo", "Última transacción", "Tipo de cuenta"],
            },
          ],
        },
        detector: {
          ...defaultDetectorConfig(),
          prompt: "",
          promptVars: ["CoT (cadena de razonamiento)"],
        },
        detectorAdversarial: {
          ...defaultDetectorAdversarialConfig(),
          prompt: "",
          promptVars: ["Red flag detectada"],
        },
        classification: {
          ...defaultClassificationConfig(),
          watchlistEnabled: true,
          prompt: "",
          promptVars: ["CoT (cadena de razonamiento)", "Taxonomía asignada"],
        },
        adversarial: {
          ...defaultAdversarialConfig(),
          prompt: "",
          promptVars: ["Red flag detectada"],
          maxCycles: 2,
        },
        analyst: defaultAnalystConfig(),
        executor: {
          aricMarking: { prompt: "", promptVars: [] },
          voicebotCall: {
            basePrompt: "",
            basePromptVars: ["Nombre del cliente", "Última transacción"],
            categoryPrompts: [{ id: "vcp-1", taxonomyId: "tx-1", prompt: "" }],
          },
          documentador: {
            strategy: "template",
            template: "",
            templateVars: ["Taxonomía asignada", "Resultado final"],
            agentPrompt: "",
            agentPromptVars: [],
          },
          analystEscalation: { prompt: "", promptVars: [] },
        },
        activeFields: ["Altamira", "Documento", "Celular", "Nombre del cliente", "Saldo"],
        activeModelId: null,
      },
    },
  },
});

export const versionsFor = (configId: string): VersionEntry[] =>
  TEST_RUNS.filter((r) => r.configId === configId)
    .sort((a, b) => a.version - b.version)
    .map((run) => ({ version: run.version, settings: defaultSettings(), testRun: run }));

export const RUNNING_DEFAULT = { configId: "cfg-prod", version: 3 };

export const INITIAL_CONFIGS: AgentConfig[] = [
  (() => {
    const versions = versionsFor("cfg-prod");
    return {
      id: "cfg-prod",
      name: "Producción",
      description: "Agente activo con umbrales estrictos y todas las taxonomías habilitadas.",
      versions,
      workingCopy: { ...versions[versions.length - 1].settings! },
      dirtyTabs: [],
    };
  })(),
  (() => {
    const versions = versionsFor("cfg-staging");
    const draft = { ...versions[versions.length - 1].settings!, maxInstances: 12 };
    return {
      id: "cfg-staging",
      name: "Staging",
      description: "Ambiente de pruebas con taxonomías experimentales y umbral relajado.",
      versions,
      workingCopy: draft,
      dirtyTabs: ["infra", "ops"] as TabKey[],
    };
  })(),
  {
    id: "cfg-canary",
    name: "Canario 2%",
    description: "Despliegue progresivo al 2% del tráfico real para validación.",
    versions: [],
    workingCopy: defaultSettings(),
    dirtyTabs: [],
  },
];

/** A config has edits pending validation — the only ones ready to run through Testing. */
export const isReadyToTest = (c: AgentConfig): boolean => c.dirtyTabs.length > 0;
