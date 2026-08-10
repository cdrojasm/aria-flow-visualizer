import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RefreshControl } from "@/components/RefreshControl";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ChannelFilter } from "@/components/ChannelFilter";
import { SEGMENTO_BADGES, type Canal, type Segmento } from "@/data/channels";
import { MONTO_TIERS, matchesMonto, type MontoTier } from "@/lib/montoTiers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/cola")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Alertas en proceso — revisión y gestión de alertas activas." },
    ],
  }),
  component: ColaPage,
});

type Verdict = "Probable fraude" | "Incierto" | "Revisar señales";

type BaseRow = {
  id: string;
  userId: string;
  arrival: string;
  queueMinutes: number;
  amount: string;
  canal: Canal;
  subcanal: string;
  segmento: Exclude<Segmento, "Todos">;
};

// ARIA aún está analizando el caso — no se ha derivado a ningún medio de resolución.
type ProcesoRow = BaseRow & {
  subAgente: string;
  etapa: string;
};

// ARIA ya derivó el caso a un analista humano — puede estar sin tomar o ya asignado.
type PendingRow = BaseRow & {
  verdict: Verdict;
  analista?: string;
};

type SortKey = "arrival" | "queueMinutes" | "amount" | "canal" | "subcanal" | "segmento";

const QUEUE_THRESHOLD = 12;

const procesoRows: ProcesoRow[] = [
  {
    id: "ALR-48190", userId: "USR-***1102", arrival: "10:15", queueMinutes: 11,
    amount: "—", canal: "Mobile App", subcanal: "Login", segmento: "Canales Digitales",
    subAgente: "Sub-agente PHISH-02", etapa: "Analizando patrón de acceso",
  },
  {
    id: "ALR-48177", userId: "USR-***7788", arrival: "09:58", queueMinutes: 9,
    amount: "$ 800.00 USD", canal: "ATM", subcanal: "Retiro", segmento: "Tarjeta",
    subAgente: "Sub-agente FRAUD-01", etapa: "Verificando geolocalización",
  },
  {
    id: "ALR-48165", userId: "USR-***NEW01", arrival: "09:42", queueMinutes: 6,
    amount: "—", canal: "Web", subcanal: "Login", segmento: "Canales Digitales",
    subAgente: "Sub-agente IDV-01", etapa: "Validando documento",
  },
];

const initialPendingRows: PendingRow[] = [
  {
    id: "ALR-48201", userId: "USR-***4821", arrival: "10:42", queueMinutes: 18,
    amount: "$ 2,450.00 USD", canal: "Tarjeta", subcanal: "Contactless", segmento: "Tarjeta",
    verdict: "Probable fraude", analista: "Laura Gómez",
  },
  {
    id: "ALR-48198", userId: "USR-***3344", arrival: "10:30", queueMinutes: 14,
    amount: "$ 9,800.00 USD", canal: "Web", subcanal: "Transferencia", segmento: "Canales Digitales",
    verdict: "Incierto",
  },
  {
    id: "ALR-48150", userId: "USR-***2233", arrival: "09:21", queueMinutes: 4,
    amount: "$ 1,200.00 USD", canal: "Web", subcanal: "Pago PSE", segmento: "Canales Digitales",
    verdict: "Revisar señales", analista: "Diego Torres",
  },
];

const verdictStyles: Record<Verdict, string> = {
  "Probable fraude": "bg-[#fee2e2] text-[#991b1b]",
  "Incierto": "bg-[#fef3c7] text-[#92400e]",
  "Revisar señales": "bg-[#f3f4f6] text-[#374151]",
};
function parseAmount(amount: string): number {
  const num = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function matchesFilters(row: BaseRow, filters: { canal: Canal; subcanal: string; segmento: Segmento; monto: MontoTier }): boolean {
  if (filters.canal !== "Todos" && row.canal !== filters.canal) return false;
  if (filters.subcanal !== "Todos" && row.subcanal !== filters.subcanal) return false;
  if (filters.segmento !== "Todos" && row.segmento !== filters.segmento) return false;
  if (!matchesMonto(parseAmount(row.amount), filters.monto)) return false;
  return true;
}

function sortValue(row: BaseRow, key: SortKey): string | number {
  if (key === "amount") return parseAmount(row.amount);
  if (key === "arrival") return row.queueMinutes;
  return row[key];
}

function useSortedRows<T extends BaseRow>(rows: T[], sortKey: SortKey, sortDir: "asc" | "desc") {
  return useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);
}

