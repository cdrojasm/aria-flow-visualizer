import type { AlertSchemaField, AlertSchemaPresence } from "@/lib/api/alertSchema.functions";
import { ESSENTIAL_ROLES } from "./schemaHelpers";

const MAX_VALUES = 3;
const MAX_VALUE_LENGTH = 24;

function shortValue(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
}

/** Readable summary of a presence distribution: at most 3 values, long ones trimmed. */
export function distributionText(
  distribution:
    NonNullable<AlertSchemaPresence["fields"][number]["distribution"]> | null | undefined,
) {
  if (!distribution) return "Distribución: sin datos";
  if (distribution.kind === "numeric")
    return `Percentiles: ${Object.entries(distribution.percentiles ?? {})
      .map(([key, value]) => `${key} ${value ?? "—"}`)
      .join(" · ")}`;
  const entries = Object.entries(distribution.frequencies ?? {});
  if (entries.length === 0) return "Valores: sin datos";
  const shown = entries
    .slice()
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, MAX_VALUES)
    .map(([key, value]) => `${shortValue(key)}: ${value}`)
    .join(" · ");
  const rest = entries.length - MAX_VALUES;
  return `Valores: ${shown}${rest > 0 ? ` · +${rest} más` : ""}`;
}

/** Counts required and optional essentials separately; optional ones never read as "missing". */
export function essentialsBreakdown(fields: AlertSchemaField[], roles: Record<string, string>) {
  const ids = new Set(fields.map((field) => field.id));
  const covered = (required: boolean) =>
    ESSENTIAL_ROLES.filter(
      (role) => role.required === required && roles[role.name] && ids.has(roles[role.name]),
    );
  return {
    requiredCovered: covered(true).length,
    requiredTotal: ESSENTIAL_ROLES.filter((role) => role.required).length,
    optionalCovered: covered(false).length,
    optionalTotal: ESSENTIAL_ROLES.filter((role) => !role.required).length,
  };
}

/** Checklist of the nine essential fields, with the role -> field assignment. */
export function EssentialFieldsChecklist({
  fields,
  fieldRoles,
  presence,
  editable,
  onAssign,
}: {
  fields: AlertSchemaField[];
  fieldRoles: Record<string, string>;
  presence: AlertSchemaPresence | null | undefined;
  editable: boolean;
  onAssign: (role: string, fieldId: string) => void;
}) {
  const presenceByField = new Map((presence?.fields ?? []).map((item) => [item.field_id, item]));
  const ids = new Set(fields.map((field) => field.id));
  return (
    <div data-testid="essential-fields" className="rounded-lg border border-border">
      <div className="border-b border-border p-3 text-xs text-text-secondary">
        Campos esenciales: ARIA los lee por nombre. Cada uno necesita un campo de la alerta del tipo
        compatible. Para cambiar la asignación, abre un borrador.
      </div>
      {ESSENTIAL_ROLES.map((role) => {
        const assigned = fieldRoles[role.name];
        const covered = !!assigned && ids.has(assigned);
        return (
          <div
            key={role.name}
            data-testid={`essential-${role.name}`}
            className="grid gap-2 border-t border-border p-3 first:border-t-0 md:grid-cols-[28px_150px_1fr_1fr] md:items-center"
          >
            <span
              role="img"
              aria-label={covered ? "Cubierto" : role.required ? "Falta" : "Opcional sin asignar"}
              className={
                covered ? "text-success" : role.required ? "text-danger" : "text-text-secondary"
              }
            >
              {covered ? "✓" : role.required ? "✗" : "○"}
            </span>
            <div className="text-xs font-semibold">
              {role.name}
              {role.required ? (
                <span className="ml-1 text-danger">*</span>
              ) : (
                <span className="ml-1 text-[10px] font-normal text-text-secondary">opcional</span>
              )}
            </div>
            <select
              aria-label={`Campo para ${role.name}`}
              disabled={!editable}
              value={assigned ?? ""}
              onChange={(e) => onAssign(role.name, e.target.value)}
              className="h-8 rounded border border-border bg-background px-2 text-xs"
            >
              <option value="">Sin asignar</option>
              {fields
                .filter((field) => field.is_alert && !field.is_label && field.type === role.type)
                .map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.field_name || field.field || field.id}
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-text-secondary">
              {role.consumers} ·{" "}
              {distributionText(assigned ? presenceByField.get(assigned)?.distribution : null)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
