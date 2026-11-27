import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import type {
  AlertSchemaField,
  AlertSchemaFieldType,
  AlertSchemaUsage,
} from "@/lib/api/alertSchema.functions";
import {
  FIELD_ROLE_LABELS,
  deriveFieldRole,
  flagsForRole,
  type FieldRole,
} from "@/lib/alertSchemaRoles";
import { fieldConsumers } from "./schemaHelpers";

export const FIELD_TYPES: AlertSchemaFieldType[] = [
  "string",
  "number",
  "bool",
  "date",
  "datetime",
  "list",
];
export const ROLE_ORDER: FieldRole[] = ["alert", "history", "label", "agent_result"];

/** Patch to apply when the user picks a single role for a field. */
export function patchForRole(field: AlertSchemaField, role: FieldRole): Partial<AlertSchemaField> {
  const flags = flagsForRole(role);
  const patch: Partial<AlertSchemaField> = {
    is_alert: flags.is_alert,
    is_history: flags.is_history,
    is_label: flags.is_label,
  };
  if (role === "agent_result") {
    patch.data_source = "aria";
    patch.is_mandatory = false;
  } else if (field.data_source === "aria") {
    patch.data_source = "aric";
  }
  return patch;
}

const inputClass = "w-full rounded border border-border bg-background px-2 py-1 text-xs";
const chipClass =
  "rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium";

