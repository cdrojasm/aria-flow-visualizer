/* ─── Shared agent-config data, keyed by config id ──────────────────── */
/* Seeded here so /configuracion (editor) and /testing (test runner)      */
/* read the same configs/versions without a real backend.                */

import { TEST_RUNS, type TestRunIndicators } from "./testRuns";

/* ─── Types ──────────────────────────────────────────── */

export type Taxonomy = { id: string; code: string; name: string; description: string; variables: string[]; examples: string[]; active: boolean };
export type ModusOperandi = { id: string; title: string; narrative: string; taxonomyId: string; evolvedVariables: string[]; active: boolean };

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
  | "test"
  | "segmento"
  | "segmentoAgente"
  | "segmentoMuestreo"
  | "segmentoEvaluacion";

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

export type SegmentCode = "canales_digitales" | "tarjetas";

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
   Fixed 3-step chain (usuario -> transaccion -> transaccional). Each
   strategy's producedVariables feed the variable pool of every strategy
   after it - mirrors backend's ProfilingConfig/ProfilingStrategy. */

export type FieldKind = "cuantizable" | "categorico";

// Cuantizable fields are validated by intervalo (range) or comparativa
// (operator + value); categorico fields by igualdad/no_igualdad (single
// value) or pertenencia/no_pertenencia (set membership). Each criterion
// carries its own output (e.g. a risk label) - mirrors backend's
// FieldCriterion/CriteriaMode (configuration_port.py).
export type CriteriaMode = "intervalo" | "comparativa" | "igualdad" | "no_igualdad" | "pertenencia" | "no_pertenencia";
export type ComparisonOperator = ">" | ">=" | "<" | "<=";
export type FieldCriterion = {
  id: string;
  mode: CriteriaMode;
  output: string;
  minValue?: number;
  maxValue?: number;
  operator?: ComparisonOperator;
  numericValue?: number;
  textValue?: string;
  values: string[];
};
export type FieldCategorization = { field: string; kind: FieldKind; criteria: FieldCriterion[] };

export const CRITERIA_MODES_BY_KIND: Record<FieldKind, CriteriaMode[]> = {
  cuantizable: ["intervalo", "comparativa"],
  categorico: ["igualdad", "no_igualdad", "pertenencia", "no_pertenencia"],
};

export const CRITERIA_MODE_LABELS: Record<CriteriaMode, string> = {
  intervalo: "Intervalo",
  comparativa: "Comparativa",
  igualdad: "Igualdad",
  no_igualdad: "No igualdad",
  pertenencia: "Pertenencia",
  no_pertenencia: "No pertenencia",
};

export const COMPARISON_OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  ">": "Mayor que",
  ">=": "Mayor o igual que",
  "<": "Menor que",
  "<=": "Menor o igual que",
};

export const COMPARISON_OPERATORS: ComparisonOperator[] = [">", ">=", "<", "<="];

export type ProfilingStrategyKey = "usuario" | "transaccion" | "transaccional";
export type ProfilingStrategy = {
  key: ProfilingStrategyKey;
  mainPrompt: string;
  mainPromptVars: string[];
  categorizationPrompt: string;
  categorizationPromptVars: string[];
  producedVariables: string[];
  usePandasHistoryMcp: boolean;
};
export type ProfilingConfig = {
  fieldCategorizations: FieldCategorization[];
  strategies: ProfilingStrategy[];
};

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
  categorizationPrompt: "",
  categorizationPromptVars: [],
  producedVariables: [],
  usePandasHistoryMcp: false,
});

export const defaultProfilingConfig = (): ProfilingConfig => ({
  fieldCategorizations: [],
  strategies: PROFILING_STRATEGY_KEYS.map(defaultProfilingStrategy),
});

/* ─── Classification + Adversarial (Phase 4) ────────────
   Mirrors backend's ClassificationConfig/AdversarialConfig. Adversarial
   has no tool picker of its own - it reuses whichever tools Classification
   already has configured (shown read-only in its section). */

export type VectorStoreTool = "taxonomia" | "modus_operandi" | "similar_case" | "red_flag" | "yellow_flag";
export type BuiltInTool = "blacklist" | "whitelist" | "calculator";

export const VECTOR_STORE_TOOL_LABELS: Record<VectorStoreTool, string> = {
  taxonomia: "Taxonomías",
  modus_operandi: "Modus operandi",
  similar_case: "Casos similares",
  red_flag: "Red flags",
  yellow_flag: "Yellow flags",
};

