/* ─── Shared agent-config data, keyed by config id ──────────────────── */
/* Seeded here so /configuracion (editor) and /testing (test runner)      */
/* read the same configs/versions without a real backend.                */

import { TEST_RUNS, type TestRunIndicators } from "./testRuns";

/* ─── Types ──────────────────────────────────────────── */

export type RedFlag = { id: string; name: string; description: string; variables: string[] };
export type Taxonomy = { id: string; code: string; name: string; description: string; variables: string[]; examples: string[]; active: boolean };
export type ModusOperandi = { id: string; title: string; narrative: string; taxonomyId: string; redFlagId: string | null };

export type TabKey = "general" | "infra" | "ops" | "monitoring" | "agent" | "test";

export type DayProfile = { id: string; name: string; description: string; hourly: number[] };
export type DistributionValue = { id: string; label: string; pct: number };
export type SamplingCriterion = { id: string; name: string; values: DistributionValue[] };
export type SamplingIntervalUnit = "minutes" | "hours" | "days";
export type TestCleanupPolicy = "manual" | "oldest" | "failed-first";
export type ShortageAction = "block-soft" | "custom";
export type ShortageBehavior = { action: ShortageAction; customText: string };
export type AnalystCapacity = {
  profiles: DayProfile[];
  defaultProfileId: string;
  dayOverrides: Record<number, string>;
};
export type DraftResult = { accuracy: number; samples: number; passed: boolean };

export type VersionEntry = {
  version: number;
  settings: ConfigSettings;
  testRun: TestRunIndicators;
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
  taxonomies: Taxonomy[];
  redFlags: RedFlag[];
  modusOperandi: ModusOperandi[];
  activeFields: string[];
  agentEnabled: boolean;
  migrationWindowEnabled: boolean;
  migrationWindowHour: string;
  maxInstances: number;
  autoScale: boolean;
  perfilUsuario: string;
  perfilUsuarioVars: string[];
  perfilTransaccion: string;
  perfilTransaccionVars: string[];
  perfilTransaccional: string;
  perfilTransaccionalVars: string[];
  samplingIntervalValue: number;
  samplingIntervalUnit: SamplingIntervalUnit;
  samplingCriteria: SamplingCriterion[];
  maxSamples: number;
  promptClasificacion: string;
  promptAnalista: string;
  promptMonitoreo: string;
  evaluationVariables: string[];
  voicebotMaxConcurrentCalls: number;
  analystCapacity: AnalystCapacity;
  queueMaxLifetimeValue: number;
  queueMaxLifetimeUnit: SamplingIntervalUnit;
  voicebotShortageBehavior: ShortageBehavior;
  analystShortageBehavior: ShortageBehavior;
  maxTestInstances: number;
  maxConcurrentExperiments: number;
  experimentTimeoutMinutes: number;
  maxStoredTestRuns: number;
  testCleanupPolicy: TestCleanupPolicy;
};

/* ─── Static data ────────────────────────────────────── */

export const initialTaxonomies: Taxonomy[] = [
  { id: "tx-1", code: "FRD-CARD", name: "Fraude con tarjeta", description: "Uso no autorizado de tarjeta de crédito/débito.", variables: ["Última transacción", "Saldo", "Canal de ingreso", "Tipo de cuenta"], examples: ["Compra en comercio internacional minutos después de un rechazo por fondos insuficientes."], active: true },
  { id: "tx-2", code: "PHISH", name: "Phishing", description: "Suplantación de identidad por canales digitales.", variables: ["Correo", "Celular", "Teléfono adicional", "Canal de ingreso"], examples: ["Cambio de correo y celular horas antes de una transferencia a un tercero nuevo."], active: true },
  { id: "tx-3", code: "AML", name: "Lavado de activos", description: "Patrones sospechosos de movimientos.", variables: ["Saldo", "Última transacción", "Número de cuenta", "Segmento"], examples: ["Múltiples transferencias pequeñas entrantes seguidas de un único retiro consolidado."], active: true },
  { id: "tx-4", code: "ID-THEFT", name: "Robo de identidad", description: "Apertura o uso de cuentas con identidad ajena.", variables: ["Documento", "Fecha de nacimiento", "Dirección", "Canal de ingreso"], examples: ["Apertura de cuenta 100% digital con documento reportado como perdido."], active: true },
  { id: "tx-5", code: "MULE", name: "Cuenta mula", description: "Cuentas usadas como puente para transferencias ilícitas.", variables: ["Fecha de alta", "Saldo", "Segmento", "Última transacción"], examples: ["Cuenta reciente sin historial con flujo de entrada/salida muy superior a su segmento."], active: false },
];

