import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import {
  deriveFieldRole,
  featureGuard,
  FIELD_ROLE_LABELS,
  suspectGuardForName,
  type FeatureGuard,
  type FieldRole,
} from "@/lib/alertSchemaRoles";
import type { Recipe } from "@/lib/api/feature-recipes.functions";

export type SchemaFieldInfo = {
  path: string;
  field: AlertSchemaField;
  role: FieldRole;
  guard: FeatureGuard;
};

export type SchemaIndex = {
  version: number;
  fields: SchemaFieldInfo[];
  aliases: Record<string, string[]>;
};

/** Path a schema field takes inside a dataset row / alert payload. */
export function schemaFieldPath(field: Pick<AlertSchemaField, "field" | "field_ds_loc">): string {
  return field.field_ds_loc || field.field;
}

const clean = (path: string | undefined) => (path ?? "").replace(/^\$\./, "");

export function buildSchemaIndex(
  schema: AlertSchemaVersion | null | undefined,
  aliases: Record<string, string[]> = {},
): SchemaIndex | null {
  if (!schema) return null;
  return {
    version: schema.version,
    aliases,
    fields: schema.fields.map((field) => ({
      path: schemaFieldPath(field),
      field,
      role: deriveFieldRole(field),
      guard: featureGuard(field),
    })),
  };
}

/** Finds the schema field a path refers to (by location, name or dataset alias). */
export function resolveSchemaField(
  index: SchemaIndex | null,
  rawPath: string | undefined,
): SchemaFieldInfo | undefined {
  const path = clean(rawPath);
  if (!index || !path) return undefined;
  const aliasNames = Object.hasOwn(index.aliases, path) ? index.aliases[path] : [];
  return index.fields.find(
    (info) =>
      info.path === path || info.field.field === path || aliasNames.includes(info.field.field),
  );
}

/** Fields offered as input of a variable of the current operation, grouped by role. */
export function inputGroups(
  index: SchemaIndex,
): { role: FieldRole; label: string; items: SchemaFieldInfo[] }[] {
  const items = index.fields.filter(
    (info) => info.guard?.level !== "exclude" && info.role === "alert",
  );
  return items.length ? [{ role: "alert", label: FIELD_ROLE_LABELS.alert, items }] : [];
}

export function excludedFields(index: SchemaIndex): SchemaFieldInfo[] {
  return index.fields.filter((info) => info.guard?.level === "exclude");
}

/** Schema fields allowed as the history array of a history variable. */
export function historyFields(index: SchemaIndex): SchemaFieldInfo[] {
  return index.fields.filter((info) => info.role === "history" && info.guard?.level !== "exclude");
}

export type GuardEntry = { path: string; reason: string; label: string; kind?: string };
export type RecipeGuards = {
  excluded: GuardEntry[];
  /** Heuristic by name (identifier / after the decision): not blocking, needs review. */
  suspect: GuardEntry[];
  sensitive: GuardEntry[];
};

/** Alert-side paths a variable reads (its own path plus step references). */
export function alertPathsUsed(recipe: Recipe): string[] {
  const used: string[] = [];
  if (recipe.source === "current" && recipe.path) used.push(recipe.path);
  for (const step of recipe.steps) {
    if (step.enabled === false) continue;
    if (step.current_path) used.push(step.current_path);
    for (const condition of step.conditions ?? [])
      if (condition.current_path) used.push(condition.current_path);
  }
  return [...new Set(used)];
}

/**
 * Guards of the alert fields a variable reads. A path the schema does not know
 * (or no schema at all) falls back to the name heuristic.
 */
export function recipeGuards(recipe: Recipe, index: SchemaIndex | null): RecipeGuards {
  const result: RecipeGuards = { excluded: [], suspect: [], sensitive: [] };
  for (const path of alertPathsUsed(recipe)) {
    const info = resolveSchemaField(index, path);
    const guard = info ? info.guard : suspectGuardForName(clean(path));
    if (!guard) continue;
    const entry: GuardEntry = {
      path,
      reason: guard.reason,
      label: info ? info.field.field_name || info.field.field : clean(path),
      kind: guard.kind,
    };
    (guard.level === "exclude"
      ? result.excluded
      : guard.level === "suspect"
        ? result.suspect
        : result.sensitive
    ).push(entry);
    // A sensitive field that is also suspect (customer_id) must still show the privacy notice.
    if (info?.field.is_sensible && guard.level === "suspect") {
      const strategy = info.field.sensitivity_strategy;
      result.sensitive.push({
        ...entry,
        kind: "sensitive",
        reason: strategy
          ? `Dato sensible (${strategy}).`
          : "Dato sensible sin estrategia definida.",
      });
    }
  }
  return result;
}