export const BUILT_IN_TOOL_LABELS: Record<BuiltInTool, string> = {
  blacklist: "Lista negra",
  whitelist: "Lista blanca",
  calculator: "Calculadora",
};

export const VECTOR_STORE_TOOLS: VectorStoreTool[] = ["taxonomia", "modus_operandi", "similar_case", "red_flag", "yellow_flag"];
export const BUILT_IN_TOOLS: BuiltInTool[] = ["blacklist", "whitelist", "calculator"];

export type ClassificationConfig = {
  vectorStoreTools: VectorStoreTool[];
  builtInTools: BuiltInTool[];
  prompt: string;
  promptVars: string[];
};

export type AdversarialConfig = {
  prompt: string;
  promptVars: string[];
  maxCycles: number;
  feedFeedbackToClassification: boolean;
};

export const defaultClassificationConfig = (): ClassificationConfig => ({
  vectorStoreTools: [],
  builtInTools: [],
  prompt: "",
  promptVars: [],
});

export const defaultAdversarialConfig = (): AdversarialConfig => ({
  prompt: "",
  promptVars: [],
  maxCycles: 1,
  feedFeedbackToClassification: true,
});

/* ─── Analista + Documentación (Phase 5) ────────────────
   Mirrors backend's AnalystConfig/DocumentationConfig. AnalystPlaybook is
   distinct from the pre-existing runtime FraudPlaybookRecord concept - see
   backend's configuration_port.py for the disambiguation note. */

export type ResolutionTag = "scale_to_analyst" | "send_to_voicebot" | "handle_by_aria";

export const RESOLUTION_TAG_LABELS: Record<ResolutionTag, string> = {
  scale_to_analyst: "Escalar a analista",
  send_to_voicebot: "Enviar a voicebot",
  handle_by_aria: "Resolver con ARIA",
};

export type AnalystPlaybook = {
  id: string;
  name: string;
  strategy: string;
  resolutionTag: ResolutionTag;
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

export type AnalystConfig = {
  playbooks: AnalystPlaybook[];
  voicebot: VoicebotConfig;
};

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
  playbooks: [],
  voicebot: defaultVoicebotConfig(),
});

export const defaultDocumentationConfig = (): DocumentationConfig => ({
  strategy: "template",
  template: "",
  templateVars: [],
  agentPrompt: "",
  agentPromptVars: [],
});

export type SegmentAgentConfig = {
  profiling: ProfilingConfig;
  classification: ClassificationConfig;
  adversarial: AdversarialConfig;
  analyst: AnalystConfig;
  documentation: DocumentationConfig;
  taxonomies: Taxonomy[];
  modusOperandi: ModusOperandi[];
  flags: Flag[];
  similarCases: SimilarCase[];
  activeFields: string[];
};

export type SegmentSettings = {
  enabled: boolean;
  filter: FilterGroup;
  monitoring: SegmentMonitoringConfig;
  agent: SegmentAgentConfig;
};

export const SEGMENT_LABELS: Record<SegmentCode, string> = {
  canales_digitales: "Canales Digitales",
  tarjetas: "Tarjeta",
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
  profiling: defaultProfilingConfig(),
  classification: defaultClassificationConfig(),
  adversarial: defaultAdversarialConfig(),
  analyst: defaultAnalystConfig(),
  documentation: defaultDocumentationConfig(),
  taxonomies: [],
  modusOperandi: [],
  flags: [],
  similarCases: [],
  activeFields: [],
});

export const defaultSegments = (): Record<SegmentCode, SegmentSettings> => ({
  canales_digitales: {
    enabled: false,
    filter: emptyFilterGroup(),
    monitoring: defaultSegmentMonitoring(),
    agent: defaultSegmentAgent(),
  },
  tarjetas: {
    enabled: false,
    filter: emptyFilterGroup(),
    monitoring: defaultSegmentMonitoring(),
    agent: defaultSegmentAgent(),
  },
});

export type DayProfile = { id: string; name: string; description: string; hourly: number[] };
export type DistributionValue = { id: string; label: string; pct: number };
export type SamplingCriterion = { id: string; name: string; values: DistributionValue[] };
export type SamplingIntervalUnit = "minutes" | "hours" | "days";
export type TestCleanupPolicy = "manual" | "oldest" | "failed-first";
export type ShortageAction = "block-soft" | "block-hard" | "pass" | "move-to-analyst" | "move-to-voicebot";
export type ShortageBehavior = { action: ShortageAction };
export type AnalystCapacity = {
  profiles: DayProfile[];
  defaultProfileId: string;
  dayOverrides: Record<number, string>;
};
export type DraftResult = { accuracy: number; samples: number; passed: boolean };

