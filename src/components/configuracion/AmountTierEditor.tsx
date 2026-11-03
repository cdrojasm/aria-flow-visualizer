import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { formatTierBounds, validateAmountTiers, type AmountTier } from "@/lib/amountTiers";

/* Amount-tier editor (Operación → Rangos de monto). Each alert is
   classified into a tier once, when it arrives, and keeps it: editing the
   tiers only affects new alerts. Live validation mirrors the backend's
   (contiguous, no overlaps, 0 → ∞); the parent blocks saving while
   `validateAmountTiers` reports errors. */

const inputClass =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] focus:outline-none focus:border-primary";

function parseBound(raw: string): number {
  return raw.trim() === "" ? Number.NaN : Number(raw);
}

export function AmountTierEditor({
  value,
  onChange,
}: {
  value: AmountTier[];
  onChange: (tiers: AmountTier[]) => void;
}) {
  const errors = validateAmountTiers(value);
  const update = (index: number, changes: Partial<AmountTier>) =>
    onChange(value.map((tier, i) => (i === index ? { ...tier, ...changes } : tier)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => {
    const last = value[value.length - 1];
    const start = last ? (last.maxExclusive ?? last.minInclusive) : 0;
    onChange([...value, { code: "", label: "", minInclusive: start, maxExclusive: null }]);
  };
  const rows = value.map((tier, index) => ({ ...tier, rowIndex: index }));
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: "code",
      label: "Código",
      minWidth: 150,
      render: (row) => (
        <input
          aria-label={`Código del rango ${row.rowIndex + 1}`}
          value={row.code}
          maxLength={60}
          onChange={(e) => update(row.rowIndex, { code: e.target.value })}
          className={inputClass}
        />
      ),
      searchValue: (row) => row.code,
    },
    {
      key: "label",
      label: "Etiqueta",
      minWidth: 170,
      render: (row) => (
        <input
          aria-label={`Etiqueta del rango ${row.rowIndex + 1}`}
          value={row.label}
          maxLength={120}
          onChange={(e) => update(row.rowIndex, { label: e.target.value })}
          className={inputClass}
        />
      ),
      searchValue: (row) => row.label,
    },
    {
      key: "min",
      label: "Desde (incl.)",
      minWidth: 130,
      render: (row) => (
        <input
          aria-label={`Desde del rango ${row.rowIndex + 1}`}
          type="number"
          min={0}
          value={Number.isFinite(row.minInclusive) ? row.minInclusive : ""}
          onChange={(e) => update(row.rowIndex, { minInclusive: parseBound(e.target.value) })}
          className={inputClass}
        />
      ),
      searchValue: (row) => String(row.minInclusive),
    },
    {
      key: "max",
      label: "Hasta (excl.)",
      minWidth: 150,
      render: (row) => (
        <input
          aria-label={`Hasta del rango ${row.rowIndex + 1}`}
          type="number"
          min={0}
          placeholder="∞ (sin tope)"
          value={row.maxExclusive ?? ""}
          onChange={(e) =>
            update(row.rowIndex, {
              maxExclusive: e.target.value.trim() === "" ? null : Number(e.target.value),
            })
          }
          className={inputClass}
        />
      ),
      searchValue: (row) => String(row.maxExclusive ?? "∞"),
    },
    {
      key: "range",
      label: "Rango",
      minWidth: 140,
      render: (row) => (
        <span className="whitespace-nowrap text-text-secondary tabular-nums">
          {Number.isFinite(row.minInclusive) ? formatTierBounds(row) : "—"}
        </span>
      ),
      searchValue: (row) => formatTierBounds(row),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[12px] text-text-primary">
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p>
          <span className="font-semibold">Sólo aplica a alertas nuevas.</span> Cada alerta guarda el
          rango con el que se clasificó al llegar; las ya recibidas no se reclasifican. Juego de
          rangos vigente.
        </p>
      </div>

      {value.length === 0 && (
        <p className="text-[12px] text-text-secondary">
          Sin rangos configurados: todas las alertas nuevas quedan como <code>unknown</code>.
        </p>
      )}
      <DataTable
        storageKey="configuration.amount-tiers"
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.rowIndex)}
        pageSize={100}
        hidePagination={rows.length <= 100}
        itemLabel="rango"
        emptyLabel="Sin rangos configurados."
        actions={(row) => (
          <button
            type="button"
            aria-label={`Eliminar rango ${row.rowIndex + 1}`}
            onClick={() => remove(row.rowIndex)}
            className="p-1 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-background"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar rango
        </button>
        <span className="text-[11px] text-text-secondary">
          Deben ser contiguos, sin solapes, empezar en 0 y el último sin tope.
        </span>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-[12px] text-danger space-y-1"
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
