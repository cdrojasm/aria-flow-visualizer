import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  FlaskConical,
  Download,
  CircleAlert,
  AlertTriangle,
} from "lucide-react";
import { SectionTabs } from "@/components/ui/section-tabs";
import { getDatasetRows } from "@/lib/api/datasets.functions";
import {
  type FeatureConfiguration,
  type FeatureOperationCapability,
  type Recipe,
  type RecipeStep,
  type Preview,
  type FeatureTemplate,
  previewFeatures,
  getPreviewFeatures,
  parseConfiguration,
  getFeatureTemplates,
  getFeatureCapabilities,
  saveFeatureTemplate,
  deleteFeatureTemplate,
} from "@/lib/api/feature-recipes.functions";
const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const button =
  "rounded-md border border-border px-3 py-2 text-sm hover:bg-primary/5 disabled:opacity-40";
const panel = "rounded-xl border border-border bg-card p-4 space-y-4";
const uid = () => crypto.randomUUID();
const show = (v: unknown) =>
  v === undefined ? "Ausente" : v === null ? "Nulo" : JSON.stringify(v);
const operations: Record<string, string> = {
  input: "Valor de entrada",
  select: "Extraer campo",
  number: "Convertir a número",
  abs: "Valor absoluto",
  log: "Logaritmo natural (ln)",
  add: "Sumar",
  subtract: "Restar",
  multiply: "Multiplicar",
  divide: "Dividir",
  hour: "Hora",
  weekday: "Día de semana",
  elapsed_seconds: "Tiempo transcurrido (s)",
  filter: "Filtrar historial",
  count: "Contar registros",
  sum: "Suma",
  mean: "Promedio",
  median: "Mediana",
  min: "Mínimo",
  max: "Máximo",
  distinct_count: "Valores distintos",
  recency: "Recencia (segundos)",
  ratio: "Actual / historial",
  difference: "Actual − historial",
  categorize: "Categorizar",
  to_array: "Convertir a lista",
  to_boolean: "Convertir a booleano",
  fill_missing: "Reemplazar ausentes",
};
const operationHelp: Record<string, string> = {
  select: "Conserva un campo del objeto o de cada evento.",
  number: "Convierte el valor a número.",
  abs: "Quita el signo y conserva la magnitud.",
  log: "Reduce la escala de valores positivos.",
  add: "Suma una constante o un valor actual.",
  subtract: "Resta una constante o un valor actual.",
  multiply: "Multiplica por una constante o valor actual.",
  divide: "Divide entre una constante o valor actual.",
  hour: "Extrae la hora de una fecha.",
  weekday: "Extrae el día de la semana.",
  elapsed_seconds: "Calcula segundos desde el evento hasta la operación actual.",
  filter: "Conserva solo eventos que cumplan las condiciones.",
  count: "Cuenta los eventos que quedaron en el historial.",
  sum: "Suma un campo numérico.",
  mean: "Calcula el promedio.",
  median: "Calcula la mediana.",
  min: "Obtiene el menor valor.",
  max: "Obtiene el mayor valor.",
  distinct_count: "Cuenta valores diferentes.",
  recency: "Segundos desde el último evento.",
  ratio: "Divide el valor actual entre el agregado histórico.",
  difference: "Resta el agregado histórico al valor actual.",
  categorize: "Convierte un número en categorías comprensibles.",
  to_array: "Convierte texto delimitado (o JSON ya parseado) en una lista de valores.",
  to_boolean: "Convierte un número (≠0) o una lista de valores verdaderos en verdadero/falso.",
  fill_missing: "Reemplaza null, campos ausentes y texto vacío antes de los pasos siguientes.",
};
// Fallback catalog, used only until GET /models/features/operations
// resolves (or if it fails) - see FeatureOperationCapability. The live
// fetch is the source of truth; this just avoids an empty picker while it
// loads, so it doesn't need to stay byte-for-byte synced with the backend.
const DEFAULT_OPERATION_CAPABILITIES: FeatureOperationCapability[] = [
  { id: "select", consumes: "array", produces: "unknown", skips_on_missing_input: false },
  { id: "number", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "abs", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "log", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "add", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "subtract", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "multiply", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "divide", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "hour", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "weekday", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "elapsed_seconds", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "filter", consumes: "array", produces: "array", skips_on_missing_input: false },
  { id: "count", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "sum", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "mean", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "median", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "min", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "max", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "distinct_count", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "recency", consumes: "array", produces: "scalar", skips_on_missing_input: false },
  { id: "ratio", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "difference", consumes: "scalar", produces: "scalar", skips_on_missing_input: true },
  { id: "categorize", consumes: "scalar", produces: "unknown", skips_on_missing_input: true },
  { id: "to_array", consumes: "scalar", produces: "array", skips_on_missing_input: true },
  { id: "to_boolean", consumes: "scalar", produces: "unknown", skips_on_missing_input: true },
  { id: "fill_missing", consumes: "scalar", produces: "unknown", skips_on_missing_input: false },
];
const DEFAULT_OUTPUT_TYPES = ["number", "string", "boolean"];
const outputTypeLabels: Record<string, string> = {
  number: "Número",
  string: "Categoría (texto)",
  boolean: "Booleano",
};
const defaultMissingValue = (outputType: Recipe["output_type"]) =>
  outputType === "string" ? "Sin dato" : outputType === "boolean" ? false : 0;
