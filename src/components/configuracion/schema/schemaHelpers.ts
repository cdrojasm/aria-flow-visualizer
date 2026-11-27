import type {
  AlertSchemaField,
  AlertSchemaFieldType,
  AlertSchemaUsage,
  AlertSchemaVersion,
} from "@/lib/api/alertSchema.functions";

/** Spanish label for the backend status values (draft/proposed/active/historical/rejected). */
export const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  proposed: "En revisión",
  active: "Activa",
  historical: "Archivada",
  rejected: "Rechazada",
};

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Sin versión activa";
  return STATUS_LABELS[status] ?? "Estado desconocido";
}

/** The nine essential roles the platform reads by name. */
export const ESSENTIAL_ROLES: {
  name: string;
  type: AlertSchemaFieldType;
  required: boolean;
  consumers: string;
}[] = [
  { name: "event_id", type: "string", required: true, consumers: "Señales de ARIC, trazabilidad" },
  {
    name: "event_time",
    type: "datetime",
    required: true,
    consumers: "Workflow, perfilado e historial",
  },
  {
    name: "event_type",
    type: "string",
    required: true,
    consumers: "Segmentación, métricas y tags",
  },
  {
    name: "channel",
    type: "string",
    required: true,
    consumers: "Segmentación, métricas e historial",
  },
  { name: "entrypoint", type: "string", required: true, consumers: "Segmentación, métricas" },
  { name: "amount", type: "number", required: true, consumers: "Perfilado y métricas" },
  { name: "customer_id", type: "string", required: true, consumers: "Consultas al host" },
  { name: "account_id", type: "string", required: false, consumers: "Historial al host" },
  { name: "session_id", type: "string", required: false, consumers: "Señales de ARIC" },
];

/** Human message for an API failure: no HTTP code, no raw JSON. */
export function humanError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const status = /->\s*(\d{3}):?\s*([\s\S]*)$/.exec(message);
  const code = status?.[1] ?? /\b(409|422)\b/.exec(message)?.[1] ?? "";
  let detail = status?.[2]?.trim() ?? "";
  try {
    const parsed = JSON.parse(detail) as { detail?: unknown };
    if (typeof parsed.detail === "string") detail = parsed.detail;
    else if (parsed.detail !== undefined) detail = "";
  } catch {
    if (detail.startsWith("{") || detail.startsWith("[")) detail = "";
  }
  if (code === "409")
    return "La versión activa cambió mientras editabas. Recarga la página y vuelve a basar el borrador.";
  if (code === "422")
    return detail
      ? `El esquema no cumple las validaciones: ${detail}`
      : "El esquema no cumple las validaciones. Revisa los campos marcados.";
  if (code === "403") return "No tienes permiso para hacer esta acción sobre el esquema.";
  if (code === "401") return "Tu sesión terminó. Vuelve a iniciar sesión.";
  if (code) return "No fue posible completar la operación. Intenta de nuevo.";
  return message && !message.includes("->") ? message : "No fue posible completar la operación.";
}

/* ───────────── comparison (diff) ───────────── */

export type DiffAttribute = { name: string; before: unknown; after: unknown };
export type DiffEntry = {
  kind: "added" | "changed" | "removed";
  field: string;
  attributes: DiffAttribute[];
  typeOrRole: boolean;
};
export type DiffRole = { role: string; before: string | null; after: string | null };
export type DiffSummary = {
  entries: DiffEntry[];
  roles: DiffRole[];
  added: number;
  removed: number;
  typeOrRole: number;
  other: number;
  total: number;
};

const TYPE_OR_ROLE_ATTRIBUTES = new Set([
  "type",
  "is_alert",
  "is_history",
  "is_label",
  "data_source",
]);

export const ATTRIBUTE_LABELS: Record<string, string> = {
  type: "tipo",
  is_alert: "dato de la alerta",
  is_history: "historial",
  is_label: "etiqueta",
  data_source: "origen",
  is_core: "core",
  is_mandatory: "obligatorio",
  is_sensible: "sensible",
  sensitivity_strategy: "estrategia sensible",
  field_name: "nombre visible",
  field_ds_loc: "ubicación",
  group: "grupo",
  description: "descripción",
  use_locale: "locale",
  locale_type: "tipo de locale",
  is_identifier: "identificador",
  available_at_decision: "disponible al decidir",
};

function entryName(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ["field", "field_name", "field_id", "id", "name"]) {
      if (typeof record[key] === "string" && record[key]) return record[key] as string;
    }
  }
  return "(campo sin nombre)";
}

/**
 * Normalizes the backend `comparison` ({added, changed, removed,
 * role_reassignments}). Returns null when the shape is not recognized so the
 * caller can fall back to a raw-JSON view.
 */
