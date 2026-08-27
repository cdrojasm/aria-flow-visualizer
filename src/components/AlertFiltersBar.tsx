import { ChannelFilter, type ChannelFilterValue } from "@/components/ChannelFilter";
import { RulesFilter } from "@/components/RulesFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { matchesMonto, MONTO_TIERS, type MontoTier } from "@/lib/montoTiers";

export type AlertFiltersValue = ChannelFilterValue & { monto: MontoTier; reglas: string[] };

// Filtros comunes a las tablas de alertas (Histórico de fraude y En proceso/Cola):
// canal/subcanal/segmento + monto + reglas disparadas por el motor de riesgo.
// Cada página añade sus filtros propios (Estado, Método de resolución, …) al lado.
export function AlertFiltersBar({ value, onChange }: { value: AlertFiltersValue; onChange: (v: AlertFiltersValue) => void }) {
  return (
    <>
      <ChannelFilter
        value={{ canal: value.canal, subcanal: value.subcanal, segmento: value.segmento }}
        onChange={(v) => onChange({ ...value, ...v })}
      />
      <Select value={value.monto} onValueChange={(v) => onChange({ ...value, monto: v as MontoTier })}>
        <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Monto" /></SelectTrigger>
        <SelectContent>
          {MONTO_TIERS.map((m) => <SelectItem key={m} value={m}>{m === "Todos" ? "Todos los montos" : m}</SelectItem>)}
        </SelectContent>
      </Select>
      <RulesFilter value={value.reglas} onChange={(reglas) => onChange({ ...value, reglas })} />
    </>
  );
}

// row: dimensiones ya normalizadas al vocabulario del filtro (p.ej. en Histórico,
// canal/subcanal son texto libre de despliegue y se mapean aparte a canalFiltro/subcanalFiltro).
export function matchesAlertFilters(row: { canal: string; subcanal: string; segmento: string; monto: number; reglas: readonly string[] }, filters: AlertFiltersValue): boolean {
  if (filters.canal !== "Todos" && row.canal !== filters.canal) return false;
  if (filters.subcanal !== "Todos" && row.subcanal !== filters.subcanal) return false;
  if (filters.segmento !== "Todos" && row.segmento !== filters.segmento) return false;
  if (filters.reglas.length > 0 && !filters.reglas.some((r) => row.reglas.includes(r))) return false;
  return matchesMonto(row.monto, filters.monto);
}
