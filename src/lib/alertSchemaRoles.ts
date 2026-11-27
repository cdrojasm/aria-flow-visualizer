import type { AlertSchemaField, AlertSchemaFieldType } from "@/lib/api/alertSchema.functions";

/**
 * Single "role" a schema field plays. Derived from the existing flags, so no
 * backend contract change: the backend keeps is_alert/is_history/is_label and
 * data_source. Precedence mirrors the grouping the schema editor already used.
 */
export type FieldRole = "history" | "label" | "agent_result" | "alert";

export const FIELD_ROLE_LABELS: Record<FieldRole, string> = {
  alert: "Dato de la alerta",
  history: "Historial",
  label: "Desenlace (etiqueta)",
  agent_result: "Resultado de ARIA",
};

export function deriveFieldRole(
  field: Pick<AlertSchemaField, "is_history" | "is_label" | "data_source">,
): FieldRole {
  if (field.is_history) return "history";
  if (field.is_label) return "label";
  if (field.data_source === "aria") return "agent_result";
  return "alert";
}

/** Flags to write back when the user picks a role in the UI. */
export function flagsForRole(role: FieldRole): Pick<
  AlertSchemaField,
  "is_history" | "is_label" | "is_alert"
> & {
  data_source?: AlertSchemaField["data_source"];
} {
  switch (role) {
    case "history":
      return { is_history: true, is_label: false, is_alert: false };
    case "label":
      return { is_history: false, is_label: true, is_alert: false };
    case "agent_result":
      return { is_history: false, is_label: false, is_alert: false, data_source: "aria" };
    default:
      return { is_history: false, is_label: false, is_alert: true };
  }
}

/**
 * Why a field must not be offered as a plain model input, if so.
 * - exclude: hard rule (label, ARIA output, flagged identifier / not available at decision).
 * - suspect: heuristic by name when the schema has not flagged anything. Excluded by
 *   default in generated variables, but the user can include it explicitly.
 * - warn: allowed but needs attention (sensitive data).
 */
export type FeatureGuard = {
  level: "exclude" | "suspect" | "warn";
  reason: string;
  kind?: "label" | "agent_result" | "identifier" | "post_decision" | "sensitive";
} | null;

// Identifiers: eventid, customer_id, sessionId, uuid... ("isValid" must not match).
const IDENTIFIER_NAME = /(^|[_.])(id|uuid|guid)$|[a-z]Id$|^[a-z]+id$/i;
const IDENTIFIER_FALSE_POSITIVE = /(valid|paid|void|rapid|solid|fluid|invalid|android)$/i;
// Values that only exist after someone decides or reviews the case.
const POST_DECISION_NAME =
  /marcaci[oó]n|review|revisi[oó]n|desenlace|outcome|resoluci[oó]n|resolution|analista|analyst|etiqueta|feedback|chargeback|(^|[_.])label|output_/i;

/** Name-only heuristic, used for dataset paths and for schema fields without flags. */
export function suspectGuardForName(name: string): FeatureGuard {
  const leaf = name.split(".").at(-1) ?? name;
  if (POST_DECISION_NAME.test(leaf))
    return {
      level: "suspect",
      kind: "post_decision",
      reason:
        "Por su nombre parece generarse después de decidir (revisión o marcación): filtra la respuesta.",
    };
  if (IDENTIFIER_NAME.test(leaf) && !IDENTIFIER_FALSE_POSITIVE.test(leaf))
    return {
      level: "suspect",
      kind: "identifier",
      reason: "Por su nombre parece un identificador: el modelo lo memoriza en vez de aprender.",
    };
  return null;
}

export function featureGuard(field: AlertSchemaField): FeatureGuard {
  if (field.is_label)
    return {
      level: "exclude",
      kind: "label",
      reason: "Es la etiqueta: usarla como variable filtra la respuesta.",
    };
  if (field.data_source === "aria")
    return {
      level: "exclude",
      kind: "agent_result",
      reason: "Lo produce ARIA después de evaluar: no existe al momento de decidir.",
    };
  if (field.available_at_decision === false)
    return {
      level: "exclude",
      kind: "post_decision",
      reason: "El esquema indica que no está disponible al momento de decidir.",
    };
  if (field.is_identifier === true)
    return {
      level: "exclude",
      kind: "identifier",
      reason: "El esquema lo marca como identificador: no aporta señal y se memoriza.",
    };
  // A name that looks like an identifier / post-decision value beats "sensitive":
  // customer_id is both, and must not be proposed by default. Keep the sensitive note.
  const suspect = suspectGuardForName(field.field_ds_loc || field.field);
  if (suspect) {
    return field.is_sensible
      ? { ...suspect, reason: `${suspect.reason} Además es un dato sensible.` }
      : suspect;
  }
  if (field.is_sensible)
    return {
      level: "warn",
      kind: "sensitive",
      reason: field.sensitivity_strategy
        ? `Dato sensible (${field.sensitivity_strategy}).`
        : "Dato sensible sin estrategia definida.",
    };
  return null;
}

export type SuggestedTransform = "pass" | "categorize" | "datetime_parts" | "count";

/** Default treatment when generating a variable for a field of this type. */
export function suggestedTransformForType(type: AlertSchemaFieldType): SuggestedTransform {
  switch (type) {
    case "number":
    case "bool":
      return "pass";
    case "date":
    case "datetime":
      return "datetime_parts";
    case "list":
      return "count";
    default:
      return "categorize";
  }
}
