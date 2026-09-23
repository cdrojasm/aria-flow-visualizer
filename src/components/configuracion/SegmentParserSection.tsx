import type { AlertFieldType, AlertParserConfig } from "@/data/configs";

const FIELD_TYPES: { value: AlertFieldType; label: string }[] = [
  { value: "string", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Booleano" },
  { value: "date", label: "Fecha" },
  { value: "datetime", label: "Fecha y hora" },
];

export function SegmentParserSection({ value, onChange, disabled }: {
  value: AlertParserConfig;
  onChange: (value: AlertParserConfig) => void;
  disabled?: boolean;
}) {
  const update = (id: string, patch: Partial<AlertParserConfig["fields"][number]>) =>
    onChange({ fields: value.fields.map((field) => field.id === id ? { ...field, ...patch } : field) });

  return <section className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
    <div className="border-b border-border px-5 py-4">
      <h3 className="text-[14px] font-semibold text-text-primary">Esquema de entrada de la alerta</h3>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        Define los campos esperados, su alias de transformación y el tipo que recibirá el agente.
      </p>
    </div>
    <div className="space-y-3 p-5">
      {value.fields.map((field) => <div key={field.id} className="grid gap-2 md:grid-cols-[1fr_1fr_150px_auto]">
        <input value={field.sourceField} disabled={disabled} onChange={(e) => update(field.id, { sourceField: e.target.value })}
          placeholder="Campo de entrada" className="h-9 rounded-md border border-border bg-background px-3 text-[12px]" />
        <input value={field.alias} disabled={disabled} onChange={(e) => update(field.id, { alias: e.target.value })}
          placeholder="Alias transformado" className="h-9 rounded-md border border-border bg-background px-3 text-[12px]" />
        <select value={field.type} disabled={disabled} onChange={(e) => update(field.id, { type: e.target.value as AlertFieldType })}
          className="h-9 rounded-md border border-border bg-background px-2 text-[12px]">
          {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <button type="button" disabled={disabled} onClick={() => onChange({ fields: value.fields.filter((item) => item.id !== field.id) })}
          className="text-[12px] text-danger disabled:opacity-50">Quitar</button>
      </div>)}
      <button type="button" disabled={disabled} onClick={() => onChange({ fields: [...value.fields, { id: crypto.randomUUID(), sourceField: "", alias: "", type: "string" }] })}
        className="text-[12px] font-medium text-primary hover:underline disabled:opacity-50">+ Agregar campo esperado</button>
    </div>
  </section>;
}