export type VersionEntry = {
  version: number;
  // Optional: real backend-sourced versions (see /configuracion) don't
  // carry a testRun (that's a local-only validation-cycle simulation), and
  // settings are lazy-fetched per version rather than eagerly attached.
  settings?: ConfigSettings;
  testRun?: TestRunIndicators;
};

export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  versions: VersionEntry[];
  workingCopy: ConfigSettings;
  dirtyTabs: TabKey[];
  testState: "idle" | "testing";
  lastTestResult?: DraftResult;
};

export type ConfigSettings = {
  agentEnabled: boolean;
  migrationWindowEnabled: boolean;
  migrationWindowHour: string;
  analystEscalationEnabled: boolean;
  voicebotEscalationEnabled: boolean;
  maxInstances: number;
  autoScale: boolean;
  fraudHistoryDbRetentionDays: number;
  fraudHistoryColdStorageRetentionMonths: number;
  voicebotMaxConcurrentCalls: number;
  analystCapacity: AnalystCapacity;
  queueMaxLifetimeValue: number;
  queueMaxLifetimeUnit: SamplingIntervalUnit;
  queueDiscardAmountThreshold: number;
  queueRuleFilterEnabled: boolean;
  queueAllowedTriggeredRules: string[];
  voicebotShortageBehavior: ShortageBehavior;
  analystShortageBehavior: ShortageBehavior;
  maxTestInstances: number;
  maxConcurrentExperiments: number;
  experimentTimeoutMinutes: number;
  maxStoredTestRuns: number;
  testCleanupPolicy: TestCleanupPolicy;
  segments: Record<SegmentCode, SegmentSettings>;
};

/* ─── Static data ────────────────────────────────────── */

export const initialTaxonomies: Taxonomy[] = [
  { id: "tx-1", code: "FRD-CARD", name: "Fraude con tarjeta", description: "Uso no autorizado de tarjeta de crédito/débito.", variables: ["Última transacción", "Saldo", "Canal de ingreso", "Tipo de cuenta"], examples: ["Compra en comercio internacional minutos después de un rechazo por fondos insuficientes."], active: true },
  { id: "tx-2", code: "PHISH", name: "Phishing", description: "Suplantación de identidad por canales digitales.", variables: ["Correo", "Celular", "Teléfono adicional", "Canal de ingreso"], examples: ["Cambio de correo y celular horas antes de una transferencia a un tercero nuevo."], active: true },
  { id: "tx-3", code: "AML", name: "Lavado de activos", description: "Patrones sospechosos de movimientos.", variables: ["Saldo", "Última transacción", "Número de cuenta", "Segmento"], examples: ["Múltiples transferencias pequeñas entrantes seguidas de un único retiro consolidado."], active: true },
  { id: "tx-4", code: "ID-THEFT", name: "Robo de identidad", description: "Apertura o uso de cuentas con identidad ajena.", variables: ["Documento", "Fecha de nacimiento", "Dirección", "Canal de ingreso"], examples: ["Apertura de cuenta 100% digital con documento reportado como perdido."], active: true },
  { id: "tx-5", code: "MULE", name: "Cuenta mula", description: "Cuentas usadas como puente para transferencias ilícitas.", variables: ["Fecha de alta", "Saldo", "Segmento", "Última transacción"], examples: ["Cuenta reciente sin historial con flujo de entrada/salida muy superior a su segmento."], active: false },
];

export const initialModusOperandi: ModusOperandi[] = [
  { id: "mo-1", title: "Vishing con suplantación de soporte", narrative: "Un tercero llama por teléfono al cliente haciéndose pasar por soporte del banco o de Stripe, lo induce a leer el código OTP recibido por SMS y con ese código autoriza una transferencia inmediata hacia una cuenta mula.", taxonomyId: "tx-2", evolvedVariables: ["Teléfono adicional", "Celular"], active: true },
  { id: "mo-2", title: "Compra fraccionada con tarjeta clonada", narrative: "Con los datos de una tarjeta clonada en un cajero externo, el defraudador realiza varias compras pequeñas en comercios en línea distintos en pocos minutos para evitar los topes de validación por monto único.", taxonomyId: "tx-1", evolvedVariables: ["Número de cuenta"], active: true },
];