export function summarizeComparison(comparison: unknown): DiffSummary | null {
  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) return null;
  const record = comparison as Record<string, unknown>;
  const known = ["added", "changed", "removed", "role_reassignments"];
  const keys = Object.keys(record);
  if (keys.length > 0 && !keys.some((key) => known.includes(key))) return null;
  if (known.some((key) => record[key] !== undefined && !Array.isArray(record[key]))) return null;
  const list = (key: string) => (record[key] as unknown[] | undefined) ?? [];
  const entries: DiffEntry[] = [
    ...list("added").map<DiffEntry>((item) => ({
      kind: "added",
      field: entryName(item),
      attributes: [],
      typeOrRole: false,
    })),
    ...list("changed").map<DiffEntry>((item) => {
      const attrs =
        item && typeof item === "object"
          ? ((item as { attributes?: Record<string, { before?: unknown; after?: unknown }> })
              .attributes ?? {})
          : {};
      const attributes = Object.entries(attrs).map(([name, value]) => ({
        name,
        before: value?.before,
        after: value?.after,
      }));
      return {
        kind: "changed",
        field: entryName(item),
        attributes,
        typeOrRole: attributes.some((attribute) => TYPE_OR_ROLE_ATTRIBUTES.has(attribute.name)),
      };
    }),
    ...list("removed").map<DiffEntry>((item) => ({
      kind: "removed",
      field: entryName(item),
      attributes: [],
      typeOrRole: false,
    })),
  ];
  const roles = list("role_reassignments").map<DiffRole>((item) => {
    const value = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      role: String(value.role ?? "—"),
      before: typeof value.before === "string" ? value.before : null,
      after: typeof value.after === "string" ? value.after : null,
    };
  });
  const changed = entries.filter((entry) => entry.kind === "changed");
  const typeOrRole = changed.filter((entry) => entry.typeOrRole).length;
  return {
    entries,
    roles,
    added: entries.filter((entry) => entry.kind === "added").length,
    removed: entries.filter((entry) => entry.kind === "removed").length,
    typeOrRole,
    other: changed.length - typeOrRole,
    total: entries.length + roles.length,
  };
}

/** Flags absent in old versions read as their default (not identifier, available at decision). */
function withFlagDefaults(value: unknown, key: string): unknown {
  if (value === undefined && key === "is_identifier") return false;
  if (value === undefined && key === "available_at_decision") return true;
  return value;
}

/** Same shape as the backend comparison, computed locally for unsaved drafts. */
export function compareLocally(
  base: AlertSchemaVersion | null,
  candidate: { fields: AlertSchemaField[]; field_roles: Record<string, string> },
): Record<string, unknown> {
  const old = new Map((base?.fields ?? []).map((field) => [field.id, field]));
  const next = new Map(candidate.fields.map((field) => [field.id, field]));
  const added = [...next.values()].filter((field) => !old.has(field.id));
  const removed = [...old.values()].filter((field) => !next.has(field.id));
  const changed = [...next.values()].flatMap((after) => {
    const before = old.get(after.id);
    if (!before) return [];
    const attributes: Record<string, { before: unknown; after: unknown }> = {};
    (Object.keys(after) as (keyof AlertSchemaField)[]).forEach((key) => {
      const prior = withFlagDefaults(before[key], key);
      const next = withFlagDefaults(after[key], key);
      if (prior !== next) attributes[key] = { before: prior, after: next };
    });
    return Object.keys(attributes).length
      ? [{ field_id: after.id, field: after.field, attributes }]
      : [];
  });
  const previous = base?.field_roles ?? {};
  const role_reassignments = [
    ...new Set([...Object.keys(previous), ...Object.keys(candidate.field_roles)]),
  ]
    .filter((role) => (previous[role] || null) !== (candidate.field_roles[role] || null))
    .map((role) => ({
      role,
      before: previous[role] || null,
      after: candidate.field_roles[role] || null,
    }));
  return { added, changed, removed, role_reassignments };
}

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === true) return "sí";
  if (value === false) return "no";
  return String(value);
}

/* ───────────── "Usado por" ───────────── */

const KIND_LABELS: Record<string, string> = {
  configuration: "Configuración",
  xgboost_model: "Modelo",
};

export function impactLabel(item: Record<string, unknown>): string {
  const kind = KIND_LABELS[String(item.kind ?? "")] ?? "Consumidor activo";
  const detail = item.name ?? item.tag ?? (item.version !== undefined ? `v${item.version}` : null);
  return detail ? `${kind} · ${String(detail)}` : kind;
}

/**
 * Per-field consumers. The backend impact is computed per version (not per
 * field); we only attribute an item to a field when the item names it
 * (`fields`, `field`, `field_id`). Otherwise the column shows "—".
 */
export function usedBy(field: AlertSchemaField, impact: Record<string, unknown>[]): string[] {
  return impact
    .filter((item) => {
      const names = [
        ...(Array.isArray(item.fields) ? (item.fields as unknown[]) : []),
        item.field,
        item.field_id,
      ].map(String);
      return names.includes(field.id) || names.includes(field.field);
    })
    .map(impactLabel);
}

export type FieldConsumer = { label: string; title: string };

const CONSUMER_KIND_LABELS: Record<string, string> = {
  model: "Modelo",
  configuration: "Configuración",
};

/** Consumers of a field: the usage endpoint first, then the legacy impact labels. */
export function fieldConsumers(
  field: AlertSchemaField,
  usage: AlertSchemaUsage | null | undefined,
  impact: Record<string, unknown>[],
): FieldConsumer[] {
  const fromApi = (usage?.fields[field.id] ?? []).map((consumer) => {
    const kind = CONSUMER_KIND_LABELS[consumer.kind] ?? consumer.kind;
    return {
      label: `${kind} · ${consumer.name}`,
      title: `${kind} ${consumer.name} (${consumer.ref})`,
    };
  });
  const fromImpact = usedBy(field, impact).map((label) => ({ label, title: label }));
  return [...fromApi, ...fromImpact];
}
