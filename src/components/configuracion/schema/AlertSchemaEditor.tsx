import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Plus, Save, X } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { SectionTabs } from "@/components/ui/section-tabs";
import { useRole } from "@/hooks/useRole";
import {
  approveAlertSchema,
  getActiveAlertSchema,
  listAlertSchemaSuggestions,
  getAlertSchemaPresence,
  listAlertSchemaVersions,
  proposeAlertSchema,
  rejectAlertSchema,
  saveAlertSchemaDraft,
  type AlertSchemaField,
  type AlertSchemaFieldType,
  type AlertSchemaVersion,
} from "@/lib/api/alertSchema.functions";

type SchemaTab = "fields" | "system" | "proposals" | "suggestions";
const TABS: { key: SchemaTab; label: string }[] = [
  { key: "fields", label: "Campos" },
  { key: "system", label: "Campos de sistema" },
  { key: "proposals", label: "Propuestas" },
  { key: "suggestions", label: "Sugerencias" },
];
const TYPES: AlertSchemaFieldType[] = ["string", "number", "bool", "date", "datetime", "list"];
const ROLES: { name: string; type: AlertSchemaFieldType; required: boolean; consumers: string }[] =
  [
    {
      name: "event_id",
      type: "string",
      required: true,
      consumers: "Señales de ARIC, trazabilidad",
    },
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
const KNOWN_OUTCOME_FIELDS = new Set(["marcacion_final", "tipo", "desenlace"]);

const emptyField = (id: string): AlertSchemaField => ({
  id,
  data_source: "aric",
  field: "",
  field_name: "",
  field_ds_loc: "",
  type: "string",
  is_alert: true,
  is_mandatory: false,
  is_history: false,
  is_core: false,
  is_label: false,
  is_sensible: false,
  sensitivity_strategy: null,
  group: "",
  description: "",
  use_locale: false,
  locale_type: null,
});

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "No fue posible completar la operación.";
  if (message.includes("409"))
    return "409 · La versión activa cambió. Recarga y vuelve a basar el borrador.";
  if (message.includes("422"))
    return `422 · ${message.split(": ").slice(1).join(": ") || "El esquema no cumple las validaciones."}`;
  return message;
}

function validate(fields: AlertSchemaField[], roles: Record<string, string>): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const locations = new Set<string>();
  fields.forEach((field) => {
    if (ids.has(field.id)) errors.push(`Id de campo duplicado: ${field.id}`);
    ids.add(field.id);
    const location = `${field.data_source}:${field.field_ds_loc}`;
    if (field.field_ds_loc && locations.has(location))
      errors.push(`Ubicación duplicada: ${field.field_ds_loc}`);
    if (field.field_ds_loc) locations.add(location);
    if (field.is_core && !field.field_name)
      errors.push(`${field.field || "Campo"}: un campo core necesita nombre visible.`);
    if (field.is_label && field.is_history)
      errors.push(`${field.field || "Campo"}: no puede ser etiqueta e historial.`);
    if (field.is_sensible && !field.sensitivity_strategy)
      errors.push(`${field.field || "Campo"}: define la estrategia sensible.`);
    if (field.use_locale && !field.locale_type)
      errors.push(`${field.field || "Campo"}: define locale_type.`);
    if (field.data_source === "aria" && field.is_mandatory)
      errors.push(`${field.field || "Campo"}: aria no puede ser obligatorio.`);
    if (KNOWN_OUTCOME_FIELDS.has(field.field) && !field.is_label)
      errors.push(`${field.field}: un campo de desenlace conocido debe ser etiqueta.`);
  });
  const byId = new Map(fields.map((field) => [field.id, field]));
  ROLES.filter((role) => role.required || roles[role.name]).forEach((role) => {
    const selected = byId.get(roles[role.name]);
    if (!selected) errors.push(`Falta asignar el rol obligatorio: ${role.name}.`);
    else if (!selected.is_alert || selected.is_label || selected.type !== role.type)
      errors.push(`El rol ${role.name} tiene un campo incompatible.`);
  });
  return [...new Set(errors)];
}