export const initialFlags: Flag[] = [
  { id: "rf-1", flagType: "red", name: "Transacción nocturna", description: "Movimiento ejecutado en horario atípico (madrugada), fuera del patrón habitual del cliente.", evolvedVariables: ["Última transacción", "Canal de ingreso"], modusOperandiIds: ["mo-1", "mo-2"] },
  { id: "rf-2", flagType: "red", name: "País distinto al habitual", description: "Transacción originada desde o hacia un país diferente al de residencia u operación habitual del cliente.", evolvedVariables: ["País de origen", "Última transacción"], modusOperandiIds: ["mo-2"] },
  { id: "rf-3", flagType: "yellow", name: "Monto elevado", description: "Valor de la transacción muy superior al promedio histórico del cliente para ese canal.", evolvedVariables: ["Saldo", "Última transacción", "Tipo de cuenta"], modusOperandiIds: ["mo-2"] },
  { id: "rf-4", flagType: "red", name: "Cambio de datos de contacto", description: "Modificación reciente de celular o correo seguida de actividad transaccional inusual.", evolvedVariables: ["Celular", "Correo", "Teléfono adicional"], modusOperandiIds: ["mo-1"] },
];

export const initialSimilarCases: SimilarCase[] = [
  { id: "sc-1", text: "Cliente reporta llamada de 'soporte' pidiendo el código OTP recibido por SMS; minutos después se registra una transferencia a un tercero nuevo.", modusOperandiId: "mo-1", taxonomyId: "tx-2" },
];

export const ALL_VARIABLES = [
  "Altamira", "Documento", "Celular", "Nombre del cliente", "Teléfono adicional",
  "Segmento", "Fecha de alta", "Correo", "Saldo", "Dirección", "Fecha de nacimiento",
  "Segmento empresa", "País de origen", "Canal de ingreso", "Tipo de cuenta",
  "Última transacción", "Número de cuenta", "Oficina", "Producto",
];

export const EVALUATION_VARIABLES = [
  "CoT (cadena de razonamiento)", "Variables de entrada", "Score de confianza",
  "Taxonomía asignada", "Red flag detectada", "Prompt utilizado",
  "Latencia de respuesta", "Resultado final",
];

export const defaultSamplingCriteria = (): SamplingCriterion[] => [
  { id: "crit-canal", name: "Canal", values: [
    { id: "v-web", label: "Web", pct: 30 },
    { id: "v-glomo", label: "GLOMO", pct: 40 },
    { id: "v-app", label: "App", pct: 20 },
    { id: "v-callcenter", label: "Call center", pct: 10 },
  ] },
  { id: "crit-monto", name: "Monto", values: [
    { id: "v-bajo", label: "Bajo", pct: 50 },
    { id: "v-medio", label: "Medio", pct: 35 },
    { id: "v-alto", label: "Alto", pct: 15 },
  ] },
  { id: "crit-hora", name: "Hora", values: [
    { id: "v-diurno", label: "Diurno", pct: 70 },
    { id: "v-nocturno", label: "Nocturno", pct: 30 },
  ] },
  { id: "crit-resultado", name: "Resultado", values: [
    { id: "v-aprobado", label: "Aprobado", pct: 60 },
    { id: "v-rechazado", label: "Rechazado", pct: 25 },
    { id: "v-escalado", label: "Escalado", pct: 15 },
  ] },
];

export const PROFILE_COLORS = [
  "bg-primary/15 text-primary border-primary/40",
  "bg-warning/15 text-warning border-warning/40",
  "bg-success/15 text-success border-success/40",
  "bg-danger/15 text-danger border-danger/40",
];

export const defaultAnalystCapacity = (): AnalystCapacity => ({
  profiles: [
    { id: "regular", name: "Día regular", description: "Cobertura estándar para días hábiles sin eventos especiales.", hourly: Array(24).fill(4) },
    { id: "pago", name: "Día de pago", description: "Refuerzo por mayor volumen de alertas en fechas de pago.", hourly: Array(24).fill(8) },
  ],
  defaultProfileId: "regular",
  dayOverrides: { 15: "pago", 20: "pago", 30: "pago" },
});

