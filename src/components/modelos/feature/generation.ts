import {
  suggestedTransformForType,
  suspectGuardForName,
  type FeatureGuard,
  type FieldRole,
  type SuggestedTransform,
} from "@/lib/alertSchemaRoles";
import type { Recipe, RecipeStep } from "@/lib/api/feature-recipes.functions";
import { resolveSchemaField, type SchemaIndex } from "./schemaFields";

export const MAX_RECIPES = 200;
const uid = () => crypto.randomUUID();
const step = (operation: string): RecipeStep => ({ id: uid(), operation });

const slug = (path: string) => {
  const clean = path
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_");
  return (/^[A-Za-z]/.test(clean) ? clean : `campo_${clean}`).slice(0, 80);
};

/**
 * How each suggested treatment maps onto operations the workspace supports:
 * pass -> number: no step (the engine coerces to number); bool: to_boolean.
 * categorize -> output string, no step (a categorical text passes straight).
 * datetime_parts -> two variables (hour, weekday).
 * count -> `count` over the list.
 */
export function recipesForTransform(
  transform: SuggestedTransform,
  type: string | undefined,
  path: string,
  name: (base: string) => string,
): Recipe[] {
  const base = (suffix: string, patch: Partial<Recipe>): Recipe => ({
    id: uid(),
    name: name(`${slug(path)}${suffix}`),
    description: "",
    enabled: true,
    output_type: "string",
    source: "current",
    path,
    missing: { policy: "missing" },
    steps: [],
    ...patch,
  });
  switch (transform) {
    case "pass":
      return type === "bool"
        ? [base("", { output_type: "boolean", steps: [step("to_boolean")] })]
        : [base("", { output_type: "number" })];
    case "datetime_parts":
      return [
        base("_hora", { output_type: "number", steps: [step("hour")] }),
        base("_dia_semana", { output_type: "number", steps: [step("weekday")] }),
      ];
    case "count":
      return [base("_conteo", { output_type: "number", steps: [step("count")] })];
    default:
      return [base("", { output_type: "string" })];
  }
}

export function createFieldMappings(
  fieldPaths: string[],
  existing: Recipe[],
  index: SchemaIndex | null = null,
): Recipe[] {
  const names = new Set(existing.map((recipe) => recipe.name));
  const mapped = new Set(
    existing
      .filter((recipe) => recipe.source === "current")
      .map((recipe) => recipe.path?.replace(/^\$\./, "")),
  );
  const unique = (candidate: string) => {
    let name = candidate;
    let suffix = 2;
    while (names.has(name)) {
      const ending = `_${suffix++}`;
      name = `${candidate.slice(0, 80 - ending.length)}${ending}`;
    }
    names.add(name);
    return name;
  };
  return [...new Set(fieldPaths)]
    .filter((path) => !mapped.has(path))
    .flatMap((path) => {
      const info = resolveSchemaField(index, path);
      if (index && info?.guard?.level === "exclude") return [];
      const transform = info ? suggestedTransformForType(info.field.type) : "categorize";
      return recipesForTransform(transform, info?.field.type, path, unique);
    });
}

export type GenerationLevel = "ok" | "warn" | "suspect" | "exclude";

/** One field proposed for a variable, with the rule that applies to it. */
export type GenerationCandidate = {
  path: string;
  label: string;
  type?: string;
  role?: FieldRole;
  /** False for dataset columns the active schema does not know. */
  inSchema: boolean;
  guard: FeatureGuard;
  level: GenerationLevel;
  transform: SuggestedTransform;
  /** How many variables materializing it creates (a date makes two). */
  recipeCount: number;
};

const clean = (path: string) => path.replace(/^\$\./, "");

const TARGET_GUARD: FeatureGuard = {
  level: "exclude",
  kind: "label",
  reason: "Es el campo objetivo del modelo: usarlo como variable filtra la respuesta.",
};

function candidate(
  path: string,
  label: string,
  type: string | undefined,
  guard: FeatureGuard,
  inSchema: boolean,
  role?: FieldRole,
): GenerationCandidate {
  const transform = type ? suggestedTransformForType(type as never) : "categorize";
  return {
    path,
    label,
    type,
    role,
    inSchema,
    guard,
    level: guard?.level ?? "ok",
    transform,
    recipeCount: transform === "datetime_parts" ? 2 : 1,
  };
}

/**
 * Fields the analyst can turn into variables, with the guard of each. Schema
 * fields come first (history arrays are skipped); dataset columns the schema
 * does not know follow, judged by name. Fields that already have a variable
 * are left out, so confirming twice never duplicates.
 */
export function proposeGenerationCandidates({
  index,
  datasetPaths,
  existing,
  target,
  historyPath = "",
}: {
  index: SchemaIndex | null;
  datasetPaths: string[];
  existing: Recipe[];
  target: string;
  historyPath?: string;
}): GenerationCandidate[] {
  const mappedPaths = new Set<string>();
  const mappedIds = new Set<string>();
  for (const recipe of existing) {
    if (recipe.source !== "current" || !recipe.path) continue;
    mappedPaths.add(clean(recipe.path));
    const info = resolveSchemaField(index, recipe.path);
    if (info) mappedIds.add(info.field.id);
  }
  const targetInfo = target ? resolveSchemaField(index, target) : undefined;
  const underHistory = (path: string) =>
    !!historyPath && (path === historyPath || path.startsWith(`${historyPath}.`));
  const result: GenerationCandidate[] = [];
  const seen = new Set<string>();
  for (const info of index?.fields ?? []) {
    if (info.role === "history" || underHistory(info.path)) continue;
    if (mappedPaths.has(info.path) || mappedIds.has(info.field.id)) continue;
    const isTarget = !!target && (info.path === target || targetInfo?.field.id === info.field.id);
    result.push(
      candidate(
        info.path,
        info.field.field_name || info.field.field,
        info.field.type,
        isTarget && info.guard?.level !== "exclude" ? TARGET_GUARD : info.guard,
        true,
        info.role,
      ),
    );
    seen.add(info.path);
  }
  for (const raw of datasetPaths) {
    const path = clean(raw);
    if (seen.has(path) || mappedPaths.has(path) || underHistory(path)) continue;
    if (index && resolveSchemaField(index, path)) continue;
    seen.add(path);
    result.push(candidate(path, path, undefined, suspectGuardForName(path), false));
  }
  if (target && !seen.has(target) && !targetInfo && !mappedPaths.has(target))
    result.push(candidate(target, target, undefined, TARGET_GUARD, false));
  return result;
}

/** Whether the rules let this candidate be pre-marked. */
export const isPremarked = (c: GenerationCandidate) => c.level === "ok" || c.level === "warn";
