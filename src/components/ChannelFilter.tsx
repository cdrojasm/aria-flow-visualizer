import { useQuery } from "@tanstack/react-query";
import { CANALES, subcanalesFor, type Canal, type Segmento } from "@/data/channels";
import { listChannelLibraryEntries } from "@/lib/api/channelLibrary.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ChannelFilterValue = { canal: Canal; subcanal: string; segmento: Segmento };

// Canal filtra el medio (Tarjeta, ATM, Web, Mobile App); subcanal filtra el entrypoint
// dentro del canal elegido (p.ej. Tarjeta -> Contactless, ATM -> Retiro). Cambiar de
// canal resetea el subcanal porque las opciones dependen del canal seleccionado.
// Segmento es una dimensión aparte y viene del catálogo de canales (Biblioteca →
// Canales), no de un enum fijo — mismo queryKey que configuracion.tsx/biblioteca.tsx
// usan para el catálogo, así que comparten caché.
export function ChannelFilter({ value, onChange }: { value: ChannelFilterValue; onChange: (v: ChannelFilterValue) => void }) {
  const subcanales = subcanalesFor(value.canal);
  const channelsQuery = useQuery({
    queryKey: ["channelLibrary"],
    queryFn: () => listChannelLibraryEntries({ data: { activeOnly: true } }),
  });
  const segmentos = ["Todos", ...(channelsQuery.data ?? []).map((c) => c.name)];
  return (
    <>
      <Select value={value.canal} onValueChange={(v) => onChange({ ...value, canal: v as Canal, subcanal: "Todos" })}>
        <SelectTrigger className="h-[30px] w-[130px] text-[11px]"><SelectValue placeholder="Canal" /></SelectTrigger>
        <SelectContent>
          {CANALES.map((c) => <SelectItem key={c} value={c}>{c === "Todos" ? "Todos los canales" : c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.subcanal} onValueChange={(v) => onChange({ ...value, subcanal: v })} disabled={subcanales.length === 0}>
        <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Subcanal" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Todos">Todos los subcanales</SelectItem>
          {subcanales.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.segmento} onValueChange={(v) => onChange({ ...value, segmento: v as Segmento })}>
        <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Segmento" /></SelectTrigger>
        <SelectContent>
          {segmentos.map((s) => <SelectItem key={s} value={s}>{s === "Todos" ? "Todos los segmentos" : s}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );
}
