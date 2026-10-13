import { AlertTriangle, Plus, Trash2 } from "lucide-react";
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

      {value.length === 0 ? (
        <p className="text-[12px] text-text-secondary">
          Sin rangos configurados: todas las alertas nuevas quedan como <code>unknown</code>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-secondary text-left">
                <th className="font-normal py-2 pr-2">Código</th>
                <th className="font-normal py-2 pr-2">Etiqueta</th>
                <th className="font-normal py-2 pr-2">Desde (incl.)</th>
                <th className="font-normal py-2 pr-2">Hasta (excl.)</th>
                <th className="font-normal py-2 pr-2">Rango</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {value.map((tier, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="py-2 pr-2 min-w-[110px]">
                    <input
                      aria-label={`Código del rango ${index + 1}`}
                      value={tier.code}
                      maxLength={60}
                      onChange={(e) => update(index, { code: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2 min-w-[140px]">
                    <input
                      aria-label={`Etiqueta del rango ${index + 1}`}
                      value={tier.label}
                      maxLength={120}
                      onChange={(e) => update(index, { label: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2 min-w-[110px]">
                    <input
                      aria-label={`Desde del rango ${index + 1}`}
                      type="number"
                      min={0}
                      value={Number.isFinite(tier.minInclusive) ? tier.minInclusive : ""}
                      onChange={(e) => update(index, { minInclusive: parseBound(e.target.value) })}
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2 min-w-[110px]">
                    <input
                      aria-label={`Hasta del rango ${index + 1}`}
                      type="number"
                      min={0}
                      placeholder="∞ (sin tope)"
                      value={tier.maxExclusive ?? ""}
                      onChange={(e) =>
                        update(index, {
                          maxExclusive:
                            e.target.value.trim() === "" ? null : Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-text-secondary tabular-nums">
                    {Number.isFinite(tier.minInclusive) ? formatTierBounds(tier) : "—"}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      aria-label={`Eliminar rango ${index + 1}`}
                      onClick={() => remove(index)}
                      className="p-1 rounded-md text-text-secondary hover:text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