function fieldColumns(
  readOnly: boolean,
  onChange: (id: string, patch: Partial<AlertSchemaField>) => void,
): DataTableColumn<AlertSchemaField>[] {
  return [
    {
      key: "field",
      label: "Campo",
      minWidth: 140,
      sortValue: (f) => f.field,
      searchValue: (f) => f.field,
      render: (f) => (
        <input
          aria-label={`Campo ${f.id}`}
          value={f.field}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { field: e.target.value })}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
    {
      key: "field_name",
      label: "Nombre visible",
      minWidth: 160,
      sortValue: (f) => f.field_name,
      searchValue: (f) => f.field_name,
      render: (f) => (
        <input
          aria-label={`Nombre ${f.id}`}
          value={f.field_name}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { field_name: e.target.value })}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
    {
      key: "description",
      label: "Descripción",
      minWidth: 200,
      sortValue: (f) => f.description,
      searchValue: (f) => f.description,
      render: (f) => (
        <textarea
          aria-label={`Descripción ${f.id}`}
          value={f.description}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { description: e.target.value })}
          className="min-h-8 w-40 rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
    {
      key: "field_ds_loc",
      label: "Ubicación",
      minWidth: 160,
      sortValue: (f) => f.field_ds_loc,
      searchValue: (f) => f.field_ds_loc,
      render: (f) => (
        <input
          aria-label={`Ubicación ${f.id}`}
          value={f.field_ds_loc}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { field_ds_loc: e.target.value })}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
    {
      key: "type",
      label: "Tipo",
      minWidth: 100,
      sortValue: (f) => f.type,
      searchValue: (f) => f.type,
      render: (f) => (
        <select
          aria-label={`Tipo ${f.id}`}
          value={f.type}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { type: e.target.value as AlertSchemaFieldType })}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          {TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      ),
    },
    {
      key: "data_source",
      label: "Origen",
      minWidth: 90,
      sortValue: (f) => f.data_source,
      searchValue: (f) => f.data_source,
      render: (f) => (
        <select
          aria-label={`Origen ${f.id}`}
          value={f.data_source}
          disabled={readOnly}
          onChange={(e) =>
            onChange(f.id, { data_source: e.target.value as AlertSchemaField["data_source"] })
          }
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option>aric</option>
          <option>host</option>
          <option>aria</option>
        </select>
      ),
    },
    {
      key: "is_core",
      label: "Core",
      minWidth: 80,
      sortValue: (f) => Number(f.is_core),
      render: (f) => (
        <input
          aria-label={`Core ${f.id}`}
          type="checkbox"
          checked={f.is_core}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_core: e.target.checked })}
        />
      ),
    },
    {
      key: "is_alert",
      label: "Alerta",
      minWidth: 80,
      sortValue: (f) => Number(f.is_alert),
      render: (f) => (
        <input
          aria-label={`Alerta ${f.id}`}
          type="checkbox"
          checked={f.is_alert}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_alert: e.target.checked })}
        />
      ),
    },
    {
      key: "is_mandatory",
      label: "Obligatorio",
      minWidth: 80,
      sortValue: (f) => Number(f.is_mandatory),
      render: (f) => (
        <input
          aria-label={`Obligatorio ${f.id}`}
          type="checkbox"
          checked={f.is_mandatory}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_mandatory: e.target.checked })}
        />
      ),
    },
    {
      key: "is_history",
      label: "Historial",
      minWidth: 80,
      sortValue: (f) => Number(f.is_history),
      render: (f) => (
        <input
          aria-label={`Historial ${f.id}`}
          type="checkbox"
          checked={f.is_history}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_history: e.target.checked })}
        />
      ),
    },
    {
      key: "is_label",
      label: "Etiqueta",
      minWidth: 80,
      sortValue: (f) => Number(f.is_label),
      render: (f) => (
        <input
          aria-label={`Etiqueta ${f.id}`}
          type="checkbox"
          checked={f.is_label}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_label: e.target.checked })}
        />
      ),
    },
    {
      key: "is_sensible",
      label: "Sensible",
      minWidth: 80,
      sortValue: (f) => Number(f.is_sensible),
      render: (f) => (
        <input
          aria-label={`Sensible ${f.id}`}
          type="checkbox"
          checked={f.is_sensible}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { is_sensible: e.target.checked })}
        />
      ),
    },
    {
      key: "sensitivity_strategy",
      label: "Estrategia",
      minWidth: 120,
      sortValue: (f) => f.sensitivity_strategy ?? "",
      render: (f) => (
        <select
          aria-label={`Estrategia sensible ${f.id}`}
          value={f.sensitivity_strategy ?? ""}
          disabled={readOnly || !f.is_sensible}
          onChange={(e) => onChange(f.id, { sensitivity_strategy: e.target.value || null })}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">—</option>
          <option value="anonymize">anonymize</option>
          <option value="obfuscate">obfuscate</option>
        </select>
      ),
    },
    {
      key: "use_locale",
      label: "Locale",
      minWidth: 80,
      sortValue: (f) => Number(f.use_locale),
      render: (f) => (
        <input
          aria-label={`Locale ${f.id}`}
          type="checkbox"
          checked={f.use_locale}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { use_locale: e.target.checked })}
        />
      ),
    },
    {
      key: "locale_type",
      label: "Tipo locale",
      minWidth: 120,
      sortValue: (f) => f.locale_type ?? "",
      searchValue: (f) => f.locale_type ?? "",
      render: (f) => (
        <input
          aria-label={`Tipo de locale ${f.id}`}
          value={f.locale_type ?? ""}
          disabled={readOnly || !f.use_locale}
          onChange={(e) => onChange(f.id, { locale_type: e.target.value || null })}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
    {
      key: "group",
      label: "Grupo",
      minWidth: 120,
      sortValue: (f) => f.group,
      searchValue: (f) => f.group,
      render: (f) => (
        <input
          aria-label={`Grupo ${f.id}`}
          value={f.group}
          disabled={readOnly}
          onChange={(e) => onChange(f.id, { group: e.target.value })}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
        />
      ),
    },
  ];
}

