import { useMemo, useState } from "react";
import { createAlertSchemaSuggestion } from "@/lib/api/alertSchema.functions";
import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Hint } from "@/components/testing/Hint";

export type CanonicalAlertData = {
  input?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  history_prev_alerta?: Record<string, unknown>[];
  agent_output?: Record<string, unknown>;
};
export type AlertSchemaViewMode = "alert" | "user" | "history" | "aria";

type Row = {
  field: AlertSchemaField;
  value: unknown;
  missing: boolean;
  location: string;
  reportable?: boolean;
};

export function formatSchemaValue(
  value: unknown,
  field: Pick<AlertSchemaField, "type" | "use_locale" | "locale_type">,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "bool") return value === true || value === "True" ? "Sí" : "No";
  if (field.type === "list") return Array.isArray(value) ? value.join(", ") || "—" : String(value);
  if (field.use_locale && field.locale_type) {
    const locale = field.locale_type;
    if (field.type === "number" && Number.isFinite(Number(value))) {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
    }
    if (field.type === "date" || field.type === "datetime") {
      const date = new Date(String(value));
      if (!Number.isNaN(date.getTime()))
        return new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(date);
    }
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function byPath(source: Record<string, unknown> | undefined, path: string, field: string): unknown {
  if (!source) return undefined;
  if (field in source) return source[field];
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function sourceFor(
  mode: AlertSchemaViewMode,
  data: CanonicalAlertData,
): Record<string, unknown> | undefined {
  if (mode === "aria") return data.agent_output;
  if (mode === "user") return data.input;
  return data.input;
}

function fieldRows(
  schema: AlertSchemaVersion,
  data: CanonicalAlertData,
  mode: AlertSchemaViewMode,
): Row[] {
  const source = sourceFor(mode, data);
  return schema.fields
    .filter((field) => {
      if (mode === "history") return field.is_history;
      if (mode === "aria") return field.data_source === "aria";
      return field.is_alert && !field.is_history && !field.is_label;
    })
    .map((field) => {
      const value = field.is_label
        ? data.labels?.[field.field]
        : byPath(source, field.field_ds_loc, field.field);
      return {
        field,
        value,
        missing: value === undefined || value === null || value === "",
        location: field.field_ds_loc,
      };
    });
}

function RowView({ row, alertId, canReport }: { row: Row; alertId?: string; canReport: boolean }) {
  const [reported, setReported] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      createAlertSchemaSuggestion({
        data: {
          alertId: alertId!,
          field: row.field.field,
          location: row.location,
          comment: "Campo ausente o no identificado en la alerta.",
        },
      }),
    onSuccess: () => setReported(true),
  });
  const label = row.field.field_name || row.field.field;
  return (
    <div className="contents">
      <dt
        className="py-1.5 pr-3 text-text-secondary border-t border-border"
        title={row.field.description || undefined}
      >
        {label}
      </dt>
      <dd className="py-1.5 font-medium text-text-primary break-all border-t border-border">
        {row.missing && row.field.is_core ? (
          <Hint content="No llegó en esta alerta">
            <span title="No llegó en esta alerta">—</span>
          </Hint>
        ) : (
          formatSchemaValue(row.value, row.field)
        )}
        {canReport && row.reportable && !reported && (
          <button
            className="ml-2 text-[10px] text-primary hover:underline"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <Send className="inline h-3 w-3 mr-0.5" /> Reportar campo
          </button>
        )}
        {reported && <span className="ml-2 text-[10px] text-success">Reportado</span>}
      </dd>
    </div>
  );
}

function Section({
  title,
  rows,
  alertId,
  canReport,
}: {
  title: string;
  rows: Row[];
  alertId?: string;
  canReport: boolean;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h5 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">{title}</h5>
      <dl className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] text-[12px]">
        {rows.map((row) => (
          <RowView key={row.field.id} row={row} alertId={alertId} canReport={canReport} />
        ))}
      </dl>
    </section>
  );
}

export function AlertSchemaView({
  schema,
  data,
  mode = "alert",
  alertId,
  canReport = false,
}: {
  schema: AlertSchemaVersion | null;
  data: CanonicalAlertData;
  mode?: AlertSchemaViewMode;
  alertId?: string;
  canReport?: boolean;
}) {
  const rows = useMemo(() => (schema ? fieldRows(schema, data, mode) : []), [schema, data, mode]);
  if (!schema)
    return (
      <p className="text-[12px] text-text-secondary">
        No hay un esquema activo para mostrar esta alerta.
      </p>
    );
  const grouped = new Map<string, Row[]>();
  rows.forEach((row) =>
    grouped.set(row.field.group || "Datos", [
      ...(grouped.get(row.field.group || "Datos") ?? []),
      row,
    ]),
  );
  const known = new Set(schema.fields.map((field) => field.field));
  const source = mode === "aria" ? data.agent_output : mode === "user" ? data.input : data.input;
  const others = Object.entries(source ?? {})
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => ({
      field: {
        id: `other-${key}`,
        field: key,
        field_name: key,
        type: "string",
        use_locale: false,
        locale_type: null,
        is_core: false,
        is_mandatory: false,
        is_alert: true,
        is_history: false,
        is_label: false,
        data_source: "aric",
        field_ds_loc: key,
        is_sensible: false,
        sensitivity_strategy: null,
        group: "",
        description: "",
      } as AlertSchemaField,
      value,
      missing: false,
      location: key,
      reportable: true,
    }));
  if (mode === "history") {
    const history = data.history_prev_alerta ?? [];
    const historyFields = schema.fields.filter((field) => field.is_history);
    return (
      <div className="space-y-4">
        {history.length === 0 || historyFields.length === 0 ? (
          <p className="text-[12px] text-text-secondary">Sin historial transaccional.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-surface text-text-secondary">
                <tr>
                  {historyFields.map((field) => (
                    <th key={field.id} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {field.field_name || field.field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((record, index) => (
                  <tr key={index} className="border-t border-border">
                    {historyFields.map((field) => {
                      const value = byPath(record, field.field_ds_loc, field.field);
                      return (
                        <td
                          key={field.id}
                          className="whitespace-nowrap px-3 py-2 text-text-primary"
                        >
                          {formatSchemaValue(value, field)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([title, sectionRows]) => (
        <Section
          key={title}
          title={title}
          rows={sectionRows}
          alertId={alertId}
          canReport={canReport}
        />
      ))}
      {others.length > 0 && (
        <Section title="Otros campos" rows={others} alertId={alertId} canReport={canReport} />
      )}
    </div>
  );
}
