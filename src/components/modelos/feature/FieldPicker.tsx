import { useState } from "react";
import { suspectGuardForName } from "@/lib/alertSchemaRoles";
import { excludedFields, inputGroups, resolveSchemaField, type SchemaIndex } from "./schemaFields";

const OTHER = "__other__";
const control =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] focus:outline-none focus:border-primary";

const TYPE_LABELS: Record<string, string> = {
  string: "texto",
  number: "número",
  bool: "booleano",
  date: "fecha",
  datetime: "fecha y hora",
  list: "lista",
};

/**
 * Field selector fed by the active alert schema: grouped by role, type shown,
 * with a free-path escape hatch and a "Proponer al esquema" notice for paths
 * the schema does not know. Excluded fields (label, ARIA result) are never
 * offered; they are listed with the reason.
 */
export function SchemaFieldPicker({
  index,
  value,
  onChange,
  label,
  testId,
  listId = "fe-paths",
  showExcluded = true,
}: {
  index: SchemaIndex;
  value: string;
  onChange: (path: string) => void;
  label: string;
  testId: string;
  listId?: string;
  showExcluded?: boolean;
}) {
  const groups = inputGroups(index);
  const offered = new Set(groups.flatMap((g) => g.items.map((i) => i.path)));
  const [forceOther, setForceOther] = useState(false);
  const clean = value.replace(/^\$\./, "");
  const inOther = forceOther || (!!value && !offered.has(clean));
  const known = resolveSchemaField(index, value);
  const excluded = excludedFields(index);
  const chosenGuard = value ? (known ? known.guard : suspectGuardForName(clean)) : null;
  return (
    <div className="space-y-1" data-testid={testId}>
      <select
        aria-label={label}
        data-testid={`${testId}-select`}
        className={control}
        value={inOther ? OTHER : clean}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setForceOther(true);
            return;
          }
          setForceOther(false);
          onChange(e.target.value);
        }}
      >
        <option value="">Selecciona un campo del esquema</option>
        {groups.map((group) => (
          <optgroup key={group.role} label={group.label}>
            {group.items.map((info) => (
              <option key={info.path} value={info.path}>
                {info.field.field_name || info.field.field} ·{" "}
                {TYPE_LABELS[info.field.type] ?? info.field.type}
                {info.guard?.level === "warn" ? " · sensible" : ""}
                {info.guard?.level === "suspect" ? " · sospechoso" : ""}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>Otra ruta (no está en el esquema)…</option>
      </select>
      {inOther && (
        <input
          aria-label={`${label} (ruta libre)`}
          data-testid={`${testId}-free`}
          className={control}
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {inOther && value && !known && (
        <p data-testid="fe-propose-schema" className="text-xs text-text-secondary">
          “{value}” no está en el esquema activo.{" "}
          <a className="underline text-primary" href="/configuracion">
            Proponer al esquema
          </a>
        </p>
      )}
      {chosenGuard && (chosenGuard.level === "exclude" || chosenGuard.level === "suspect") && (
        <p
          data-testid="fe-field-guard"
          data-level={chosenGuard.level}
          role={chosenGuard.level === "exclude" ? "alert" : undefined}
          className={`text-xs ${chosenGuard.level === "exclude" ? "text-danger" : "text-warning"}`}
        >
          {chosenGuard.level === "exclude" ? "No se puede usar: " : "Campo sospechoso: "}
          {chosenGuard.reason}
        </p>
      )}
      {showExcluded && excluded.length > 0 && (
        <details className="text-xs text-text-secondary" data-testid="fe-excluded-fields">
          <summary className="cursor-pointer">
            Campos excluidos como entrada ({excluded.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {excluded.map((info) => (
              <li key={info.path} data-testid={`fe-excluded-${info.field.field}`}>
                <span className="font-medium">{info.field.field_name || info.field.field}</span>:{" "}
                {info.guard?.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