const friendlyFeatureError = (error: string) => {
  const technical = error.replace(/^.*?\s->\s\d{3}:\s*/, "");
  let problem: { recipe_id?: string; recipe_name?: string; field?: string; message?: string } = {};
  try {
    const payload = JSON.parse(technical) as { detail?: unknown };
    if (payload.detail && typeof payload.detail === "object" && !Array.isArray(payload.detail)) {
      problem = payload.detail as typeof problem;
    }
  } catch {
    // Network and legacy API errors may not be JSON; retain their text below.
  }
  const message = problem.message ?? technical.replace(/^\{"detail":"(.*)"\}$/, "$1");
  if (message.includes("Missing constant must match boolean output_type")) {
    return {
      title: "La constante no coincide con el tipo de salida",
      explanation:
        "Esta característica entrega un valor booleano, por lo que su valor alternativo debe ser Verdadero o Falso.",
      action:
        "En “Si falta o es inválido”, usa una constante booleana. El editor la propone automáticamente al seleccionar Booleano.",
      technical: message,
      recipeId: problem.recipe_id,
      recipeName: problem.recipe_name,
    };
  }
  return {
    title: "No pudimos validar esta configuración",
    explanation: "Revisa los campos marcados en la característica y vuelve a calcular.",
    action: "Si el problema continúa, abre el detalle técnico para compartirlo con el equipo.",
    technical: message,
    recipeId: problem.recipe_id,
    recipeName: problem.recipe_name,
  };
};
type InferredType = "array" | "scalar" | "unknown";
export type FeatureDiagnostic = {
  recipeId?: string;
  recipeName?: string;
  message: string;
};
function operationIsValidFor(capability: FeatureOperationCapability, type: InferredType) {
  return capability.consumes === "array" ? type !== "scalar" : type !== "array";
}
// Walks the recipe's own enabled steps up to stepIndex the same way the
// backend's validate_feature_definition does (array at the start of a
// history recipe, unknown for current - then each step's declared
// `produces`), so the picker only offers operations valid at this position
// instead of a static per-source allow-list.
function inferredTypeBeforeStep(
  recipe: Pick<Recipe, "source" | "steps">,
  stepIndex: number,
  capabilitiesById: Record<string, FeatureOperationCapability>,
): InferredType {
  let type: InferredType = recipe.source === "history" ? "array" : "unknown";
  for (let i = 0; i < stepIndex && i < recipe.steps.length; i++) {
    const step = recipe.steps[i];
    if (step.enabled === false) continue;
    const capability = capabilitiesById[step.operation];
    if (capability) type = capability.produces;
  }
  return type;
}
function operationsAt(
  recipe: Pick<Recipe, "source" | "steps">,
  stepIndex: number,
  capabilities: FeatureOperationCapability[],
): FeatureOperationCapability[] {
  const capabilitiesById = Object.fromEntries(capabilities.map((c) => [c.id, c]));
  const type = inferredTypeBeforeStep(recipe, stepIndex, capabilitiesById);
  const valid = capabilities.filter((c) => operationIsValidFor(c, type));
  const current = recipe.steps[stepIndex]?.operation;
  if (current && !valid.some((c) => c.id === current))
    valid.push(
      capabilitiesById[current] ?? { id: current, consumes: "scalar", produces: "scalar" },
    );
  return valid;
}
// Mirrors skips_on_missing_input (backend: _PASSTHROUGH_ON_MISSING_OPS in
// src/domain/models/feature_recipe.py) - true when this step is a no-op
// whenever its input arrives missing/null, because no fill_missing step ran
// earlier in the chain to resolve it first.
function stepSkipsWhenInputMissing(
  recipe: Pick<Recipe, "steps">,
  stepIndex: number,
  capabilities: FeatureOperationCapability[],
): boolean {
  const step = recipe.steps[stepIndex];
  if (!step || step.enabled === false) return false;
  const capability = capabilities.find((c) => c.id === step.operation);
  if (!capability?.skips_on_missing_input) return false;
  return !recipe.steps
    .slice(0, stepIndex)
    .some((s) => s.enabled !== false && s.operation === "fill_missing");
}
function fixtureFor(fields: string[]): Record<string, unknown>[] {
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    const parts = field.replace(/^\$\./, "").split(".").filter(Boolean);
    let target = row;
    for (const part of parts.slice(0, -1)) {
      target = (target[part] ??= {}) as Record<string, unknown>;
    }
    if (parts.length) target[parts.at(-1)!] = `Ejemplo ${field}`;
  }
  return [row, { ...row }, { ...row }];
}
function jsonContainer(value: unknown): unknown {
  if (typeof value !== "string" || !/^\s*(?:\[|\{)/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function fieldAt(row: unknown, path: string): unknown {
  let value = row;
  for (const part of path.replace(/^\$\./, "").split(".")) {
    const parsed = jsonContainer(value);
    value =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>)[part] : undefined;
  }
  return jsonContainer(value);
}
function sampleValuesForPath(
  rowsList: Record<string, unknown>[],
  path: string,
  limit = 3,
): unknown[] {
  const seen = new Set<string>();
  const values: unknown[] = [];
  for (const row of rowsList) {
    if (values.length >= limit) break;
    const value = fieldAt(row, path);
    if (value === undefined || value === null) continue;
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}
function isPrimitiveArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.every((item) => item === null || typeof item !== "object");
}
function paths(v: unknown, prefix = "", depth = 0): { path: string; value: unknown }[] {
  v = jsonContainer(v);
  if (depth > 5 || !v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v).flatMap(([k, raw]) => {
    const value = jsonContainer(raw);
    const path = prefix ? `${prefix}.${k}` : k;
    return [{ path, value }, ...paths(value, path, depth + 1)];
  });
}
function createFieldMappings(fieldPaths: string[], existing: Recipe[]): Recipe[] {
  const names = new Set(existing.map((recipe) => recipe.name));
  const mapped = new Set(
    existing
      .filter((recipe) => recipe.source === "current")
      .map((recipe) => recipe.path?.replace(/^\$\./, "")),
  );
  return [...new Set(fieldPaths)]
    .filter((path) => !mapped.has(path))
    .map((path) => {
      const clean = path
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9_]/g, "_");
      const base = (/^[A-Za-z]/.test(clean) ? clean : `campo_${clean}`).slice(0, 80);
      let name = base;
      let suffix = 2;
      while (names.has(name)) {
        const ending = `_${suffix++}`;
        name = `${base.slice(0, 80 - ending.length)}${ending}`;
      }
      names.add(name);
      return {
        id: uid(),
        name,
        description: "",
        enabled: true,
        output_type: "string",
        source: "current",
        path,
        missing: { policy: "missing" },
        steps: [],
      };
    });
}
function defaultStep(operation: string): RecipeStep {
  return {
    id: uid(),
    operation,
    ...(["select", "sum", "mean", "median", "min", "max", "distinct_count"].includes(operation)
      ? { path: "" }
      : {}),
    ...(["add", "subtract", "multiply", "divide"].includes(operation) ? { value: 1 } : {}),
    ...(["ratio", "difference"].includes(operation) ? { current_path: "" } : {}),
    ...(operation === "filter"
      ? {
          match: "all" as const,
          conditions: [{ operator: "eq", value: "" }],
        }
      : {}),
    ...(operation === "categorize"
      ? {
          rules: [
            { max: 100, include_max: false, value: "Bajo" },
            {
              min: 100,
              max: 1000,
              include_min: true,
              include_max: false,
              value: "Medio",
            },
            { min: 1000, include_min: true, value: "Alto" },
          ],
          fallback: "Sin categoría",
        }
      : {}),
    ...(operation === "fill_missing" ? { value: "NA", treat_blank_string_as_missing: true } : {}),
  };
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export function HistoryMappingControls({
  value,
  onChange,
  dataset,
  availableFields,
  target,
  fieldAliases = {},
}: {
  value: FeatureConfiguration;
  onChange: (configuration: FeatureConfiguration) => void;
  dataset: string;
  availableFields: string[];
  target: string;
  fieldAliases?: Record<string, string[]>;
}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setRows([]);
    setError("");
    if (!dataset) return;
    setLoading(true);
    getDatasetRows({ data: { name: dataset, limit: 20 } })
      .then((result) => active && setRows(result.rows))
      .catch((cause) => active && setError((cause as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [dataset, reload]);
  const candidates = [
    ...new Set([
      ...rows.flatMap((row) =>
        paths(row)
          .filter((field) => Array.isArray(field.value))
          .map((field) => field.path),
      ),
      ...availableFields,
    ]),
  ].filter((path) => path !== target && !path.startsWith(`${target}.`));
  const label = (path: string) => {
    const aliases = Object.hasOwn(fieldAliases, path) ? fieldAliases[path] : undefined;
    return aliases?.length ? `${path} — de ${aliases.join(" / ")}` : path;
  };
  return (
    <section className={panel}>
      <h3 className="font-semibold">Historial y fechas</h3>
      <Field label="Campo que contiene el historial (opcional)">
        <input
          className={input}
          list="training-history-arrays"
          placeholder="Selecciona el array histórico"
          value={value.mappings.history ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              mappings: { ...value.mappings, history: event.target.value || undefined },
            })
          }
        />
        <datalist id="training-history-arrays">
          {candidates.map((path) => (
            <option key={path} value={path} label={label(path)} />
          ))}
        </datalist>
      </Field>
      <p className="text-xs text-text-secondary">
        Los campos del historial son relativos a cada evento. Las sugerencias se obtienen de hasta
        20 filas reales; también puedes escribir una ruta.
      </p>
      {loading && (
        <p role="status" className="text-sm">
          Consultando campos del dataset…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          No se pudo cargar la muestra: {error}
        </p>
      )}
      <button
        type="button"
        className={button}
        disabled={!dataset || loading}
        onClick={() => setReload((count) => count + 1)}
      >
        Actualizar campos del dataset
      </button>
      <Field label="Zona horaria de las fechas sin zona explícita">
        <input
          className={input}
          value={value.mappings.timezone}
          onChange={(event) =>
            onChange({ ...value, mappings: { ...value.mappings, timezone: event.target.value } })
          }
        />
      </Field>
    </section>
  );
}
function JsonField<T>({
  value,
  onChange,
  label,
  onInvalid,
}: {
  onInvalid: (invalid: boolean) => void;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  useEffect(() => setText(JSON.stringify(value, null, 2)), [value]);
  return (
    <Field label={label}>
      <textarea
        className={`${input} font-mono min-h-24`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
            onInvalid(false);
          } catch {
            onInvalid(true);
            setError("JSON incompleto: corrige antes de aplicar.");
          }
        }}
      />
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </Field>
  );
}
export function FeatureRecipeWorkspace({
  value: rawValue,
  onChange,
  dataset,
  target,
  availableFields,
  fieldAliases = {},
  showHistorySettings = true,
  onValidity,
  onDiagnostic,
  focusRecipeId,
}: {
  value: FeatureConfiguration;
  onChange: (c: FeatureConfiguration) => void;
  dataset: string;
  target: string;
  availableFields: string[];
  fieldAliases?: Record<string, string[]>;
  showHistorySettings?: boolean;
  onValidity: (valid: boolean) => void;
  onDiagnostic?: (diagnostic: FeatureDiagnostic | null) => void;
  focusRecipeId?: string | null;
}) {
  // Feature configurations are persisted inside several versioned resources
  // (models and agent configuration). Older versions did not always contain
  // the new `recipes`/`steps` arrays. Treat those missing collections as
  // empty at the editor boundary: a historical configuration must be
  // viewable, and opening it must never make the whole configuration route
  // fail before the user has a chance to save a migrated version.
  const value: FeatureConfiguration = {
    schema_version: rawValue?.schema_version ?? 2,
    mappings: rawValue?.mappings ?? { timezone: "America/Bogota" },
    recipes: Array.isArray(rawValue?.recipes)
      ? rawValue.recipes.map((recipe) => ({
          ...recipe,
          steps: Array.isArray(recipe.steps) ? recipe.steps : [],
        }))
      : [],
  };
  const [selected, setSelected] = useState(value.recipes[0]?.id ?? "");
  const [tab, setTab] = useState("recipes");
  const [invalidField, setInvalidField] = useState(false);
  const [rawDirty, setRawDirty] = useState(false);
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2));
  const [jsonCopied, setJsonCopied] = useState(false);
  const [samples, setSamples] = useState("[]");
  const [source, setSource] = useState("Ejemplos ficticios");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FeatureTemplate[]>([]);
  const [capabilities, setCapabilities] = useState<FeatureOperationCapability[]>(
    DEFAULT_OPERATION_CAPABILITIES,
  );
  const [outputTypes, setOutputTypes] = useState<string[]>(DEFAULT_OUTPUT_TYPES);
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState("");
  const [row, setRow] = useState(0);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [mappingSearch, setMappingSearch] = useState("");
  const [truthyDrafts, setTruthyDrafts] = useState<Record<string, string>>({});
  const request = useRef(0);
  const recipe = value.recipes.find((r) => r.id === selected) ?? value.recipes[0];
  let rows: Record<string, unknown>[] = [];
  let sampleError = "";
  try {
    const parsed = JSON.parse(samples);
    rows = Array.isArray(parsed) ? parsed : [parsed];
    if (
      !rows.length ||
      rows.length > 50 ||
      rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw new Error();
  } catch {
    sampleError = "Introduce un objeto o una lista de hasta 50 objetos JSON.";
  }
  const [datasetSample, setDatasetSample] = useState<{
    dataset: string;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [datasetSampleError, setDatasetSampleError] = useState("");
  const [sampleReload, setSampleReload] = useState(0);
  useEffect(() => {
    let active = true;
    setDatasetSample(null);
    setDatasetSampleError("");
    setSampleLoading(!!dataset);
    if (dataset) {
      getDatasetRows({ data: { name: dataset, limit: 20 } })
        .then((result) => {
          if (active) setDatasetSample({ dataset, rows: result.rows });
        })
        .catch((e) => {
          if (active) setDatasetSampleError((e as Error).message);
        })
        .finally(() => {
          if (active) setSampleLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [dataset, sampleReload]);
  const realRows = datasetSample?.dataset === dataset ? datasetSample.rows : [];
  const alertPathPreview =
    recipe && recipe.source === "current" && recipe.path
      ? sampleValuesForPath(realRows.length ? realRows : rows, recipe.path)
      : [];
  const fields = paths(rows[0]);
  const realFields = realRows.flatMap((row) => paths(row));
  const historyPath = value.mappings.history ?? "";
  const currentPaths = [...new Set([...availableFields, ...realFields.map((f) => f.path)])].filter(
    (path) =>
      path !== historyPath &&
      !path.startsWith(`${historyPath}.`) &&
      path !== target &&
      !path.startsWith(`${target}.`),
  );
  const historyPaths = [
    ...new Set(
      realRows.flatMap((row) => {
        const events = fieldAt(row, historyPath);
        return Array.isArray(events)
          ? events.flatMap((event) => paths(event).map((f) => f.path))
          : [];
      }),
    ),
  ];
  const historyCandidates = [
    ...new Set([
      ...realFields.filter((field) => Array.isArray(field.value)).map((field) => field.path),
      ...availableFields,
    ]),
  ].filter((path) => path !== target && !path.startsWith(`${target}.`));
  const containerPaths = new Set(
    realFields
      .filter((field) => field.value !== null && typeof field.value === "object")
      .map((field) => field.path),
  );
  const bulkPaths = currentPaths.filter(
    (path) =>
      !containerPaths.has(path) &&
      !currentPaths.some((other) => other.startsWith(`${path}.`)) &&
      !historyPath.startsWith(`${path}.`) &&
      !target.startsWith(`${path}.`),
  );
  const mappedPaths = new Set(
    value.recipes.filter((r) => r.source === "current").map((r) => r.path?.replace(/^\$\./, "")),
  );
  const pendingPaths = bulkPaths.filter((path) => !mappedPaths.has(path));
  const suggestedPaths = currentPaths;
  const fixture = fixtureFor(currentPaths);
  const pathLabel = (path: string) => {
    const aliases = Object.hasOwn(fieldAliases, path) ? fieldAliases[path] : undefined;
    return aliases?.length ? `${path} — de ${aliases.join(" / ")}` : path;
  };
  useEffect(() => {
    setRaw(JSON.stringify(value, null, 2));
    setRawDirty(false);
    setPreview(null);
    setError("");
    setPreviewError("");
    onValidity(value.recipes.every((r) => !r.enabled));
    request.current++;
  }, [value, samples, target, dataset]);
  useEffect(() => {
    if (!focusRecipeId) return;
    const focused = value.recipes.find((item) => item.id === focusRecipeId);
    if (focused) {
      setTab("recipes");
      setSelected(focused.id);
      setMappingSearch(focused.name);
    }
  }, [focusRecipeId, value.recipes]);
  useEffect(() => {
    if (invalidField || rawDirty) {
      onValidity(false);
      setPreview(null);
      request.current++;
    }
  }, [invalidField, rawDirty]);
  useEffect(() => {
    const features = preview?.rows[Math.min(row, (preview?.rows.length ?? 1) - 1)]?.features ?? [];
    setOpenDetails(Object.fromEntries(features.map((feature) => [feature.id, false])));
  }, [preview, row]);
  useEffect(() => {
    setPreview(null);
    if (source.startsWith("Dataset:")) {
      setSamples("[]");
      setSource("Selecciona una nueva muestra del dataset");
    }
  }, [dataset]);
  useEffect(() => {
    if (source === "Ejemplos ficticios") setSamples(JSON.stringify(fixture, null, 2));
  }, [availableFields, source]);
  useEffect(() => {
    if (!previewTaskId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await getPreviewFeatures(previewTaskId);
        if (cancelled) return;
        if (status.status === "PENDING") {
          window.setTimeout(poll, 800);
          return;
        }
        setPreviewTaskId(null);
        setBusy(false);
        if (status.status === "READY" && status.result) {
          setPreview(status.result);
          onDiagnostic?.(null);
          onValidity(
            status.result.rows.every((result) =>
              result.features.every(
                (feature) => feature.status === "ok" || feature.status === "disabled",
              ),
            ),
          );
        } else {
          setPreviewError(status.error ?? "La prueba no pudo completarse.");
          const details = friendlyFeatureError(status.error ?? "La prueba no pudo completarse.");
          onDiagnostic?.({
            recipeId: details.recipeId,
            recipeName: details.recipeName,
            message: details.explanation,
          });
          onValidity(false);
        }
      } catch (e) {
        if (!cancelled) {
          setPreviewTaskId(null);
          setBusy(false);
          setPreviewError((e as Error).message);
          const details = friendlyFeatureError((e as Error).message);
          onDiagnostic?.({
            recipeId: details.recipeId,
            recipeName: details.recipeName,
            message: details.explanation,
          });
          onValidity(false);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [previewTaskId]);
  useEffect(() => {
    getFeatureTemplates()
      .then(setTemplates)
      .catch(() => setMessage("El catálogo de plantillas no está disponible."));
  }, []);
  useEffect(() => {
    getFeatureCapabilities()
      .then((c) => {
        setCapabilities(c.operations);
        setOutputTypes(c.output_types);
      })
      .catch(() =>
        setMessage("No se pudo cargar el catálogo de operaciones; usando la lista por defecto."),
      );
  }, []);
  const parseConfig = (text: string) =>
    parseConfiguration(
      text,
      capabilities.map((c) => c.id),
      outputTypes,
    );
  const update = (patch: Partial<Recipe>) =>
    onChange({
      ...value,
      recipes: value.recipes.map((r) => (r.id === recipe?.id ? { ...r, ...patch } : r)),
    });
  const updateStep = (id: string, patch: Partial<RecipeStep>) =>
    update({
      steps: recipe.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  const uniqueName = (base: string) => {
    let name = base;
    let n = 2;
    while (value.recipes.some((r) => r.name === name)) name = `${base}_${n++}`;
    return name;
  };
  const add = (kind = "count") => {
    const r: Recipe = {
      id: uid(),
      name: uniqueName("feature"),
      description: "",
      enabled: true,
      output_type: kind === "categorize" ? "string" : "number",
      source: kind === "categorize" ? "current" : "history",
      ...(kind === "categorize" ? { path: "" } : {}),
      missing: { policy: "missing" },
      steps:
        kind === "ratio"
          ? [defaultStep("mean"), defaultStep("ratio")]
          : kind === "categorize"
            ? [defaultStep("number"), defaultStep("categorize")]
            : [defaultStep("count")],
    };
    onChange({ ...value, recipes: [...value.recipes, r] });
    setSelected(r.id);
  };
  const generateMappings = () => {
    const generated = createFieldMappings(pendingPaths, value.recipes);
    if (!generated.length || value.recipes.length + generated.length > 200) return;
    onChange({ ...value, recipes: [...value.recipes, ...generated] });
    setSelected(generated[0].id);
    setMessage(
      `Se crearon ${generated.length} mapeos como texto. Puedes editar su tipo y añadir transformaciones.`,
    );
  };
  const addMapping = () => {
    const mapping: Recipe = {
      id: uid(),
      name: uniqueName("campo"),
      description: "",
      enabled: true,
      output_type: "string",
      source: "current",
      missing: { policy: "missing" },
      steps: [],
    };
    onChange({ ...value, recipes: [...value.recipes, mapping] });
    setSelected(mapping.id);
  };
  const evaluate = async () => {
    const id = ++request.current;
    let queued = false;
    setBusy(true);
    setPreview(null);
    setPreviewError("");
    try {
      if (invalidField || rawDirty)
        throw new Error(
          "Corrige los campos JSON y aplica los cambios pendientes antes de validar.",
        );
      // `$` is the explicit root path understood by deployed versions of the
      // recipe engine. Keep it on the wire for primitive-list filters so an
      // editor deployed ahead of the API remains compatible.
      const previewConfiguration: FeatureConfiguration = {
        ...value,
        recipes: value.recipes.map((recipe) => ({
          ...recipe,
          steps: recipe.steps.map((step) =>
            step.operation === "filter"
              ? {
                  ...step,
                  conditions: step.conditions?.map((condition) =>
                    condition.path === undefined ? { ...condition, path: "$" } : condition,
                  ),
                }
              : step,
          ),
        })),
      };
      parseConfig(JSON.stringify(previewConfiguration));
      if (sampleError) throw new Error(sampleError);
      const result = await previewFeatures(previewConfiguration, rows, target);
      if (request.current !== id) return;
      queued = true;
      setPreviewTaskId(result.task_id);
    } catch (e) {
      if (request.current === id) {
        setPreviewError((e as Error).message);
        const details = friendlyFeatureError((e as Error).message);
        onDiagnostic?.({
          recipeId: details.recipeId,
          recipeName: details.recipeName,
          message: details.explanation,
        });
        onValidity(false);
      }
    } finally {
      if (!queued) setBusy(false);
    }
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    a.download = `feature-recipes-v${value.schema_version}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setJsonCopied(true);
      window.setTimeout(() => setJsonCopied(false), 1500);
    } catch {
      setError("No se pudo copiar el JSON.");
    }
  };
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-text-primary">
            Ingeniería de características
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Mapea variables, transforma transacciones y calcula señales del historial.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-text-primary">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            <span className="font-medium">Mapeos activos:</span>{" "}
            {value.recipes.filter((r) => r.enabled).length} · versión 1
          </p>
        </div>
      </div>
      <SectionTabs
        label="Ingeniería de características"
        value={tab as "recipes" | "preview" | "json" | "templates"}
        onValueChange={setTab}
        variant="pills"
        items={[
          { key: "recipes", label: "Mapeo y transformaciones" },
          { key: "preview", label: "Prueba de configuración" },
          { key: "json", label: "JSON avanzado" },
          { key: "templates", label: "Plantillas reutilizables" },
        ]}
      />
      <p className="text-[12px] text-text-secondary rounded-lg bg-muted/30 p-3">
        {tab === "recipes" && "Define los mapeos que transforman los datos de una alerta."}
        {tab === "preview" && "Comprueba los resultados de los mapeos con datos de prueba."}
        {tab === "json" && "Edita o importa la configuración completa."}
        {tab === "templates" && "Guarda y reutiliza conjuntos de mapeos."}
        <span
          className="ml-1 inline-flex cursor-help"
          title={
            tab === "recipes"
              ? "Cada mapeo produce una variable de salida. El campo original solo se conserva si lo incluyes como otro mapeo."
              : tab === "preview"
                ? "Ejecuta los mapeos sobre filas de prueba antes de usarlos."
                : tab === "json"
                  ? "Úsalo cuando necesites precisión o automatización. Las muestras no se guardan en esta configuración."
                  : "Cada modelo recibe una copia independiente de la plantilla."
          }
        >
          ⓘ
        </span>
      </p>
      <datalist id="fe-paths">
        {suggestedPaths.map((path) => (
          <option key={path} value={path} label={pathLabel(path)} />
        ))}
      </datalist>
      <datalist id="fe-history-paths">
        {historyPaths.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
      {tab === "recipes" && (
        <div className="space-y-4">
          {showHistorySettings && (
            <div className={panel}>
              <Field label="Campo de historial de la alerta (opcional)">
                <input
                  className={input}
                  list="fe-history-arrays"
                  placeholder="Selecciona el campo que contiene el array histórico"
                  value={historyPath}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      mappings: {
                        ...value.mappings,
                        history: e.target.value || undefined,
                      },
                    })
                  }
                />
                <datalist id="fe-history-arrays">
                  {historyCandidates.map((path) => (
                    <option key={path} value={path} label={pathLabel(path)} />
                  ))}
                </datalist>
              </Field>
              <p className="text-xs text-text-secondary">
                Selecciona el array que contiene el historial.{" "}
                <span
                  className="cursor-help"
                  title="Los campos de la alerta usan su ruta completa; los del historial son relativos a cada evento. Las sugerencias se obtienen de hasta 20 filas reales y puedes escribir una ruta que no aparezca en la muestra."
                >
                  ⓘ
                </span>
              </p>
              {sampleLoading && (
                <p role="status" className="text-sm">
                  Consultando campos del dataset…
                </p>
              )}
              {datasetSampleError && (
                <p role="alert" className="text-sm text-danger">
                  No se pudo cargar la muestra: {datasetSampleError}
                </p>
              )}
              {historyPath && !sampleLoading && historyPaths.length === 0 && (
                <p className="text-sm text-text-secondary">
                  No hay campos de eventos en la muestra.{" "}
                  <span
                    className="cursor-help"
                    title="Comprueba la ruta o introduce los campos manualmente."
                  >
                    ⓘ
                  </span>
                </p>
              )}
              <button
                type="button"
                className={button}
                disabled={!dataset || sampleLoading}
                onClick={() => setSampleReload((n) => n + 1)}
              >
                Actualizar campos del dataset
              </button>
              <Field label="Zona horaria de las fechas sin zona explícita">
                <input
                  className={input}
                  value={value.mappings.timezone}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      mappings: { ...value.mappings, timezone: e.target.value },
                    })
                  }
                />
              </Field>
              {value.schema_version === 1 ? (
                <div className="text-sm space-y-2">
                  <p>
                    Esta configuración anterior conserva los filtros previos a los pasos: fecha
                    actual {value.mappings.reference_time}, fecha histórica{" "}
                    {value.mappings.history_time}
                    {value.mappings.entity
                      ? ` e identidad ${value.mappings.entity} = ${value.mappings.history_entity}`
                      : ""}
                    . Puedes revisarlos en JSON avanzado.
                  </p>
                  <p>
                    Las configuraciones nuevas usan únicamente filtros explícitos en las
                    transformaciones.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  El historial se procesa completo.{" "}
                  <span
                    className="cursor-help"
                    title="Añade filtros para limitar fechas, cuentas u otros campos antes de agregar sus valores."
                  >
                    ⓘ
                  </span>
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <button
              type="button"
              className={button}
              disabled={
                sampleLoading ||
                !pendingPaths.length ||
                value.recipes.length + pendingPaths.length > 200 ||
                rawDirty ||
                invalidField
              }
              onClick={generateMappings}
            >
              Generar mapeos de todos los campos
              {pendingPaths.length > 0 ? ` (${pendingPaths.length})` : ""}
            </button>
            <p className="text-xs text-text-secondary">
              Crea los campos simples de la alerta como texto, sin transformaciones. Conserva los
              mapeos existentes y no los duplica. El campo objetivo y los contenedores, incluido el
              historial, quedan fuera; sus eventos necesitan una extracción o agregación.
            </p>
            {value.recipes.length + pendingPaths.length > 200 && (
              <p role="alert" className="text-sm text-danger">
                La generación superaría el límite de 200 mapeos. Añade individualmente los campos
                que necesites.
              </p>
            )}
          </div>
          <div className="grid md:grid-cols-[210px_1fr] gap-4">
            <aside className="space-y-2">
              {value.recipes.length > 0 && (
                <input
                  aria-label="Buscar mapeo"
                  className={input}
                  value={mappingSearch}
                  onChange={(e) => setMappingSearch(e.target.value)}
                  placeholder="Buscar mapeo…"
                />
              )}
              <div
                role="region"
                aria-label="Campos mapeados"
                className="grid max-h-[26.5rem] gap-2 overflow-y-auto pr-1"
              >
                {value.recipes
                  .filter((r) => r.name.toLowerCase().includes(mappingSearch.trim().toLowerCase()))
                  .map((r) => (
                    <button
                      key={r.id}
                      title={r.name}
                      onClick={() => setSelected(r.id)}
                      className={`${button} h-16 min-w-0 w-full text-left ${recipe?.id === r.id ? "bg-primary/10" : ""}`}
                    >
                      <span className="block truncate">{r.name}</span>
                      <span className="block text-xs text-text-secondary">
                        {r.enabled ? "Activa" : "Desactivada"} · {r.steps.length} pasos
                      </span>
                    </button>
                  ))}
                {value.recipes.length > 0 &&
                  !value.recipes.some((r) =>
                    r.name.toLowerCase().includes(mappingSearch.trim().toLowerCase()),
                  ) && (
                    <p className="text-xs text-text-secondary px-1 py-2">
                      Sin mapeos que coincidan con "{mappingSearch}".
                    </p>
                  )}
              </div>
              <button
                type="button"
                className={`${button} w-full`}
                disabled={value.recipes.length >= 200}
                onClick={addMapping}
              >
                <Plus size={14} className="inline" /> Añadir mapeo
              </button>
              {value.recipes.length === 0 && (
                <div className="space-y-2">
                  <button className={`${button} w-full`} onClick={() => add()}>
                    <Plus size={14} className="inline" /> Característica del historial
                  </button>
                  <button className={`${button} w-full`} onClick={() => add("ratio")}>
                    + Ratio de importe
                  </button>
                  <button className={`${button} w-full`} onClick={() => add("categorize")}>
                    + Categoría de importe
                  </button>
                </div>
              )}
            </aside>
            <div className="space-y-4">
              {!recipe ? (
                <p className="p-8 text-sm text-text-secondary">
                  Crea una característica y añade sus transformaciones. Para trabajar con eventos,
                  selecciona primero el campo de historial.
                </p>
              ) : (
                <>
                  <div className="flex gap-2 items-center">
                    <input
                      aria-label="Nombre de característica"
                      className={input}
                      value={recipe.name}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                    <button
                      className={button}
                      aria-label="Duplicar receta"
                      onClick={() => {
                        const copy = {
                          ...recipe,
                          id: uid(),
                          name: uniqueName(`${recipe.name}_copia`),
                          steps: recipe.steps.map((s) => ({ ...s, id: uid() })),
                        };
                        onChange({
                          ...value,
                          recipes: [...value.recipes, copy],
                        });
                        setSelected(copy.id);
                      }}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className={button}
                      aria-label="Eliminar receta"
                      onClick={() =>
                        onChange({
                          ...value,
                          recipes: value.recipes.filter((r) => r.id !== recipe.id),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input
                    className={input}
                    placeholder="Descripción de la señal"
                    value={recipe.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="Origen">
                      <select
                        className={input}
                        value={recipe.source}
                        onChange={(e) => {
                          const source = e.target.value as Recipe["source"];
                          const startType: InferredType =
                            source === "history" ? "array" : "unknown";
                          const capabilitiesById = Object.fromEntries(
                            capabilities.map((c) => [c.id, c]),
                          );
                          const currentOp = recipe.steps[0]?.operation;
                          const currentCapability = currentOp
                            ? capabilitiesById[currentOp]
                            : undefined;
                          const operation =
                            currentCapability && operationIsValidFor(currentCapability, startType)
                              ? currentOp
                              : (capabilities.find((c) => operationIsValidFor(c, startType))?.id ??
                                "select");
                          update({
                            source,
                            steps: recipe.steps.map((step, index) =>
                              index === 0 ? { ...defaultStep(operation), id: step.id } : step,
                            ),
                          });
                        }}
                      >
                        <option value="current">Operación actual</option>
                        <option value="history">Historial</option>
                      </select>
                    </Field>
                    {recipe.source === "history" ? (
                      <p className="text-sm text-text-secondary">
                        Array: {historyPath || "Selecciona el historial al inicio"}
                        {value.schema_version === 1 && recipe.window_seconds && (
                          <span className="block">
                            Ventana heredada: {recipe.window_seconds / 3600} horas (JSON avanzado).
                          </span>
                        )}
                      </p>
                    ) : (
                      <Field label="Campo de la alerta">
                        <input
                          className={input}
                          list="fe-paths"
                          value={recipe.path ?? ""}
                          onChange={(e) => update({ path: e.target.value || undefined })}
                        />
                      </Field>
                    )}
                    <Field label="Si falta o es inválido">
                      <select
                        className={input}
                        value={recipe.missing.policy}
                        onChange={(e) =>
                          update({
                            missing: {
                              policy: e.target.value as Recipe["missing"]["policy"],
                              ...(e.target.value === "constant"
                                ? {
                                    value: defaultMissingValue(recipe.output_type),
                                  }
                                : {}),
                            },
                          })
                        }
                      >
                        <option value="missing">Mantener ausente</option>
                        <option value="constant">Constante</option>
                        <option value="error">Error</option>
                      </select>
                    </Field>
                  </div>
                  {recipe.source === "current" && recipe.path && (
                    <div className="rounded-lg border border-border bg-surface p-3 space-y-1">
                      <p className="text-xs font-medium">Vista previa de "{recipe.path}"</p>
                      {sampleLoading && !realRows.length && !rows.length ? (
                        <p className="text-xs text-text-secondary">Cargando muestra…</p>
                      ) : alertPathPreview.length ? (
                        <ul className="text-xs font-mono text-text-secondary space-y-0.5">
                          {alertPathPreview.map((v, i) => (
                            <li key={i} className="truncate">
                              {show(v)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-text-secondary">
                          Sin valores de muestra para este campo.
                        </p>
                      )}
                    </div>
                  )}
                  {recipe.missing.policy === "constant" && (
                    <div className="space-y-1">
                      <JsonField
                        onInvalid={setInvalidField}
                        label={`Valor alternativo (${outputTypeLabels[recipe.output_type ?? "number"]?.toLowerCase() ?? "JSON"})`}
                        value={recipe.missing.value ?? defaultMissingValue(recipe.output_type)}
                        onChange={(v) => update({ missing: { policy: "constant", value: v } })}
                      />
                      {recipe.output_type === "boolean" && (
                        <p className="text-xs text-text-secondary">
                          Usa <code>true</code> o <code>false</code>, sin comillas.
                        </p>
                      )}
                    </div>
                  )}
                  <Field label="Tipo de salida">
                    <select
                      className={input}
                      value={recipe.output_type ?? "number"}
                      onChange={(e) => {
                        const outputType = e.target.value as Recipe["output_type"];
                        update({
                          output_type: outputType,
                          ...(recipe.missing.policy === "constant"
                            ? {
                                missing: {
                                  policy: "constant",
                                  value: defaultMissingValue(outputType),
                                },
                              }
                            : {}),
                        });
                      }}
                    >
                      {outputTypes.map((t) => (
                        <option key={t} value={t}>
                          {outputTypeLabels[t] ?? t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={recipe.enabled}
                      onChange={(e) => update({ enabled: e.target.checked })}
                    />
                    Incluir esta característica en el modelo
                  </label>
                  {recipe.steps.map((s, i) => (
                    <div key={s.id} className="rounded-lg border border-border p-3 space-y-3">
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-text-secondary">{i + 1}</span>
                        <select
                          aria-label={`Operación del paso ${i + 1}`}
                          className={input}
                          value={s.operation}
                          onChange={(e) =>
                            update({
                              steps: recipe.steps.map((st) =>
                                st.id === s.id ? { ...defaultStep(e.target.value), id: s.id } : st,
                              ),
                            })
                          }
                        >
                          {operationsAt(recipe, i, capabilities).map((c) => (
                            <option key={c.id} value={c.id}>
                              {operations[c.id] ?? c.id}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-text-secondary">{operationHelp[s.operation]}</p>
                        {[-1, 1].map((d) => (
                          <button
                            key={d}
                            className={button}
                            disabled={i + d < 0 || i + d >= recipe.steps.length}
                            aria-label={d < 0 ? "Subir paso" : "Bajar paso"}
                            onClick={() => {
                              const steps = [...recipe.steps];
                              [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
                              update({ steps });
                            }}
                          >
                            {d < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                          </button>
                        ))}
                        <button
                          className={button}
                          aria-label="Duplicar paso"
                          onClick={() =>
                            update({
                              steps: [
                                ...recipe.steps.slice(0, i + 1),
                                { ...s, id: uid() },
                                ...recipe.steps.slice(i + 1),
                              ],
                            })
                          }
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className={button}
                          aria-label="Eliminar paso"
                          onClick={() =>
                            update({
                              steps: recipe.steps.filter((st) => st.id !== s.id),
                            })
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {stepSkipsWhenInputMissing(recipe, i, capabilities) && (
                        <p className="text-xs text-warning">
                          Este paso se saltará si el valor de entrada llega ausente o nulo — agrega
                          un paso "Reemplazar ausentes" antes para que la transformación se ejecute
                          siempre.
                        </p>
                      )}
                      <label className="flex gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={s.enabled !== false}
                          onChange={(e) => updateStep(s.id, { enabled: e.target.checked })}
                        />
                        Paso activo
                      </label>
                      {[
                        "select",
                        "sum",
                        "mean",
                        "median",
                        "min",
                        "max",
                        "distinct_count",
                        "recency",
                      ].includes(s.operation) && (
                        <Field label="Campo de cada elemento (opcional tras seleccionar)">
                          <input
                            list={recipe.source === "history" ? "fe-history-paths" : "fe-paths"}
                            className={input}
                            value={s.path ?? ""}
                            onChange={(e) =>
                              updateStep(s.id, {
                                path: e.target.value || undefined,
                              })
                            }
                          />
                        </Field>
                      )}
                      {["recency", "elapsed_seconds"].includes(s.operation) && (
                        <div className="grid grid-cols-2 gap-2">
                          {s.operation === "recency" && (
                            <Field label="Fecha del evento histórico">
                              <input
                                className={input}
                                list="fe-history-paths"
                                value={s.path ?? ""}
                                onChange={(e) =>
                                  updateStep(s.id, {
                                    path: e.target.value || undefined,
                                  })
                                }
                              />
                            </Field>
                          )}
                          <Field label="Fecha de referencia de la alerta">
                            <input
                              className={input}
                              list="fe-paths"
                              value={s.current_path ?? ""}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  current_path: e.target.value || undefined,
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {["add", "subtract", "multiply", "divide", "ratio", "difference"].includes(
                        s.operation,
                      ) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Ruta de operación actual">
                            <input
                              className={input}
                              list="fe-paths"
                              value={s.current_path ?? ""}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  current_path: e.target.value || undefined,
                                  value: undefined,
                                })
                              }
                            />
                          </Field>
                          {!["ratio", "difference"].includes(s.operation) && (
                            <Field label="O constante numérica">
                              <input
                                type="number"
                                className={input}
                                value={typeof s.value === "number" ? s.value : ""}
                                onChange={(e) =>
                                  updateStep(s.id, {
                                    value: Number(e.target.value),
                                    current_path: undefined,
                                  })
                                }
                              />
                            </Field>
                          )}
                        </div>
                      )}
                      {s.operation === "to_array" && (
                        <Field label="Delimitador (opcional; coma por defecto)">
                          <input
                            className={input}
                            value={s.delimiter ?? ""}
                            onChange={(e) =>
                              updateStep(s.id, { delimiter: e.target.value || undefined })
                            }
                          />
                        </Field>
                      )}
                      {s.operation === "to_boolean" && (
                        <Field label="Valores verdaderos, separados por coma (vacío = numérico distinto de cero)">
                          <input
                            className={input}
                            value={
                              Object.hasOwn(truthyDrafts, s.id)
                                ? truthyDrafts[s.id]
                                : (s.truthy_values ?? []).join(", ")
                            }
                            onChange={(e) => {
                              const text = e.target.value;
                              setTruthyDrafts((drafts) => ({ ...drafts, [s.id]: text }));
                              const values = text
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean);
                              updateStep(s.id, {
                                truthy_values: values.length ? values : undefined,
                              });
                            }}
                            onBlur={() =>
                              setTruthyDrafts((drafts) => {
                                const { [s.id]: _discarded, ...rest } = drafts;
                                return rest;
                              })
                            }
                          />
                        </Field>
                      )}
                      {s.operation === "fill_missing" && (
                        <div className="space-y-2">
                          <JsonField
                            onInvalid={setInvalidField}
                            label="Valor de reemplazo"
                            value={s.value ?? "NA"}
                            onChange={(v) => updateStep(s.id, { value: v })}
                          />
                          <label className="flex items-center gap-2 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              checked={s.treat_blank_string_as_missing ?? true}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  treat_blank_string_as_missing: e.target.checked,
                                })
                              }
                            />
                            Considerar vacío el texto <code>""</code> o solo espacios
                          </label>
                        </div>
                      )}
                      {s.operation === "filter" && (
                        <>
                          <Field label="Combinar condiciones">
                            <select
                              className={input}
                              value={s.match ?? "all"}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  match: e.target.value as "all" | "any",
                                })
                              }
                            >
                              <option value="all">Todas (AND)</option>
                              <option value="any">Cualquiera (OR)</option>
                            </select>
                          </Field>
                          {(s.conditions ?? []).map((c, j) => {
                            const inputIsPrimitiveList =
                              recipe.steps
                                .slice(0, i)
                                .some(
                                  (step) => step.enabled !== false && step.operation === "to_array",
                                ) ||
                              (recipe.source === "current" &&
                                alertPathPreview.some(isPrimitiveArray));
                            const changeCondition = (
                              patch: Partial<NonNullable<RecipeStep["conditions"]>[number]>,
                            ) =>
                              updateStep(s.id, {
                                conditions: s.conditions!.map((condition, index) =>
                                  index === j ? { ...condition, ...patch } : condition,
                                ),
                              });
                            return (
                              <div
                                key={j}
                                className="rounded-lg border border-border p-3 grid sm:grid-cols-2 gap-3"
                              >
                                {inputIsPrimitiveList ? (
                                  <p className="text-xs text-text-secondary self-center">
                                    Elemento de la lista
                                  </p>
                                ) : (
                                  <Field
                                    label={
                                      recipe.source === "history"
                                        ? "Campo del evento histórico"
                                        : "Campo del elemento"
                                    }
                                  >
                                    <input
                                      className={input}
                                      list={
                                        recipe.source === "history"
                                          ? "fe-history-paths"
                                          : "fe-paths"
                                      }
                                      value={c.path ?? ""}
                                      onChange={(e) => changeCondition({ path: e.target.value })}
                                    />
                                  </Field>
                                )}
                                <Field label="Tipo de comparación">
                                  <select
                                    className={input}
                                    value={c.value_type ?? "auto"}
                                    onChange={(e) =>
                                      changeCondition({
                                        value_type: e.target.value as "auto" | "datetime",
                                        offset_seconds: undefined,
                                        operator: "eq",
                                      })
                                    }
                                  >
                                    <option value="auto">Valor</option>
                                    <option value="datetime">Fecha y hora</option>
                                  </select>
                                </Field>
                                <Field label="Comparación">
                                  <select
                                    className={input}
                                    value={c.operator}
                                    onChange={(e) =>
                                      changeCondition({
                                        operator: e.target.value,
                                      })
                                    }
                                  >
                                    {Object.entries({
                                      eq: "Igual a",
                                      ne: "Distinto de",
                                      gt: "Mayor que / posterior a",
                                      gte: "Mayor o igual / desde",
                                      lt: "Menor que / anterior a",
                                      lte: "Menor o igual / hasta",
                                      ...(c.value_type === "datetime"
                                        ? {}
                                        : {
                                            in: "Está en",
                                            contains: "Contiene",
                                          }),
                                    }).map(([op, label]) => (
                                      <option key={op} value={op}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </Field>
                                <Field label="Comparar con">
                                  <select
                                    className={input}
                                    value={c.current_path !== undefined ? "current" : "literal"}
                                    onChange={(e) =>
                                      changeCondition(
                                        e.target.value === "current"
                                          ? {
                                              current_path: "",
                                              value: undefined,
                                            }
                                          : {
                                              current_path: undefined,
                                              value: "",
                                            },
                                      )
                                    }
                                  >
                                    <option value="literal">Valor fijo</option>
                                    <option value="current">Campo de la alerta</option>
                                  </select>
                                </Field>
                                {c.current_path !== undefined ? (
                                  <Field label="Campo de la alerta">
                                    <input
                                      className={input}
                                      list="fe-paths"
                                      value={c.current_path}
                                      onChange={(e) =>
                                        changeCondition({
                                          current_path: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                ) : (
                                  <Field
                                    label={
                                      c.value_type === "datetime"
                                        ? "Fecha de comparación (ISO)"
                                        : "Valor fijo (texto o JSON)"
                                    }
                                  >
                                    <input
                                      className={input}
                                      value={
                                        typeof c.value === "string"
                                          ? c.value
                                          : (JSON.stringify(c.value) ?? "")
                                      }
                                      onChange={(e) => {
                                        let literal: unknown = e.target.value;
                                        if (c.value_type !== "datetime") {
                                          try {
                                            literal = JSON.parse(e.target.value);
                                          } catch {
                                            /* Plain text is a valid literal. */
                                          }
                                        }
                                        changeCondition({ value: literal });
                                      }}
                                    />
                                  </Field>
                                )}
                                {c.value_type === "datetime" && (
                                  <Field label="Desplazamiento de la fecha de comparación (horas)">
                                    <input
                                      type="number"
                                      step="any"
                                      className={input}
                                      value={(c.offset_seconds ?? 0) / 3600}
                                      onChange={(e) =>
                                        changeCondition({
                                          offset_seconds: Number(e.target.value) * 3600,
                                        })
                                      }
                                    />
                                    <span className="text-xs text-text-secondary">
                                      −24 equivale a 24 horas antes de la fecha con la que comparas.
                                    </span>
                                  </Field>
                                )}
                                <button
                                  type="button"
                                  className={button}
                                  onClick={() =>
                                    updateStep(s.id, {
                                      conditions: s.conditions!.filter((_, index) => j !== index),
                                    })
                                  }
                                >
                                  Eliminar condición
                                </button>
                              </div>
                            );
                          })}
                          <button
                            className={button}
                            onClick={() =>
                              updateStep(s.id, {
                                conditions: [
                                  ...(s.conditions ?? []),
                                  { operator: "eq", value: "" },
                                ],
                              })
                            }
                          >
                            + Condición
                          </button>
                          <p className="text-xs text-text-secondary">
                            Para las últimas 24 horas, combina fecha del evento anterior a la fecha
                            de la alerta y mayor o igual a esa fecha con desplazamiento −24. Los
                            filtros se ejecutan en el orden mostrado.
                          </p>
                        </>
                      )}
                      {s.operation === "categorize" && (
                        <>
                          <Field label="Tipo de reglas">
                            <select
                              className={input}
                              value={s.rules?.some((r) => "equals" in r) ? "equals" : "interval"}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  rules:
                                    e.target.value === "equals"
                                      ? [{ equals: "", value: "Categoría" }]
                                      : [
                                          {
                                            min: 0,
                                            include_min: true,
                                            value: "Categoría",
                                          },
                                        ],
                                })
                              }
                            >
                              <option value="interval">Intervalos numéricos</option>
                              <option value="equals">Valor exacto → categoría</option>
                            </select>
                          </Field>
                          {(s.rules ?? []).map((rule, j) => (
                            <div
                              key={j}
                              className="rounded border border-border p-3 grid sm:grid-cols-3 gap-2"
                            >
                              {"equals" in rule ? (
                                <Field label="Valor de entrada">
                                  <input
                                    className={input}
                                    value={String(rule.equals ?? "")}
                                    onChange={(e) =>
                                      updateStep(s.id, {
                                        rules: s.rules!.map((r, k) =>
                                          k === j ? { ...r, equals: e.target.value } : r,
                                        ),
                                      })
                                    }
                                  />
                                </Field>
                              ) : (
                                <>
                                  <Field label="Mínimo (vacío = sin límite)">
                                    <input
                                      type="number"
                                      className={input}
                                      value={rule.min ?? ""}
                                      onChange={(e) =>
                                        updateStep(s.id, {
                                          rules: s.rules!.map((r, k) =>
                                            k === j
                                              ? {
                                                  ...r,
                                                  min:
                                                    e.target.value === ""
                                                      ? undefined
                                                      : Number(e.target.value),
                                                }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                    <span className="flex gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={rule.include_min !== false}
                                        onChange={(e) =>
                                          updateStep(s.id, {
                                            rules: s.rules!.map((r, k) =>
                                              k === j
                                                ? {
                                                    ...r,
                                                    include_min: e.target.checked,
                                                  }
                                                : r,
                                            ),
                                          })
                                        }
                                      />
                                      Incluir mínimo (≥)
                                    </span>
                                  </Field>
                                  <Field label="Máximo (vacío = sin límite)">
                                    <input
                                      type="number"
                                      className={input}
                                      value={rule.max ?? ""}
                                      onChange={(e) =>
                                        updateStep(s.id, {
                                          rules: s.rules!.map((r, k) =>
                                            k === j
                                              ? {
                                                  ...r,
                                                  max:
                                                    e.target.value === ""
                                                      ? undefined
                                                      : Number(e.target.value),
                                                }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                    <span className="flex gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={rule.include_max === true}
                                        onChange={(e) =>
                                          updateStep(s.id, {
                                            rules: s.rules!.map((r, k) =>
                                              k === j
                                                ? {
                                                    ...r,
                                                    include_max: e.target.checked,
                                                  }
                                                : r,
                                            ),
                                          })
                                        }
                                      />
                                      Incluir máximo (≤)
                                    </span>
                                  </Field>
                                </>
                              )}
                              <Field label="Categoría de salida">
                                <input
                                  className={input}
                                  value={String(rule.value)}
                                  onChange={(e) =>
                                    updateStep(s.id, {
                                      rules: s.rules!.map((r, k) =>
                                        k === j ? { ...r, value: e.target.value } : r,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                              <button
                                className={button}
                                onClick={() =>
                                  updateStep(s.id, {
                                    rules: s.rules!.filter((_, k) => k !== j),
                                  })
                                }
                              >
                                Eliminar regla
                              </button>
                            </div>
                          ))}
                          <button
                            className={button}
                            onClick={() =>
                              updateStep(s.id, {
                                rules: [
                                  ...(s.rules ?? []),
                                  ...(s.rules?.some((r) => "equals" in r)
                                    ? [{ equals: "", value: "Categoría" }]
                                    : [
                                        {
                                          min: 0,
                                          include_min: true,
                                          value: "Categoría",
                                        },
                                      ]),
                                ],
                              })
                            }
                          >
                            + Regla
                          </button>
                          <Field label="Categoría para valores no cubiertos">
                            <input
                              className={input}
                              value={String(s.fallback ?? "")}
                              onChange={(e) =>
                                updateStep(s.id, {
                                  fallback: e.target.value || undefined,
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  ))}
                  <button
                    className={button}
                    onClick={() =>
                      update({
                        steps: [...recipe.steps, defaultStep("number")],
                      })
                    }
                  >
                    + Añadir transformación
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {tab === "json" && (
        <>
          <p className="text-sm text-text-secondary">
            Importa o exporta únicamente las definiciones. Las muestras no se guardan en el archivo.
          </p>
          <div className="relative">
            <button
              type="button"
              onClick={copyJson}
              className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-text-secondary shadow-sm hover:text-text-primary"
              aria-label="Copiar JSON"
            >
              <Copy size={14} />
              {jsonCopied ? "Copiado" : "Copiar"}
            </button>
            <textarea
              aria-label="Configuración JSON"
              className={`${input} min-h-80 font-mono text-[12px] leading-5 pt-10`}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setRawDirty(e.target.value !== JSON.stringify(value, null, 2));
              }}
            />
          </div>
          <div className="flex gap-2">
            <button
              className={button}
              onClick={() => {
                try {
                  onChange(parseConfig(raw));
                  setError("");
                  setMessage("Configuración importada. Valida con una muestra.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Aplicar JSON
            </button>
            <button className={button} onClick={download}>
              <Download size={14} className="inline" /> Exportar
            </button>
            <label className={button}>
              Importar archivo
              <input
                className="hidden"
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    try {
                      onChange(parseConfig(await f.text()));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                }}
              />
            </label>
          </div>
        </>
      )}
      {tab === "templates" && (
        <>
          <div className="flex gap-2">
            <input
              aria-label="Nombre de plantilla"
              className={input}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Nombre de plantilla reutilizable"
            />
            <button
              className={button}
              disabled={!templateName.trim() || !value.recipes.length}
              onClick={async () => {
                try {
                  await saveFeatureTemplate(templateName, value);
                  setTemplates(await getFeatureTemplates());
                  setMessage("Plantilla guardada. Cada modelo conserva una copia independiente.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Guardar plantilla
            </button>
          </div>
          {templates.map((t) => (
            <div key={t.id} className="flex justify-between gap-3 border-t border-border pt-3">
              <span>
                {t.name}
                <small className="block text-text-secondary">
                  {t.configuration.recipes.length} características
                </small>
              </span>
              <div className="flex gap-2">
                <button
                  className={button}
                  onClick={() => {
                    onChange(parseConfig(JSON.stringify(t.configuration)));
                    setMessage("Plantilla copiada. Revisa los mapeos para tu dataset.");
                  }}
                >
                  Usar copia
                </button>
                <button
                  className={button}
                  aria-label={`Eliminar plantilla ${t.name}`}
                  onClick={async () => {
                    try {
                      await deleteFeatureTemplate(t.id);
                      setTemplates(await getFeatureTemplates());
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === "preview" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${source === "Ejemplos ficticios" ? "bg-primary text-white" : "text-text-secondary"}`}
                onClick={() => {
                  setSamples(JSON.stringify(fixture, null, 2));
                  setSource("Ejemplos ficticios");
                }}
              >
                Ejemplos ficticios
              </button>
              <button
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${source.startsWith("Dataset:") ? "bg-primary text-white" : "text-text-secondary"}`}
                disabled={!dataset || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await getDatasetRows({
                      data: { name: dataset, limit: 20 },
                    });
                    setSamples(JSON.stringify(r.rows, null, 2));
                    setSource(`Dataset: ${dataset} · hasta 20 filas`);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Cargar muestra del dataset
              </button>
            </div>
          </div>
          {source === "Ejemplos ficticios" && (
            <p className="text-[12px] text-text-secondary" role="note">
              Los ejemplos usan las rutas del dataset seleccionado, pero sus valores son ficticios.
              Carga una muestra del dataset para comprobar los valores reales.
            </p>
          )}
          <textarea
            aria-label="Muestras JSON"
            className={`${input} min-h-40 font-mono text-[12px] leading-5`}
            value={samples}
            onChange={(e) => {
              setSamples(e.target.value);
              setSource("JSON editado");
            }}
          />
          {sampleError && (
            <p role="alert" className="text-danger text-sm">
              {sampleError}
            </p>
          )}
          <p className="text-xs text-text-secondary">
            Las muestras se envían al evaluador al calcular. No se guardan en el borrador ni en las
            plantillas.
          </p>
          <div className="border-t border-border pt-3 flex flex-wrap gap-3 items-center">
            <button
              className={`${button} bg-primary text-white`}
              disabled={
                busy ||
                invalidField ||
                rawDirty ||
                !!sampleError ||
                !value.recipes.some((r) => r.enabled)
              }
              onClick={evaluate}
            >
              <FlaskConical size={15} className="inline" />{" "}
              {busy ? "Calculando en segundo plano…" : "Validar y calcular"}
            </button>
            <span className="text-xs text-text-secondary">
              {previewTaskId
                ? "La prueba se está ejecutando en el worker."
                : preview
                  ? "Resultados vigentes del evaluador compartido con entrenamiento."
                  : "Valida después de cambiar las definiciones."}
            </span>
          </div>
        </>
      )}
      {tab === "preview" &&
        previewError &&
        (() => {
          const details = friendlyFeatureError(previewError);
          return (
            <div
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-text-primary"
            >
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 shrink-0 text-danger" size={18} aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium">{details.title}</p>
                  <p>{details.explanation}</p>
                  <p className="text-text-secondary">{details.action}</p>
                  {details.recipeId && details.recipeName && (
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-danger/30 bg-background px-3 py-2 text-sm font-medium hover:bg-danger/5"
                      onClick={() => {
                        setTab("recipes");
                        setSelected(details.recipeId!);
                        setMappingSearch(details.recipeName!);
                        setPreviewError("");
                      }}
                    >
                      Revisar mapping “{details.recipeName}”
                    </button>
                  )}
                  <details className="pt-1 text-xs text-text-secondary">
                    <summary className="cursor-pointer">Ver detalle técnico</summary>
                    <p className="mt-1 break-words font-mono">{details.technical}</p>
                  </details>
                </div>
              </div>
            </div>
          );
        })()}
      {tab !== "preview" && error && (
        <p role="alert" className="text-sm text-danger whitespace-pre-wrap">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-text-secondary">
          {message}
        </p>
      )}
      {tab === "preview" &&
        preview &&
        (() => {
          const errorRowIndexes = preview.rows
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => r.features.some((f) => f.status === "error"));
          const errorFeatureNames = [
            ...new Set(
              errorRowIndexes.flatMap(({ r }) =>
                r.features.filter((f) => f.status === "error").map((f) => f.name),
              ),
            ),
          ];
          const displayedRows = showErrorsOnly
            ? errorRowIndexes
            : preview.rows.map((r, i) => ({ r, i }));
          return (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary">
                {preview.rows.length} filas ·{" "}
                {
                  preview.rows.flatMap((r) => r.features).filter((f) => f.status === "missing")
                    .length
                }{" "}
                valores ausentes ·{" "}
                {preview.rows.flatMap((r) => r.features).filter((f) => f.status === "error").length}{" "}
                errores
              </p>
              {errorRowIndexes.length > 0 && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm"
                >
                  <p className="font-medium text-danger">
                    No puedes continuar todavía: hay errores de transformación en{" "}
                    {errorRowIndexes.length} fila
                    {errorRowIndexes.length === 1 ? "" : "s"}.
                  </p>
                  <p className="mt-1 text-text-secondary">
                    Afectan: {errorFeatureNames.slice(0, 3).join(", ")}
                    {errorFeatureNames.length > 3 ? ` y ${errorFeatureNames.length - 3} más` : ""}.
                    Selecciona una fila con error e inspecciónala; después usa “Expandir todo” para
                    ver el motivo técnico.
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-danger underline"
                    onClick={() => setRow(errorRowIndexes[0].i)}
                  >
                    Inspeccionar la primera fila con error
                  </button>
                </div>
              )}
              <button
                type="button"
                className={`${button} ${showErrorsOnly ? "bg-primary text-white" : ""}`}
                disabled={errorRowIndexes.length === 0}
                onClick={() => setShowErrorsOnly((current) => !current)}
              >
                {showErrorsOnly
                  ? "Ver todas las filas"
                  : `Mostrar solo filas con errores (${errorRowIndexes.length})`}
              </button>
              {showErrorsOnly && errorRowIndexes.length === 0 && (
                <p className="text-xs text-text-secondary">Ninguna fila tiene errores.</p>
              )}
              <div className="w-full max-w-[1000px] overflow-x-auto overscroll-x-contain scroll-smooth">
                <table className="min-w-max text-sm text-left">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      {value.recipes
                        .filter((r) => r.enabled)
                        .map((r) => (
                          <th className="p-2" key={r.id}>
                            {r.name}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map(({ r, i }) => (
                      <tr
                        key={i}
                        className={`border-t border-border ${row === i ? "bg-primary/5" : ""}`}
                      >
                        <td>
                          <button className="underline p-2" onClick={() => setRow(i)}>
                            {i + 1} · inspeccionar
                          </button>
                        </td>
                        {value.recipes
                          .filter((r) => r.enabled)
                          .map((f) => (
                            <td className="p-2 font-mono" key={f.id}>
                              {show(r.values[f.name])}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const currentFeatures =
                  preview.rows[Math.min(row, preview.rows.length - 1)]?.features ?? [];
                return (
                  <div className="flex gap-2">
                    <button
                      className={button}
                      onClick={() =>
                        setOpenDetails((current) => ({
                          ...current,
                          ...Object.fromEntries(currentFeatures.map((f) => [f.id, true])),
                        }))
                      }
                    >
                      Expandir todo
                    </button>
                    <button
                      className={button}
                      onClick={() =>
                        setOpenDetails((current) => ({
                          ...current,
                          ...Object.fromEntries(currentFeatures.map((f) => [f.id, false])),
                        }))
                      }
                    >
                      Colapsar todo
                    </button>
                  </div>
                );
              })()}
              {preview.rows[Math.min(row, preview.rows.length - 1)]?.features.map((f) => (
                <details
                  key={f.id}
                  open={openDetails[f.id] ?? false}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open;
                    setOpenDetails((current) => ({ ...current, [f.id]: isOpen }));
                  }}
                  className="rounded border border-border p-3"
                >
                  <summary className="text-sm cursor-pointer">
                    {f.name} · {f.status} · {show(f.value)}
                    {value.recipes.find((recipe) => recipe.id === f.id)?.source === "history" &&
                    f.history
                      ? ` · ${f.history.included.length} eventos incluidos`
                      : ""}
                    <span
                      className={
                        f.status !== "ok"
                          ? "text-danger"
                          : f.error
                            ? "text-warning"
                            : "text-text-secondary"
                      }
                    >
                      {f.status !== "ok"
                        ? " · Requiere revisión"
                        : f.error
                          ? " · Se usó un valor de respaldo"
                          : " · Ver detalle del procesamiento"}
                    </span>
                  </summary>
                  {f.error && (
                    <p className={`text-sm ${f.status === "ok" ? "text-warning" : "text-danger"}`}>
                      {f.status === "ok"
                        ? `Valor de respaldo usado porque falló: ${f.error}`
                        : f.error}
                    </p>
                  )}
                  <ol className="text-xs space-y-1 mt-3">
                    {f.trace.map((s, i) => (
                      <li key={i} className={`break-all ${s.skipped ? "text-warning" : ""}`}>
                        {i + 1}. {operations[s.operation] ?? s.operation}: {show(s.value)}
                        {s.skipped && " · omitido: entrada ausente"}
                      </li>
                    ))}
                  </ol>
                  {value.recipes.find((recipe) => recipe.id === f.id)?.source === "history" &&
                    f.history && (
                      <div className="text-xs mt-3 space-y-1">
                        <p>
                          Incluidos (índice del array): {f.history.included.join(", ") || "ninguno"}
                        </p>
                        {f.history.excluded.map((e, i) => (
                          <p key={i}>
                            Evento {e.index}: {e.reason}
                          </p>
                        ))}
                      </div>
                    )}
                </details>
              ))}
            </div>
          );
        })()}
    </section>
  );
}
