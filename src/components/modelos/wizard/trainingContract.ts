import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import { deriveFieldRole, featureGuard, suspectGuardForName } from "@/lib/alertSchemaRoles";
import type { Recipe } from "@/lib/api/feature-recipes.functions";

export const DRAFT_KEY = "aria.model-training.draft.v1";

const OPERATION_LABELS: Record<string, string> = {
  select: "Seleccionar",
  number: "Número",
  abs: "Valor absoluto",
  log: "Logaritmo",
  add: "Sumar",
  subtract: "Restar",
  multiply: "Multiplicar",
  divide: "Dividir",
  hour: "Hora",
  weekday: "Día de la semana",
  elapsed_seconds: "Segundos transcurridos",
  filter: "Filtrar",
  count: "Contar",
  sum: "Sumar valores",
  mean: "Promedio",
  median: "Mediana",
  min: "Mínimo",
  max: "Máximo",
  distinct_count: "Valores distintos",
  recency: "Recencia",
  ratio: "Razón",
  difference: "Diferencia",
  categorize: "Categorizar",
  to_array: "A lista",
  to_boolean: "A sí/no",
  fill_missing: "Rellenar vacíos",
};

export const operationLabel = (operation: string) => OPERATION_LABELS[operation] ?? operation;

/** Normalizes a payload/dataset path so `$.a.b[0]` and `a.b` compare equal. */
function normalizePath(path: string) {
  return path
    .trim()
    .replace(/^\$\.?/, "")
    .replace(/\[(\d*|\*)\]/g, "")
    .toLowerCase();
}

function schemaNames(field: AlertSchemaField) {
  return [field.field, field.field_name, field.field_ds_loc]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalizePath);
}

/**
 * Finds the schema field a dataset column / payload path refers to. `aliases`
 * maps a dataset column to the alert fields it was mapped from.
 */
export function findSchemaField(
  path: string,
  fields: AlertSchemaField[],
  aliases: Record<string, string[]> = {},
): AlertSchemaField | null {
  const candidates = [path, ...(Object.hasOwn(aliases, path) ? aliases[path] : [])].map(
    normalizePath,
  );
  for (const field of fields) {
    const names = schemaNames(field);
    if (candidates.some((c) => c && names.some((n) => c === n || c.startsWith(`${n}.`))))
      return field;
  }
  return null;
}

/** Schema fields with the label role, offered first as the training target. */
export function labelFields(schema: AlertSchemaVersion | null | undefined) {
  return (schema?.fields ?? []).filter((f) => deriveFieldRole(f) === "label");
}

/** Dataset columns that correspond to a label field of the schema. */
export function suggestedTargets(
  columns: string[],
  schema: AlertSchemaVersion | null | undefined,
  aliases: Record<string, string[]> = {},
) {
  const labels = labelFields(schema);
  if (!labels.length) return [];
  return columns.filter((c) => findSchemaField(c, labels, aliases));
}

export type TargetAssessment = "unknown" | "label" | "not_label";

/** `unknown` when there is no schema (or no label field) to compare against. */
export function assessTarget(
  target: string,
  schema: AlertSchemaVersion | null | undefined,
  aliases: Record<string, string[]> = {},
): TargetAssessment {
  if (!target || !schema || !labelFields(schema).length) return "unknown";
  return findSchemaField(target, labelFields(schema), aliases) ? "label" : "not_label";
}

function currentPaths(recipe: Recipe): string[] {
  if (recipe.source !== "current") return [];
  const paths: string[] = [];
  if (recipe.path) paths.push(recipe.path);
  for (const step of recipe.steps) {
    if (step.enabled === false) continue;
    if (step.path) paths.push(step.path);
    if (step.current_path) paths.push(step.current_path);
    for (const c of step.conditions ?? []) if (c.current_path) paths.push(c.current_path);
  }
  return paths;
}

export type ContractIssue = {
  variable: string;
  field: string;
  reason: string;
  kind?: "label" | "agent_result" | "identifier" | "post_decision" | "sensitive";
};

export type TrainingContract = {
  schemaVersion: number | null;
  activeCount: number;
  variables: { id: string; name: string; steps: string[] }[];
  /** Hard rules: block training. */
  leaks: ContractIssue[];
  /** Heuristic by name (identifier / after the decision): reviewed, not blocking. */
  suspects: ContractIssue[];
  sensitive: ContractIssue[];
};

export function buildTrainingContract(
  recipes: Recipe[],
  schema: AlertSchemaVersion | null | undefined,
  aliases: Record<string, string[]> = {},
): TrainingContract {
  const active = recipes.filter((r) => r.enabled);
  const leaks: ContractIssue[] = [];
  const sensitive: ContractIssue[] = [];
  const suspects: ContractIssue[] = [];
  const seen = new Set<string>();
  for (const recipe of active) {
    for (const path of currentPaths(recipe)) {
      const field = findSchemaField(path, schema?.fields ?? [], aliases);
      // A path the schema does not know (or no schema) is judged by its name only.
      const guard = field ? featureGuard(field) : suspectGuardForName(normalizePath(path));
      if (!guard) continue;
      const label = field ? field.field_name || field.field : path.replace(/^\$\.?/, "");
      const key = `${guard.level}|${recipe.id}|${field?.id ?? label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const issue: ContractIssue = {
        variable: recipe.name,
        field: label,
        reason: guard.reason,
        kind: guard.kind,
      };
      (guard.level === "exclude" ? leaks : guard.level === "suspect" ? suspects : sensitive).push(
        issue,
      );
    }
  }
  return {
    schemaVersion: schema?.version ?? null,
    activeCount: active.length,
    variables: active.map((r) => ({
      id: r.id,
      name: r.name,
      steps: r.steps.filter((s) => s.enabled !== false).map((s) => s.operation),
    })),
    leaks,
    suspects,
    sensitive,
  };
}

/** Heading of a blocking issue by what makes the field unusable. */
export const leakTitle = (issue: Pick<ContractIssue, "kind">) =>
  issue.kind === "identifier"
    ? "Identificador"
    : issue.kind === "post_decision"
      ? "Dato posterior a la decisión"
      : "Fuga de datos";

export const leakBlocker = (issue: ContractIssue) =>
  `${leakTitle(issue)}: la variable “${issue.variable}” usa el campo “${issue.field}”. ${issue.reason}`;

/** Reads the schema version stored in a saved draft; old drafts have none. */
export function draftSchemaVersion(draft: unknown): number | null {
  const v = (draft as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}
