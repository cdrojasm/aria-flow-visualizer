import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { SectionTabs } from "@/components/ui/section-tabs";
import { useRole } from "@/hooks/useRole";
import {
  approveAlertSchema,
  getActiveAlertSchema,
  getAlertSchemaUsage,
  listAlertSchemaSuggestions,
  getAlertSchemaPresence,
  listAlertSchemaVersions,
  proposeAlertSchema,
  rejectAlertSchema,
  saveAlertSchemaDraft,
  type AlertSchemaField,
  type AlertSchemaVersion,
} from "@/lib/api/alertSchema.functions";
import { EssentialFieldsChecklist, essentialsBreakdown } from "./EssentialFieldsChecklist";
import { FieldDetailDrawer } from "./FieldDetailDrawer";
import { ReviewInbox, buildReviewItems } from "./ReviewInbox";
import { SchemaDiff } from "./SchemaDiff";
import { FieldsByRole } from "./SchemaFieldsTable";
import { SchemaStatusBand, type PrimaryAction } from "./SchemaStatusBand";
import {
  ESSENTIAL_ROLES,
  compareLocally,
  humanError,
  impactLabel,
  statusLabel,
  summarizeComparison,
} from "./schemaHelpers";

type SchemaTab = "essentials" | "fields" | "proposals" | "review";
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
  is_identifier: false,
  available_at_decision: true,
});

const emptyVersion = (basedOn: number | null): AlertSchemaVersion => ({
  version: basedOn ?? 1,
  status: "draft",
  fields: [],
  field_roles: {},
  proposed_by: null,
  proposed_at: null,
  approved_by: null,
  approved_at: null,
  impact_acknowledged: false,
  based_on_version: basedOn,
  comparison: {},
  impact: [],
});

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
    if (field.is_label && field.is_identifier === true)
      errors.push(`${field.field || "Campo"}: no puede ser etiqueta e identificador.`);
    if (field.is_sensible && !field.sensitivity_strategy)
      errors.push(`${field.field || "Campo"}: define la estrategia sensible.`);
    if (field.use_locale && !field.locale_type)
      errors.push(`${field.field || "Campo"}: define el tipo de locale.`);
    if (field.data_source === "aria" && field.is_mandatory)
      errors.push(`${field.field || "Campo"}: un resultado de ARIA no puede ser obligatorio.`);
    if (KNOWN_OUTCOME_FIELDS.has(field.field) && !field.is_label)
      errors.push(`${field.field}: un campo de desenlace conocido debe tener el rol Desenlace.`);
  });
  const byId = new Map(fields.map((field) => [field.id, field]));
  ESSENTIAL_ROLES.filter((role) => role.required || roles[role.name]).forEach((role) => {
    const selected = byId.get(roles[role.name]);
    if (!selected) errors.push(`Falta asignar el campo esencial: ${role.name}.`);
    else if (!selected.is_alert || selected.is_label || selected.type !== role.type)
      errors.push(`El campo esencial ${role.name} tiene un campo incompatible.`);
  });
  return [...new Set(errors)];
}