export const initialRedFlags: RedFlag[] = [
  { id: "rf-1", name: "Transacción nocturna", description: "Movimiento ejecutado en horario atípico (madrugada), fuera del patrón habitual del cliente.", variables: ["Última transacción", "Canal de ingreso"] },
  { id: "rf-2", name: "País distinto al habitual", description: "Transacción originada desde o hacia un país diferente al de residencia u operación habitual del cliente.", variables: ["País de origen", "Última transacción"] },
  { id: "rf-3", name: "Monto elevado", description: "Valor de la transacción muy superior al promedio histórico del cliente para ese canal.", variables: ["Saldo", "Última transacción", "Tipo de cuenta"] },
  { id: "rf-4", name: "Cambio de datos de contacto", description: "Modificación reciente de celular o correo seguida de actividad transaccional inusual.", variables: ["Celular", "Correo", "Teléfono adicional"] },
];

export const initialModusOperandi: ModusOperandi[] = [
  { id: "mo-1", title: "Vishing con suplantación de soporte", narrative: "Un tercero llama por teléfono al cliente haciéndose pasar por soporte del banco o de Stripe, lo induce a leer el código OTP recibido por SMS y con ese código autoriza una transferencia inmediata hacia una cuenta mula.", taxonomyId: "tx-2", redFlagId: "rf-4" },
  { id: "mo-2", title: "Compra fraccionada con tarjeta clonada", narrative: "Con los datos de una tarjeta clonada en un cajero externo, el defraudador realiza varias compras pequeñas en comercios en línea distintos en pocos minutos para evitar los topes de validación por monto único.", taxonomyId: "tx-1", redFlagId: "rf-3" },
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
  taxonomies: initialTaxonomies.map((t) => ({ ...t, variables: [...t.variables], examples: [...t.examples] })),
  redFlags: initialRedFlags.map((r) => ({ ...r, variables: [...r.variables] })),
  modusOperandi: initialModusOperandi.map((m) => ({ ...m })),
  activeFields: ["Altamira", "Documento", "Celular", "Nombre del cliente", "Saldo"],
  agentEnabled: true,
  migrationWindowEnabled: false,
  migrationWindowHour: "02:00",
  maxInstances: 8,
  autoScale: true,
  perfilUsuario: "",
  perfilUsuarioVars: ["Fecha de alta", "Segmento", "Canal de ingreso"],
  perfilTransaccion: "",
  perfilTransaccionVars: ["Última transacción", "Canal de ingreso", "País de origen"],
  perfilTransaccional: "",
  perfilTransaccionalVars: ["Saldo", "Última transacción", "Tipo de cuenta"],
  samplingIntervalValue: 30,
  samplingIntervalUnit: "minutes",
  samplingCriteria: defaultSamplingCriteria(),
  maxSamples: 200,
  promptClasificacion: "",
  promptAnalista: "",
  promptMonitoreo: "",
  evaluationVariables: ["CoT (cadena de razonamiento)", "Taxonomía asignada", "Score de confianza"],
  voicebotMaxConcurrentCalls: 40,
  analystCapacity: defaultAnalystCapacity(),
  queueMaxLifetimeValue: 60,
  queueMaxLifetimeUnit: "minutes",
  voicebotShortageBehavior: { action: "block-soft", customText: "" },
  analystShortageBehavior: { action: "block-soft", customText: "" },
  maxTestInstances: 4,
  maxConcurrentExperiments: 3,
  experimentTimeoutMinutes: 30,
  maxStoredTestRuns: 20,
  testCleanupPolicy: "oldest",
});

export const versionsFor = (configId: string): VersionEntry[] =>
  TEST_RUNS.filter((r) => r.configId === configId)
    .sort((a, b) => a.version - b.version)
    .map((run) => ({ version: run.version, settings: defaultSettings(), testRun: run }));

export const RUNNING_DEFAULT = { configId: "cfg-prod", version: 3 };

export const INITIAL_CONFIGS: AgentConfig[] = [
  (() => {
    const versions = versionsFor("cfg-prod");
    return { id: "cfg-prod", name: "Producción", description: "Agente activo con umbrales estrictos y todas las taxonomías habilitadas.", versions, workingCopy: { ...versions[versions.length - 1].settings }, dirtyTabs: [], testState: "idle" as const };
  })(),
  (() => {
    const versions = versionsFor("cfg-staging");
    const draft = { ...versions[versions.length - 1].settings, maxInstances: 12, maxSamples: 80 };
    return { id: "cfg-staging", name: "Staging", description: "Ambiente de pruebas con taxonomías experimentales y umbral relajado.", versions, workingCopy: draft, dirtyTabs: ["infra", "ops"] as TabKey[], testState: "idle" as const };
  })(),
  { id: "cfg-canary", name: "Canario 2%", description: "Despliegue progresivo al 2% del tráfico real para validación.", versions: [], workingCopy: defaultSettings(), dirtyTabs: [], testState: "idle" as const },
];

/** A config has edits pending validation — the only ones ready to run through Testing. */
export const isReadyToTest = (c: AgentConfig): boolean => c.dirtyTabs.length > 0;
