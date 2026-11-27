import { SideDrawer } from "@/components/ui/side-drawer";
import type { AlertSchemaField, AlertSchemaUsage } from "@/lib/api/alertSchema.functions";
import { FIELD_ROLE_LABELS, deriveFieldRole } from "@/lib/alertSchemaRoles";
import { fieldConsumers } from "./schemaHelpers";

const inputClass = "w-full rounded border border-border bg-background px-2 py-1 text-xs";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

/** Side panel with the secondary attributes of one schema field. */
export function FieldDetailDrawer({
  field,
  readOnly,
  impact,
  usage = null,
  onChange,
  onClose,
}: {
  field: AlertSchemaField | null;
  readOnly: boolean;
  impact: Record<string, unknown>[];
  usage?: AlertSchemaUsage | null;
  onChange: (id: string, patch: Partial<AlertSchemaField>) => void;
  onClose: () => void;
}) {
  const role = field ? deriveFieldRole(field) : "alert";
  const consumers = field ? fieldConsumers(field, usage, impact) : [];
  return (
    <SideDrawer
      open={!!field}
      onOpenChange={(open) => !open && onClose()}
      title={field ? `Campo ${field.field || field.id}` : "Campo"}
      description={field ? FIELD_ROLE_LABELS[role] : undefined}
      size="md"
    >
      {field && (
        <div data-testid="field-detail" className="space-y-3">
          <Row label="Descripción">
            <textarea
              aria-label={`Descripción ${field.id}`}
              value={field.description}
              disabled={readOnly}
              onChange={(e) => onChange(field.id, { description: e.target.value })}
              className={`${inputClass} min-h-20`}
            />
          </Row>
          <Row label="Ubicación">
            <input
              aria-label={`Ubicación ${field.id}`}
              value={field.field_ds_loc}
              disabled={readOnly}
              onChange={(e) => onChange(field.id, { field_ds_loc: e.target.value })}
              className={inputClass}
            />
          </Row>
          <Row label="Origen">
            <select
              aria-label={`Origen ${field.id}`}
              value={field.data_source}
              disabled={readOnly || role === "agent_result"}
              onChange={(e) =>
                onChange(field.id, {
                  data_source: e.target.value as AlertSchemaField["data_source"],
                })
              }
              className={inputClass}
            >
              <option>aric</option>
              <option>host</option>
              {role === "agent_result" && <option>aria</option>}
            </select>
          </Row>
          <Row label="Grupo">
            <input
              aria-label={`Grupo ${field.id}`}
              value={field.group}
              disabled={readOnly}
              onChange={(e) => onChange(field.id, { group: e.target.value })}
              className={inputClass}
            />
          </Row>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ["Core", "is_core", false],
                ["Obligatorio", "is_mandatory", role === "agent_result"],
                ["Sensible", "is_sensible", false],
                ["Locale", "use_locale", false],
              ] as const
            ).map(([label, key, blocked]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  aria-label={`${label} ${field.id}`}
                  type="checkbox"
                  checked={field[key]}
                  disabled={readOnly || blocked}
                  onChange={(e) => onChange(field.id, { [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-border p-2 text-xs">
            <label className="flex items-center gap-2 font-medium">
              <input
                aria-label={`Es un identificador ${field.id}`}
                type="checkbox"
                checked={field.is_identifier === true}
                disabled={readOnly}
                onChange={(e) => onChange(field.id, { is_identifier: e.target.checked })}
              />
              Es un identificador
            </label>
            <p className="text-[11px] text-text-secondary">
              Un identificador (id de cliente, cuenta, evento) no aporta señal al modelo y se
              memoriza: se excluye de las variables sugeridas.
            </p>
            <label className="flex items-center gap-2 font-medium">
              <input
                aria-label={`Disponible al momento de decidir ${field.id}`}
                type="checkbox"
                checked={field.available_at_decision !== false}
                disabled={readOnly}
                onChange={(e) => onChange(field.id, { available_at_decision: e.target.checked })}
              />
              Disponible al momento de decidir
            </label>
            <p className="text-[11px] text-text-secondary">
              Desmárcalo si el dato solo se conoce después de decidir (por ejemplo, un resultado
              posterior): usarlo como variable filtraría la respuesta, así que se excluye.
            </p>
          </div>
          <Row label="Estrategia sensible">
            <select
              aria-label={`Estrategia sensible ${field.id}`}
              value={field.sensitivity_strategy ?? ""}
              disabled={readOnly || !field.is_sensible}
              onChange={(e) => onChange(field.id, { sensitivity_strategy: e.target.value || null })}
              className={inputClass}
            >
              <option value="">—</option>
              <option value="anonymize">anonymize</option>
              <option value="obfuscate">obfuscate</option>
            </select>
          </Row>
          <Row label="Tipo de locale">
            <input
              aria-label={`Tipo de locale ${field.id}`}
              value={field.locale_type ?? ""}
              disabled={readOnly || !field.use_locale}
              onChange={(e) => onChange(field.id, { locale_type: e.target.value || null })}
              className={inputClass}
            />
          </Row>
          <p className="text-xs text-text-secondary">
            Usado por: {consumers.length ? consumers.map((c) => c.label).join(", ") : "—"}
          </p>
          {consumers.length > 0 && (
            <p
              data-testid="field-usage-warning"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700"
            >
              Lo usan: {consumers.map((c) => c.label).join(", ")}. Cambiar este campo puede requerir
              revisar esos modelos o configuraciones.
            </p>
          )}
        </div>
      )}
    </SideDrawer>
  );
}