/** User ids are UUIDs: show a short form (full value stays in the tooltip). */
function shortActor(value: string | null | undefined): string {
  if (!value) return "—";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ? `${value.slice(0, 8)}…` : value;
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
  const presence = presenceQuery.data;
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<SchemaTab>("essentials");
  const [draft, setDraft] = useState<AlertSchemaVersion | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);
  const [ignoredLocations, setIgnoredLocations] = useState<Set<string>>(new Set());
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const selected =
    draft ??
    (viewedVersion ? versions.find((item) => item.version === viewedVersion) : null) ??
    active;
  const fields = useMemo(() => selected?.fields ?? [], [selected]);
  const fieldRoles = useMemo(() => selected?.field_roles ?? {}, [selected]);
  const errors = useMemo(() => validate(fields, fieldRoles), [fields, fieldRoles]);
  const editing = !!draft && draft.status === "draft";
  const tableReadOnly = !editing;
  const status = selected?.status ?? null;
  const isProposer = !!user?.id && user.id === selected?.proposed_by;
  const impact = selected?.impact ?? [];
  // Consumers per field; a draft has no consumers of its own, so it is read against its base
  // version. A failing endpoint just hides the "Usado por" column.
  const usageVersion = selected
    ? selected.status === "draft"
      ? (selected.based_on_version ?? active?.version ?? null)
      : selected.version
    : null;
  const usageQuery = useQuery({
    queryKey: ["alertSchema", "usage", usageVersion],
    queryFn: () => getAlertSchemaUsage(usageVersion),
    enabled: !!selected,
    retry: false,
    // The report reads every model and configuration (seconds): do not recompute it each time
    // the tab is reopened.
    staleTime: 5 * 60_000,
  });
  const usage = usageQuery.isError ? null : (usageQuery.data ?? null);
  const hasImpact = impact.length > 0;
  const showErrors = errors.length > 0 && (editing || status === "draft" || status === "proposed");

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
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["alertSchema"] });
    },
  });

  const edit = (updater: (current: AlertSchemaVersion) => AlertSchemaVersion) => {
    setDraft((current) => (current ? updater(current) : current));
    setDirty(true);
  };
  const updateField = (id: string, patch: Partial<AlertSchemaField>) =>
    edit((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    }));
  const baseDraft = (): AlertSchemaVersion =>
    selected
      ? {
          ...selected,
          status: "draft",
          version: selected.version || 1,
          fields: selected.fields.map((field) => ({ ...field })),
          field_roles: { ...selected.field_roles },
        }
      : emptyVersion(active?.version ?? null);
  const startDraft = () => {
    setDraft(baseDraft());
    setDirty(selected?.status !== "draft");
    mutation.reset();
  };
  const discardDraft = () => {
    setDraft(null);
    setDirty(false);
    mutation.reset();
  };
  const addField = (patch: Partial<AlertSchemaField> = {}) => {
    const next = { ...emptyField(`field-${Date.now()}`), ...patch };
    setDraft((current) => {
      const base = current ?? baseDraft();
      return { ...base, status: "draft", fields: [...base.fields, next] };
    });
    setDirty(true);
  };
  const addPresenceField = (location: string) => {
    const fieldName = location.split(".").at(-1) ?? location;
    addField({ field: fieldName, field_name: fieldName, field_ds_loc: location });
    setTab("fields");
  };

  const reviewItems = buildReviewItems(presence, suggestionsQuery.data ?? [], ignoredLocations);
  const sensitiveWithoutStrategy = fields.filter(
    (field) => field.is_sensible && !field.sensitivity_strategy,
  ).length;
  const coverage = essentialsBreakdown(fields, fieldRoles);
  const changeCount = editing
    ? (summarizeComparison(compareLocally(active, { fields, field_roles: fieldRoles }))?.total ?? 0)
    : (summarizeComparison(selected?.comparison)?.total ?? 0);
  const viewingOther = editing || (!!selected && selected.version !== active?.version);
  const viewedText = viewingOther
    ? `${statusLabel(editing ? "draft" : status)}${editing || status === "draft" || status === "proposed" ? ` con ${changeCount} ${changeCount === 1 ? "cambio" : "cambios"}` : ` v${selected?.version}`}`
    : null;

  let primary: PrimaryAction = "edit";
  let primaryDisabled = false;
  let primaryHint: string | null = null;
  if (editing && dirty) {
    primary = "save";
    primaryDisabled = errors.length > 0;
    if (errors.length > 0) primaryHint = `Corrige ${errors.length} validaciones para guardar.`;
  } else if (editing) {
    primary = "propose";
    primaryDisabled = errors.length > 0;
    if (errors.length > 0) primaryHint = `Corrige ${errors.length} validaciones para proponer.`;
  } else if (status === "proposed") {
    primary = "approve";
    if (isProposer) {
      primaryDisabled = true;
      primaryHint = "No puedes aprobar tu propia propuesta; debe hacerlo otro manager.";
    } else if (hasImpact && !impactAcknowledged) {
      primaryDisabled = true;
      primaryHint = "Confirma el impacto en la pestaña Propuestas para aprobar.";
    }
  }
  const onPrimary = () => {
    if (primary === "edit") startDraft();
    else if (primary === "save") mutation.mutate("save");
    else if (primary === "propose") mutation.mutate("propose");
    else if (primary === "approve") mutation.mutate("approve");
  };

  const visibleFields = fields.filter(
    (field) => sourceFilter === "all" || field.data_source === sourceFilter,
  );
  const openField = fields.find((field) => field.id === openFieldId) ?? null;
  const actionError = mutation.error ? humanError(mutation.error) : null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Esquema de alerta</p>
          <p className="mt-1 text-xs text-text-secondary">
            Vista: v{selected?.version ?? "—"} · Estado: {statusLabel(status)} · Propuso:{" "}
            <span title={selected?.proposed_by ?? undefined}>
              {shortActor(selected?.proposed_by)}
            </span>{" "}
            · Aprobó:{" "}
            <span title={selected?.approved_by ?? undefined}>
              {shortActor(selected?.approved_by)}
            </span>
          </p>
        </div>
        <select
          aria-label="Versión del esquema"
          value={selected?.version ?? ""}
          onChange={(e) => {
            discardDraft();
            setViewedVersion(e.target.value ? Number(e.target.value) : null);
          }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">Versión activa</option>
          {versions.map((version) => (
            <option key={version.version} value={version.version}>
              v{version.version} · {statusLabel(version.status)}
            </option>
          ))}
        </select>
      </div>
      <SchemaStatusBand
        loading={activeQuery.isLoading}
        activeVersion={active?.version ?? null}
        viewedText={viewedText}
        requiredCovered={coverage.requiredCovered}
        requiredTotal={coverage.requiredTotal}
        optionalCovered={coverage.optionalCovered}
        optionalTotal={coverage.optionalTotal}
        toReview={reviewItems.length}
        sensitiveWithoutStrategy={sensitiveWithoutStrategy}
        primary={primary}
        primaryDisabled={primaryDisabled}
        primaryHint={primaryHint}
        pending={mutation.isPending}
        onPrimary={onPrimary}
        canReject={status === "proposed"}
        onReject={() => mutation.mutate("reject")}
        canDiscard={editing}
        onDiscard={discardDraft}
      />
      {actionError && (
        <div
          role="alert"
          data-testid="schema-action-error"
          className="rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
        >
          {actionError}
        </div>
      )}
      {showErrors && <ValidationErrors errors={errors} />}
      <SectionTabs
        label="Secciones del esquema"
        items={[
          { key: "essentials", label: "Campos esenciales" },
          { key: "fields", label: "Campos" },
          { key: "proposals", label: "Propuestas" },
          { key: "review", label: `Por revisar (${reviewItems.length})` },
        ]}
        value={tab}
        onValueChange={setTab}
        variant="pills"
      />
      {tab === "essentials" && (
        <EssentialFieldsChecklist
          fields={fields}
          fieldRoles={fieldRoles}
          presence={presence}
          editable={editing}
          onAssign={(role, fieldId) =>
            edit((current) => ({
              ...current,
              field_roles: { ...current.field_roles, [role]: fieldId },
            }))
          }
        />
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
            {editing && (
              <button
                type="button"
                onClick={() => addField()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Campo
              </button>
            )}
          </div>
          {visibleFields.length === 0 ? (
            <Empty text="La v1 permanece vacía hasta que se cargue un esquema." />
          ) : (
            <FieldsByRole
              fields={visibleFields}
              readOnly={tableReadOnly}
              impact={impact}
              usage={usage}
              onChange={updateField}
              onOpen={setOpenFieldId}
            />
          )}
        </div>
      )}
      {tab === "proposals" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-4 text-xs">
            <p className="mb-2 font-semibold">Comparación con la versión activa</p>
            <SchemaDiff
              comparison={
                editing
                  ? compareLocally(active, { fields, field_roles: fieldRoles })
                  : (selected?.comparison ?? {})
              }
            />
          </div>
          {hasImpact && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-xs">
              <p className="font-semibold text-text-primary">
                <AlertTriangle className="mr-1 inline h-4 w-4" /> Impacto en uso
              </p>
              <ul className="mt-2 list-disc pl-5">
                {impact.map((item, index) => (
                  <li key={index}>{impactLabel(item)}</li>
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
        </div>
      )}
      {tab === "review" && (
        <ReviewInbox
          presence={presence}
          items={reviewItems}
          onAdd={addPresenceField}
          onIgnore={(location) => setIgnoredLocations((current) => new Set(current).add(location))}
        />
      )}
      <FieldDetailDrawer
        field={openField}
        readOnly={tableReadOnly}
        impact={impact}
        usage={usage}
        onChange={updateField}
        onClose={() => setOpenFieldId(null)}
      />
    </section>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  return (
    <div
      role="alert"
      data-testid="schema-validation-errors"
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