export function RoleSelect({
  field,
  disabled,
  onChange,
}: {
  field: AlertSchemaField;
  disabled: boolean;
  onChange: (id: string, patch: Partial<AlertSchemaField>) => void;
}) {
  return (
    <select
      aria-label={`Rol ${field.id}`}
      value={deriveFieldRole(field)}
      disabled={disabled}
      onChange={(e) => onChange(field.id, patchForRole(field, e.target.value as FieldRole))}
      className="rounded border border-border bg-background px-2 py-1 text-xs"
    >
      {ROLE_ORDER.map((role) => (
        <option key={role} value={role}>
          {FIELD_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

export function fieldColumns(
  readOnly: boolean,
  impact: Record<string, unknown>[],
  onChange: (id: string, patch: Partial<AlertSchemaField>) => void,
  onOpen: (id: string) => void,
  showUsedBy = true,
  usage: AlertSchemaUsage | null = null,
): DataTableColumn<AlertSchemaField>[] {
  const columns: DataTableColumn<AlertSchemaField>[] = [
    {
      key: "field",
      label: "Campo",
      minWidth: 140,
      sortValue: (f) => f.field,
      searchValue: (f) => `${f.field} ${f.field_ds_loc}`,
      render: (f) =>
        readOnly ? (
          <span data-testid={`field-text-${f.id}`} className="text-xs">
            {f.field || "—"}
          </span>
        ) : (
          <input
            aria-label={`Campo ${f.id}`}
            value={f.field}
            onChange={(e) => onChange(f.id, { field: e.target.value })}
            className={inputClass}
          />
        ),
    },
    {
      key: "field_name",
      label: "Nombre visible",
      minWidth: 160,
      sortValue: (f) => f.field_name,
      searchValue: (f) => f.field_name,
      render: (f) =>
        readOnly ? (
          <span className="text-xs">{f.field_name || "—"}</span>
        ) : (
          <input
            aria-label={`Nombre ${f.id}`}
            value={f.field_name}
            onChange={(e) => onChange(f.id, { field_name: e.target.value })}
            className={inputClass}
          />
        ),
    },
    {
      key: "type",
      label: "Tipo",
      minWidth: 100,
      sortValue: (f) => f.type,
      searchValue: (f) => f.type,
      render: (f) =>
        readOnly ? (
          <span className="text-xs">{f.type}</span>
        ) : (
          <select
            aria-label={`Tipo ${f.id}`}
            value={f.type}
            onChange={(e) => onChange(f.id, { type: e.target.value as AlertSchemaFieldType })}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            {FIELD_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        ),
    },
    {
      key: "role",
      label: "Rol",
      minWidth: 150,
      sortValue: (f) => deriveFieldRole(f),
      searchValue: (f) => FIELD_ROLE_LABELS[deriveFieldRole(f)],
      render: (f) =>
        readOnly ? (
          <span className="text-xs">{FIELD_ROLE_LABELS[deriveFieldRole(f)]}</span>
        ) : (
          <RoleSelect field={f} disabled={false} onChange={onChange} />
        ),
    },
    ...(showUsedBy
      ? [
          {
            key: "used_by",
            label: "Usado por",
            minWidth: 120,
            render: (f) => {
              const consumers = fieldConsumers(f, usage, impact);
              return consumers.length ? (
                <span data-testid={`usage-${f.id}`} className="flex flex-wrap gap-1">
                  {consumers.slice(0, 2).map((consumer) => (
                    <span key={consumer.label} title={consumer.title} className={chipClass}>
                      {consumer.label}
                    </span>
                  ))}
                  {consumers.length > 2 && (
                    <span
                      className={chipClass}
                      title={consumers.map((consumer) => consumer.title).join("\n")}
                    >
                      +{consumers.length - 2}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-text-secondary">—</span>
              );
            },
          } satisfies DataTableColumn<AlertSchemaField>,
        ]
      : []),
    {
      key: "chips",
      label: "Marcas",
      minWidth: 170,
      render: (f) => (
        <span data-testid={`chips-${f.id}`} className="flex flex-wrap gap-1">
          {f.is_core && <span className={chipClass}>Core</span>}
          {f.is_sensible && (
            <span
              className={`${chipClass} ${f.sensitivity_strategy ? "" : "border-danger/50 text-danger"}`}
            >
              {f.sensitivity_strategy ? "Sensible" : "Sensible sin estrategia"}
            </span>
          )}
          {f.is_mandatory && <span className={chipClass}>Obligatorio</span>}
          {f.is_identifier === true && <span className={chipClass}>Identificador</span>}
          {f.available_at_decision === false && (
            <span className={chipClass}>Posterior a la decisión</span>
          )}
        </span>
      ),
    },
    {
      key: "details",
      label: "Detalles",
      minWidth: 90,
      render: (f) => (
        <button
          type="button"
          aria-label={`Detalles ${f.id}`}
          onClick={() => onOpen(f.id)}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          Detalles
        </button>
      ),
    },
  ];
  return columns;
}

export function FieldsByRole({
  fields,
  readOnly,
  impact,
  usage = null,
  onChange,
  onOpen,
}: {
  fields: AlertSchemaField[];
  readOnly: boolean;
  impact: Record<string, unknown>[];
  usage?: AlertSchemaUsage | null;
  onChange: (id: string, patch: Partial<AlertSchemaField>) => void;
  onOpen: (id: string) => void;
}) {
  // "Usado por" only earns a column once some field actually has consumers.
  const showUsedBy = fields.some((field) => fieldConsumers(field, usage, impact).length > 0);
  const columns = fieldColumns(readOnly, impact, onChange, onOpen, showUsedBy, usage);
  const grouped = ROLE_ORDER.map((role) => ({
    role,
    rows: fields.filter((field) => deriveFieldRole(field) === role),
  })).filter((group) => group.rows.length > 0);
  return (
    <>
      {grouped.map(({ role, rows }) => (
        <div key={role} data-testid={`fields-role-${role}`} className="space-y-2">
          <DataTable
            storageKey="alert-schema-fields-v2"
            title={FIELD_ROLE_LABELS[role]}
            columns={columns}
            rows={rows
              .slice()
              .sort(
                (left, right) =>
                  left.field.localeCompare(right.field) ||
                  left.field_ds_loc.localeCompare(right.field_ds_loc),
              )}
            rowKey={(field) => field.id}
            pageSize={50}
            itemLabel="campos"
            searchLabel={`Buscar campos en ${FIELD_ROLE_LABELS[role]}`}
            searchPlaceholder="Buscar campo, ubicación o tipo…"
          />
        </div>
      ))}
    </>
  );
}