function SortableHeader({ label, align, sortable, active, dir, onClick }: {
  label: string; align?: "right"; sortable?: boolean; active: boolean; dir: "asc" | "desc"; onClick: () => void;
}) {
  return (
    <th className={`font-normal py-3 whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {sortable ? (
        <button
          onClick={onClick}
          className={`inline-flex items-center gap-1 hover:text-text-primary transition-colors ${active ? "text-text-primary font-medium" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          {active ? (
            dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function BaseCells({ row }: { row: BaseRow }) {
  const overdue = row.queueMinutes >= QUEUE_THRESHOLD;
  return (
    <>
      <td className="py-3 text-[13px] font-medium text-text-primary tabular-nums whitespace-nowrap">{row.id}</td>
      <td className="py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">{row.userId}</td>
      <td className="py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">{row.arrival}</td>
      <td className={`py-3 text-[13px] tabular-nums font-medium whitespace-nowrap ${overdue ? "text-danger" : "text-text-secondary"}`}>{row.queueMinutes} min</td>
    </>
  );
}

function AmountChannelSegmentoCells({ row }: { row: BaseRow }) {
  return (
    <>
      <td className="py-3 pr-4 text-[13px] text-text-primary tabular-nums text-right whitespace-nowrap">{row.amount}</td>
      <td className="py-3 pr-4 text-[13px] text-text-primary whitespace-nowrap">{row.canal}</td>
      <td className="py-3 pr-4 text-[13px] text-text-primary whitespace-nowrap">{row.subcanal}</td>
      <td className="py-3 pr-4 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${SEGMENTO_BADGES[row.segmento]}`}>{row.segmento}</span>
      </td>
    </>
  );
}

function ColaPage() {
  const [mainTab, setMainTab] = useState<"pending" | "proceso">("pending");
  const [sortKey, setSortKey] = useState<SortKey>("queueMinutes");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingRows, setPendingRows] = useState<PendingRow[]>(initialPendingRows);
  const { lastRefresh, refresh } = useAutoRefresh();
  const [filters, setFilters] = useState<{ canal: Canal; subcanal: string; segmento: Segmento; monto: MontoTier }>({
    canal: "Todos", subcanal: "Todos", segmento: "Todos", monto: "Todos",
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredProceso = useMemo(() => procesoRows.filter((r) => matchesFilters(r, filters)), [filters]);
  const filteredPending = useMemo(() => pendingRows.filter((r) => matchesFilters(r, filters)), [pendingRows, filters]);

  const sortedProceso = useSortedRows(filteredProceso, sortKey, sortDir);
  const sortedPending = useSortedRows(filteredPending, sortKey, sortDir);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const tomarCaso = (id: string) => {
    setPendingRows((prev) => prev.map((r) => (r.id === id ? { ...r, analista: "Tú" } : r)));
  };

  const activeCount = mainTab === "proceso" ? filteredProceso.length : filteredPending.length;

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-text-primary">In Progress</h1>
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold tabular-nums">
              {activeCount}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ChannelFilter
              value={{ canal: filters.canal, subcanal: filters.subcanal, segmento: filters.segmento }}
              onChange={(v) => setFilters((f) => ({ ...f, canal: v.canal, subcanal: v.subcanal, segmento: v.segmento }))}
            />
            <Select value={filters.monto} onValueChange={(v) => setFilters((f) => ({ ...f, monto: v as MontoTier }))}>
              <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Monto" /></SelectTrigger>
              <SelectContent>
                {MONTO_TIERS.map((m) => <SelectItem key={m} value={m}>{m === "Todos" ? "Todos los montos" : m}</SelectItem>)}
              </SelectContent>
            </Select>
            <RefreshControl lastRefresh={lastRefresh} onRefresh={refresh} />
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {([["pending", "Pending Alerts for Analyst"], ["proceso", "Alertas en proceso"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                mainTab === id ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mainTab === "proceso" ? (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">Alertas en proceso</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Casos que ARIA todavía está analizando — aún no se han derivado a analista ni voicebot.</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="w-10 px-4 py-3"></th>
                  <SortableHeader label="ID alerta" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Código Altamira" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Llegada" sortable active={sortKey === "arrival"} dir={sortDir} onClick={() => toggleSort("arrival")} />
                  <SortableHeader label="Tiempo en cola" sortable active={sortKey === "queueMinutes"} dir={sortDir} onClick={() => toggleSort("queueMinutes")} />
                  <SortableHeader label="Monto" align="right" sortable active={sortKey === "amount"} dir={sortDir} onClick={() => toggleSort("amount")} />
                  <SortableHeader label="Canal" sortable active={sortKey === "canal"} dir={sortDir} onClick={() => toggleSort("canal")} />
                  <SortableHeader label="Subcanal" sortable active={sortKey === "subcanal"} dir={sortDir} onClick={() => toggleSort("subcanal")} />
                  <SortableHeader label="Segmento" sortable active={sortKey === "segmento"} dir={sortDir} onClick={() => toggleSort("segmento")} />
                  <SortableHeader label="Sub-agente" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Etapa actual" active={false} dir={sortDir} onClick={() => {}} />
                  <th className="text-right font-normal px-4 py-3 w-[110px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedProceso.map((row, i) => (
                  <tr key={row.id} className={`border-t border-border transition-colors ${i % 2 === 1 ? "bg-surface" : "bg-card"} hover:bg-primary-light/60`}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-border accent-[rgb(0,17,148)]" />
                    </td>
                    <BaseCells row={row} />
                    <AmountChannelSegmentoCells row={row} />
                    <td className="py-3 pr-4 text-[13px] text-text-primary whitespace-nowrap">{row.subAgente}</td>
                    <td className="py-3 pr-4 text-[12px] text-text-secondary whitespace-nowrap">{row.etapa}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/alerta/$id" params={{ id: row.id }}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface">
                        Ver <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">Pending Alerts for Analyst</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Casos que ARIA ya derivó a un analista humano, tomados o sin tomar.</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="w-10 px-4 py-3"></th>
                  <SortableHeader label="ID alerta" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Código Altamira" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Llegada" sortable active={sortKey === "arrival"} dir={sortDir} onClick={() => toggleSort("arrival")} />
                  <SortableHeader label="Tiempo en cola" sortable active={sortKey === "queueMinutes"} dir={sortDir} onClick={() => toggleSort("queueMinutes")} />
                  <SortableHeader label="Veredicto" active={false} dir={sortDir} onClick={() => {}} />
                  <SortableHeader label="Monto" align="right" sortable active={sortKey === "amount"} dir={sortDir} onClick={() => toggleSort("amount")} />
                  <SortableHeader label="Canal" sortable active={sortKey === "canal"} dir={sortDir} onClick={() => toggleSort("canal")} />
                  <SortableHeader label="Subcanal" sortable active={sortKey === "subcanal"} dir={sortDir} onClick={() => toggleSort("subcanal")} />
                  <SortableHeader label="Segmento" sortable active={sortKey === "segmento"} dir={sortDir} onClick={() => toggleSort("segmento")} />
                  <SortableHeader label="Analista" active={false} dir={sortDir} onClick={() => {}} />
                  <th className="text-right font-normal px-4 py-3 w-[130px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedPending.map((row, i) => (
                  <tr key={row.id} className={`border-t border-border transition-colors ${i % 2 === 1 ? "bg-surface" : "bg-card"} hover:bg-primary-light/60`}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-border accent-[rgb(0,17,148)]" />
                    </td>
                    <BaseCells row={row} />
                    <td className="py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdictStyles[row.verdict]}`}>{row.verdict}</span>
                    </td>
                    <AmountChannelSegmentoCells row={row} />
                    <td className="py-3 pr-4 text-[13px] whitespace-nowrap">
                      {row.analista ? (
                        <span className="text-text-primary">{row.analista}</span>
                      ) : (
                        <span className="text-text-secondary italic">Sin tomar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.analista ? (
                        <Link to="/alerta/$id" params={{ id: row.id }}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90">
                          Abrir <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <button
                          onClick={() => tomarCaso(row.id)}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90"
                        >
                          Tomar caso
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
