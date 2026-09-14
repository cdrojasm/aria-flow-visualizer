import { apiFetch } from "./client";
export type RecipeStep = {
  id: string;
  operation: string;
  enabled?: boolean;
  path?: string;
  value?: unknown;
  current_path?: string;
  match?: "all" | "any";
  conditions?: {
    /** Omit this for primitive list elements; provide it for object fields. */
    path?: string;
    operator: string;
    value?: unknown;
    current_path?: string;
    value_type?: "auto" | "datetime";
    offset_seconds?: number;
  }[];
  rules?: {
    min?: number;
    max?: number;
    include_min?: boolean;
    include_max?: boolean;
    equals?: unknown;
    value: unknown;
  }[];
  fallback?: unknown;
  delimiter?: string;
  truthy_values?: unknown[];
  treat_blank_string_as_missing?: boolean;
};
export type Recipe = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  output_type?: "number" | "string" | "boolean";
  source: "current" | "history";
  path?: string;
  window_seconds?: number;
  missing: { policy: "missing" | "constant" | "error"; value?: unknown };
  steps: RecipeStep[];
};
export type FeatureConfiguration = {
  schema_version: 1 | 2;
  mappings: {
    reference_time?: string;
    history?: string;
    history_time?: string;
    entity?: string;
    history_entity?: string;
    timezone: string;
  };
  recipes: Recipe[];
};
export type FeatureResult = {
  id: string;
  name: string;
  value: unknown;
  status: string;
  error?: string | null;
  trace: { step_id: string; operation: string; value: unknown; skipped?: boolean }[];
  history?: {
    included: number[];
    excluded: { index: number; reason: string }[];
  };
};
export type Preview = {
  rows: { values: Record<string, unknown>; features: FeatureResult[] }[];
};
export type QueuedPreview = { task_id: string; status: "PENDING" };
export type PreviewStatus = {
  task_id: string;
  status: "PENDING" | "READY" | "FAILED";
  result?: Preview;
  error?: string | null;
};
export type FeatureTemplate = {
  id: string;
  name: string;
  description: string;
  configuration: FeatureConfiguration;
};
// consumes/produces mirror the recipe engine's step-chain type inference
// (src/domain/models/feature_recipe.py::_OPERATION_TYPES on the backend) -
// "array" means "requires/yields an array", "unknown" means the produced
// type can't be determined statically (e.g. after select/categorize).
// skips_on_missing_input mirrors _PASSTHROUGH_ON_MISSING_OPS: true means the
// step is a no-op whenever its input is missing/null unless a fill_missing
// step runs earlier in the chain.
export type FeatureOperationCapability = {
  id: string;
  consumes: "array" | "scalar";
  produces: "array" | "scalar" | "unknown";
  skips_on_missing_input?: boolean;
};
export type FeatureCapabilities = {
  operations: FeatureOperationCapability[];
  output_types: string[];
};
export const getFeatureCapabilities = () =>
  apiFetch<FeatureCapabilities>("/api/v0/models/features/operations");
export const previewFeatures = (
  configuration: FeatureConfiguration,
  rows: Record<string, unknown>[],
  targetField?: string,
) =>
  apiFetch<QueuedPreview>("/api/v0/models/features/preview", {
    method: "POST",
    body: JSON.stringify({
      configuration,
      rows,
      target_field: targetField || undefined,
    }),
  });
export const getPreviewFeatures = (taskId: string) =>
  apiFetch<PreviewStatus>(`/api/v0/models/features/preview/${encodeURIComponent(taskId)}`);
export const getFeatureTemplates = () =>
  apiFetch<FeatureTemplate[]>("/api/v0/models/feature-templates");
export const saveFeatureTemplate = (name: string, configuration: FeatureConfiguration) =>
  apiFetch<FeatureTemplate>("/api/v0/models/feature-templates", {
    method: "POST",
    body: JSON.stringify({ name, description: "", configuration }),
  });
export const deleteFeatureTemplate = (id: string) =>
  apiFetch(`/api/v0/models/feature-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
export const emptyConfiguration: FeatureConfiguration = {
  schema_version: 2,
  mappings: { timezone: "America/Bogota" },
  recipes: [],
};
// Fallback used when parseConfiguration is called before/without a live
// GET /models/features/operations catalog (e.g. no network yet, or a caller
// that doesn't fetch one). Not the source of truth - see
// FeatureOperationCapability - just keeps this pre-check usable while the
// live list loads, so an editor callback should pass its fetched ids once
// available instead of relying on this staying in sync by hand.
const DEFAULT_KNOWN_OPERATIONS = [
  "select",
  "number",
  "abs",
  "log",
  "add",
  "subtract",
  "multiply",
  "divide",
  "hour",
  "weekday",
  "elapsed_seconds",
  "filter",
  "count",
  "sum",
  "mean",
  "median",
  "min",
  "max",
  "distinct_count",
  "recency",
  "ratio",
  "difference",
  "categorize",
  "to_array",
  "to_boolean",
  "fill_missing",
];
const DEFAULT_KNOWN_OUTPUT_TYPES = ["number", "string", "boolean"];
export function parseConfiguration(
  text: string,
  knownOperations: readonly string[] = DEFAULT_KNOWN_OPERATIONS,
  knownOutputTypes: readonly string[] = DEFAULT_KNOWN_OUTPUT_TYPES,
): FeatureConfiguration {
  const value = JSON.parse(text);
  if (![1, 2].includes(value?.schema_version) || !value.mappings || !Array.isArray(value.recipes))
    throw new Error("Se requiere una configuración de versión 1 o 2 con mappings y recipes.");
  for (const key of value.schema_version === 1
    ? ["reference_time", "history", "history_time", "timezone"]
    : ["timezone"])
    if (typeof value.mappings[key] !== "string") throw new Error(`Mapeo requerido: ${key}`);
  const names = new Set<string>();
  for (const r of value.recipes) {
    if (
      !r ||
      !r.id ||
      typeof r.name !== "string" ||
      !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(r.name) ||
      names.has(r.name)
    )
      throw new Error("Cada característica necesita un identificador y nombre único válido.");
    names.add(r.name);
    if (r.output_type && !knownOutputTypes.includes(r.output_type))
      throw new Error(`Tipo inválido: ${r.name}`);

    if (
      !["current", "history"].includes(r.source) ||
      !Array.isArray(r.steps) ||
      !r.missing ||
      !["missing", "constant", "error"].includes(r.missing.policy)
    )
      throw new Error(`Receta inválida: ${r.name}`);
    const ids = new Set<string>();
    for (const step of r.steps) {
      if (
        !step ||
        typeof step.id !== "string" ||
        ids.has(step.id) ||
        !knownOperations.includes(step.operation)
      )
        throw new Error(`Paso inválido en ${r.name}`);
      ids.add(step.id);
      if (
        step.operation === "filter" &&
        (!Array.isArray(step.conditions) ||
          step.conditions.some((c: unknown) => !c || typeof c !== "object"))
      )
        throw new Error(`Condiciones inválidas en ${r.name}`);
      if (
        step.operation === "categorize" &&
        (!Array.isArray(step.rules) ||
          step.rules.some((c: unknown) => !c || typeof c !== "object" || !("value" in c)))
      )
        throw new Error(`Categorías inválidas en ${r.name}`);
    }
  }
  return value;
}