export function AlertSchemaEditor() {
  const { user } = useRole();
  const queryClient = useQueryClient();
  const activeQuery = useQuery({
    queryKey: ["alertSchema", "active"],
    queryFn: getActiveAlertSchema,
  });
  const versionsQuery = useQuery({
    queryKey: ["alertSchema", "versions"],
    queryFn: listAlertSchemaVersions,
  });
  const suggestionsQuery = useQuery({
    queryKey: ["alertSchema", "suggestions"],
    queryFn: listAlertSchemaSuggestions,
  });
  const presenceQuery = useQuery({
    queryKey: ["alertSchema", "presence"],
    queryFn: getAlertSchemaPresence,
  });
  const active = activeQuery.data ?? null;
  const versions = versionsQuery.data ?? [];
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<SchemaTab>("fields");
  const [draft, setDraft] = useState<AlertSchemaVersion | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);
  const [ignoredLocations, setIgnoredLocations] = useState<Set<string>>(new Set());
  const selected =
    draft ??
    (viewedVersion ? versions.find((item) => item.version === viewedVersion) : null) ??
    active;
  const fields = useMemo(() => selected?.fields ?? [], [selected]);
  const errors = useMemo(
    () => validate(fields, selected?.field_roles ?? {}),
    [fields, selected?.field_roles],
  );
  const readOnly =
    selected?.status === "active" ||
    selected?.status === "historical" ||
    selected?.status === "rejected";
  const isProposer = !!user?.id && user.id === selected?.proposed_by;
  const hasImpact = (selected?.impact ?? []).length > 0;
  const mutation = useMutation({
    mutationFn: async (action: "save" | "propose" | "approve" | "reject") => {
      if (!selected) throw new Error("No hay una versión de esquema seleccionada.");
      if (action === "save")
        return saveAlertSchemaDraft({
          data: {
            version: selected.version,
            based_on_version: selected.based_on_version ?? active?.version ?? null,
            fields,
            field_roles: selected.field_roles,
          },
        });
      if (action === "propose") return proposeAlertSchema(selected.version);
      if (action === "approve")
        return approveAlertSchema({ version: selected.version, impactAcknowledged });
      return rejectAlertSchema(selected.version);
    },
    onSuccess: (result) => {
      setDraft(result);
      queryClient.invalidateQueries({ queryKey: ["alertSchema"] });
    },
  });

  const updateField = (id: string, patch: Partial<AlertSchemaField>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.id === id ? { ...field, ...patch } : field,
            ),
          }
        : current,
    );
  const startDraft = () =>
    setDraft(
      selected
        ? {
            ...selected,
            status: "draft",
            version: selected.version || 1,
            fields: selected.fields.map((field) => ({ ...field })),
            field_roles: { ...selected.field_roles },
          }
        : {
            version: 1,
            status: "draft",
            fields: [],
            field_roles: {},
            proposed_by: null,
            proposed_at: null,
            approved_by: null,
            approved_at: null,
            impact_acknowledged: false,
            based_on_version: active?.version ?? null,
            comparison: {},
            impact: [],
          },
    );
  const columns = fieldColumns(!draft || !!readOnly, updateField);
  const grouped = fields
    .filter((field) => sourceFilter === "all" || field.data_source === sourceFilter)
    .reduce<Record<string, Record<string, AlertSchemaField[]>>>((result, field) => {
      const destination = field.is_history
        ? "Historial"
        : field.is_label
          ? "Desenlace"
          : field.data_source === "aria"
            ? "Resultado del agente"
            : "Alerta";
      const groups = (result[destination] ??= {});
      (groups[field.group || "Sin grupo"] ??= []).push(field);
      return result;
    }, {});
  const actionError = mutation.error ? errorText(mutation.error) : null;
  const presence = presenceQuery.data;
  const presenceByField = new Map((presence?.fields ?? []).map((item) => [item.field_id, item]));
  const addPresenceField = (location: string) => {
    const fieldName = location.split(".").at(-1) ?? location;
    setDraft((current) => ({
      ...(current ?? {
        version: active?.version ?? 1,
        status: "draft",
        fields: [],
        field_roles: {},
        proposed_by: null,
        proposed_at: null,
        approved_by: null,
        approved_at: null,
        impact_acknowledged: false,
        based_on_version: active?.version ?? null,
        comparison: {},
        impact: [],
      }),
      status: "draft",
      fields: [
        ...(current?.fields ?? []),
        emptyField(`field-${Date.now()}`) as AlertSchemaField,
      ].map((field, index, all) =>
        index === all.length - 1
          ? { ...field, field: fieldName, field_name: fieldName, field_ds_loc: location }
          : field,
      ),
    }));
    setTab("fields");
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Esquema de alerta</p>
          <p className="mt-1 text-xs text-text-secondary">
            Activo: v{active?.version ?? "—"} · Vista: v{selected?.version ?? "—"}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            Estado: {selected?.status ?? "sin versión activa"} · Propuso:{" "}
            {selected?.proposed_by ?? "—"} · Aprobó: {selected?.approved_by ?? "—"}
          </p>
        </div>
        <select
          aria-label="Versión del esquema"
          value={selected?.version ?? ""}
          onChange={(e) => {
            setDraft(null);
            setViewedVersion(e.target.value ? Number(e.target.value) : null);
          }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">Versión activa</option>
          {versions.map((version) => (
            <option key={version.version} value={version.version}>
              v{version.version} · {version.status}
            </option>
          ))}
        </select>
      </div>
      <SectionTabs
        label="Secciones del esquema"
        items={TABS}
        value={tab}
        onValueChange={setTab}
        variant="pills"
      />
      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
        >
          {actionError}
        </div>
      )}
      {tab === "fields" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Filtrar origen"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-8 rounded border border-border bg-background px-2 text-xs"
            >
              <option value="all">Todos los orígenes</option>
              <option value="aric">aric</option>
              <option value="host">host</option>
              <option value="aria">aria</option>
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={startDraft}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Editar borrador
              </button>
              {draft && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            fields: [...current.fields, emptyField(`field-${Date.now()}`)],
                          }
                        : current,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Campo
                </button>
              )}
            </div>
          </div>
          {Object.keys(grouped).length === 0 ? (
            <Empty text="La v1 permanece vacía hasta que se cargue un esquema." />
          ) : (
            Object.entries(grouped).map(([destination, groups]) => (
              <div key={destination} className="space-y-2">
                <h3 className="text-sm font-semibold text-text-primary">{destination}</h3>
                {Object.entries(groups).map(([group, groupFields]) => (
                  <DataTable
                    key={`${destination}-${group}`}
                    storageKey="alert-schema-fields"
                    title={group}
                    columns={columns}
                    rows={groupFields
                      .slice()
                      .sort(
                        (left, right) =>
                          left.field.localeCompare(right.field) ||
                          left.field_ds_loc.localeCompare(right.field_ds_loc),
                      )}
                    rowKey={(field) => field.id}
                    pageSize={50}
                    itemLabel="campos"
                    searchLabel={`Buscar campos en ${group}`}
                    searchPlaceholder="Buscar campo, ubicación o tipo…"
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
      {tab === "system" && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border p-3 text-xs text-text-secondary">
            Los roles sólo aceptan campos is_alert del tipo compatible.
          </div>
          {ROLES.map((role) => (
            <div
              key={role.name}
              className="grid gap-2 border-t border-border p-3 md:grid-cols-[150px_1fr_1fr] md:items-center"
            >
              <div className="text-xs font-semibold">
                {role.name}
                {role.required && <span className="ml-1 text-danger">*</span>}
              </div>
              <select
                aria-label={`Campo para ${role.name}`}
                disabled={!draft}
                value={selected?.field_roles[role.name] ?? ""}
                onChange={(e) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          field_roles: { ...current.field_roles, [role.name]: e.target.value },
                        }
                      : current,
                  )
                }
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
                {(() => {
                  const distribution = selected?.field_roles[role.name]
                    ? presenceByField.get(selected.field_roles[role.name])?.distribution
                    : null;
                  if (!distribution) return "Distribución: sin datos";
                  if (distribution.kind === "numeric")
                    return `Percentiles: ${Object.entries(distribution.percentiles ?? {})
                      .map(([key, value]) => `${key} ${value ?? "—"}`)
                      .join(" · ")}`;
                  return `Valores: ${
                    Object.entries(distribution.frequencies ?? {})
                      .slice(0, 4)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" · ") || "sin datos"
                  }`;
                })()}
              </p>
            </div>
          ))}
        </div>
      )}
      {tab === "proposals" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4 text-xs">
            <p className="font-semibold">Comparación con la versión activa</p>
            <pre className="mt-2 whitespace-pre-wrap text-text-secondary">
              {JSON.stringify(selected?.comparison ?? {}, null, 2)}
            </pre>
          </div>
          {hasImpact && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-xs">
              <p className="font-semibold text-text-primary">
                <AlertTriangle className="mr-1 inline h-4 w-4" /> Impacto en uso
              </p>
              <ul className="mt-2 list-disc pl-5">
                {selected?.impact.map((item, index) => (
                  <li key={index}>{String(item.name ?? item.id ?? "Consumidor activo")}</li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={impactAcknowledged}
                  onChange={(e) => setImpactAcknowledged(e.target.checked)}
                />{" "}
                Entiendo el impacto
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {draft && (
              <button
                type="button"
                disabled={errors.length > 0 || mutation.isPending}
                onClick={() => mutation.mutate("save")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Guardar
              </button>
            )}
            <button
              type="button"
              disabled={!selected || !!readOnly || errors.length > 0 || mutation.isPending}
              onClick={() => mutation.mutate("propose")}
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              Proponer
            </button>
            <button
              type="button"
              aria-label="Aprobar propuesta"
              disabled={
                !selected ||
                selected.status !== "proposed" ||
                isProposer ||
                (hasImpact && !impactAcknowledged) ||
                mutation.isPending
              }
              onClick={() => mutation.mutate("approve")}
              className="inline-flex items-center gap-1 rounded-md bg-success px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Aprobar
            </button>
            <button
              type="button"
              disabled={!selected || selected.status !== "proposed" || mutation.isPending}
              onClick={() => mutation.mutate("reject")}
              className="inline-flex items-center gap-1 rounded-md border border-danger/50 px-3 py-1.5 text-xs text-danger disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Rechazar
            </button>
          </div>
          {isProposer && (
            <p className="text-xs text-warning">
              No puedes aprobar tu propia propuesta; debe hacerlo otro manager.
            </p>
          )}
          {errors.length > 0 && <ValidationErrors errors={errors} />}
        </div>
      )}
      {tab === "suggestions" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text-secondary">
            Último análisis: {presence?.report_day ?? "—"} · {presence?.alert_count ?? 0} alertas
          </div>
          {(presence?.unknown_locations ?? [])
            .filter((item) => !ignoredLocations.has(item.location))
            .map((item) => (
              <div key={item.location} className="rounded-lg border border-border p-3 text-xs">
                <p className="font-semibold">Campo nuevo · {item.location}</p>
                <p className="mt-1 text-text-secondary">Llegó en {item.frequency} alertas.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-2 py-1 text-white"
                    onClick={() => addPresenceField(item.location)}
                  >
                    Añadir al borrador
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1"
                    onClick={() =>
                      setIgnoredLocations((current) => new Set(current).add(item.location))
                    }
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            ))}
          {(suggestionsQuery.data ?? []).map((suggestion) => (
            <div key={suggestion.id} className="rounded-lg border border-border p-3 text-xs">
              <p className="font-semibold">
                {suggestion.field} · {suggestion.location}
              </p>
              <p className="mt-1 text-text-secondary">{suggestion.comment}</p>
              <p className="mt-1 text-[11px] text-text-secondary">
                Reportó {suggestion.created_by}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-1 text-white"
                  onClick={() => addPresenceField(suggestion.location)}
                >
                  Añadir al borrador
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1"
                  onClick={() =>
                    setIgnoredLocations((current) => new Set(current).add(suggestion.location))
                  }
                >
                  Ignorar
                </button>
              </div>
            </div>
          ))}
          {!(suggestionsQuery.data ?? []).length && <Empty text="No hay reportes de analistas." />}
        </div>
      )}
    </section>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
    >
      <p className="font-semibold">Corrige antes de guardar:</p>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-text-secondary">
      {text}
    </div>
  );
}