export const defaultSettings = (): ConfigSettings => ({
  agentEnabled: true,
  migrationWindowEnabled: false,
  migrationWindowHour: "02:00",
  analystEscalationEnabled: true,
  voicebotEscalationEnabled: true,
  maxInstances: 8,
  autoScale: true,
  fraudHistoryDbRetentionDays: 90,
  fraudHistoryColdStorageRetentionMonths: 24,
  voicebotMaxConcurrentCalls: 40,
  analystCapacity: defaultAnalystCapacity(),
  queueMaxLifetimeValue: 60,
  queueMaxLifetimeUnit: "minutes",
  queueDiscardAmountThreshold: 0,
  queueRuleFilterEnabled: false,
  queueAllowedTriggeredRules: [],
  voicebotShortageBehavior: { action: "block-soft" },
  analystShortageBehavior: { action: "block-soft" },
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
        profiling: {
          fieldCategorizations: [
            {
              field: "Saldo",
              kind: "cuantizable",
              criteria: [
                { id: "crit-saldo-1", mode: "intervalo", output: "bajo", minValue: 1, maxValue: 1_000_000, values: [] },
                { id: "crit-saldo-2", mode: "intervalo", output: "medio", minValue: 1_000_001, maxValue: 3_000_000, values: [] },
                { id: "crit-saldo-3", mode: "intervalo", output: "alto", minValue: 3_000_001, maxValue: 7_000_000, values: [] },
                { id: "crit-saldo-4", mode: "comparativa", output: "altisimo", operator: ">", numericValue: 7_000_000, values: [] },
              ],
            },
            {
              field: "Canal de ingreso",
              kind: "categorico",
              criteria: [
                { id: "crit-canal-1", mode: "pertenencia", output: "bajo", values: ["app", "web"] },
                { id: "crit-canal-2", mode: "igualdad", output: "alto", textValue: "sucursal", values: [] },
              ],
            },
          ],
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
        classification: {
          ...defaultClassificationConfig(),
          vectorStoreTools: ["taxonomia", "modus_operandi", "red_flag"],
          builtInTools: ["blacklist"],
          prompt: "",
          promptVars: ["CoT (cadena de razonamiento)", "Taxonomía asignada"],
        },
        adversarial: {
          ...defaultAdversarialConfig(),
          prompt: "",
          promptVars: ["Red flag detectada"],
          maxCycles: 2,
        },
        analyst: {
          playbooks: [
            {
              id: "pb-1",
              name: "Fraude confirmado con evidencia clara",
              strategy: "Escalar directamente al analista con el resumen del caso y las red flags detectadas.",
              resolutionTag: "scale_to_analyst",
            },
            {
              id: "pb-2",
              name: "Duda razonable sobre la transacción",
              strategy: "Enviar al voicebot para confirmar la operación con el cliente antes de escalar.",
              resolutionTag: "send_to_voicebot",
            },
          ],
          voicebot: {
            basePrompt: "",
            basePromptVars: ["Nombre del cliente", "Última transacción"],
            categoryPrompts: [
              { id: "vcp-1", taxonomyId: "tx-1", prompt: "" },
            ],
          },
        },
        documentation: {
          strategy: "template",
          template: "",
          templateVars: ["Taxonomía asignada", "Resultado final"],
          agentPrompt: "",
          agentPromptVars: [],
        },
        taxonomies: initialTaxonomies.map((t) => ({ ...t, variables: [...t.variables], examples: [...t.examples] })),
        modusOperandi: initialModusOperandi.map((m) => ({ ...m, evolvedVariables: [...m.evolvedVariables] })),
        flags: initialFlags.map((f) => ({ ...f, evolvedVariables: [...f.evolvedVariables], modusOperandiIds: [...f.modusOperandiIds] })),
        similarCases: initialSimilarCases.map((s) => ({ ...s })),
        activeFields: ["Altamira", "Documento", "Celular", "Nombre del cliente", "Saldo"],
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
    return { id: "cfg-prod", name: "Producción", description: "Agente activo con umbrales estrictos y todas las taxonomías habilitadas.", versions, workingCopy: { ...versions[versions.length - 1].settings! }, dirtyTabs: [], testState: "idle" as const };
  })(),
  (() => {
    const versions = versionsFor("cfg-staging");
    const draft = { ...versions[versions.length - 1].settings!, maxInstances: 12 };
    return { id: "cfg-staging", name: "Staging", description: "Ambiente de pruebas con taxonomías experimentales y umbral relajado.", versions, workingCopy: draft, dirtyTabs: ["infra", "ops"] as TabKey[], testState: "idle" as const };
  })(),
  { id: "cfg-canary", name: "Canario 2%", description: "Despliegue progresivo al 2% del tráfico real para validación.", versions: [], workingCopy: defaultSettings(), dirtyTabs: [], testState: "idle" as const },
];

/** A config has edits pending validation — the only ones ready to run through Testing. */
export const isReadyToTest = (c: AgentConfig): boolean => c.dirtyTabs.length > 0;
