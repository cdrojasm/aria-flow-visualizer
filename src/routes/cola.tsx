import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

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
type AlertRow = {
  id: string; txType: string; arrival: string; queueMinutes: number;
  verdict: Verdict; confidence: number; type: "Fraude tarjeta" | "Phishing" | "Lavado" | "Identidad" | "Cuenta mula";
  amount: string; channel: string; merchant: string; device: string; userId: string; segment: string;
  signals: { label: string; level: "danger" | "warning" | "neutral" }[];
};
type SortKey = "oldest" | "confidence" | "type";

const QUEUE_THRESHOLD = 12;

const rows: AlertRow[] = [
  {
    id: "ALR-48201", txType: "Compra POS", arrival: "10:42", queueMinutes: 18,
    verdict: "Probable fraude", confidence: 92, type: "Fraude tarjeta",
    amount: "$ 2,450.00 USD", channel: "POS", merchant: "ElectroMax (BR)", device: "Card-Present",
    userId: "USR-***4821", segment: "Premium",
    signals: [
      { label: "Geolocalización anómala", level: "danger" },
      { label: "Monto fuera de patrón", level: "danger" },
      { label: "Comercio de alto riesgo", level: "warning" },
    ],
  },
  {
    id: "ALR-48198", txType: "Transferencia", arrival: "10:30", queueMinutes: 14,
    verdict: "Incierto", confidence: 64, type: "Lavado",
    amount: "$ 9,800.00 USD", channel: "Web", merchant: "P2P – USR-***9012", device: "Chrome / Win",
    userId: "USR-***3344", segment: "Estándar",
    signals: [
      { label: "Múltiples destinos en 24h", level: "warning" },
      { label: "Estructuración sospechosa", level: "warning" },
      { label: "Cuenta nueva (<30d)", level: "neutral" },
    ],
  },
  {
    id: "ALR-48190", txType: "Login + cambio datos", arrival: "10:15", queueMinutes: 11,
    verdict: "Revisar señales", confidence: 41, type: "Phishing",
    amount: "—", channel: "Mobile App", merchant: "—", device: "iOS 17 / iPhone 14",
    userId: "USR-***1102", segment: "Estándar",
    signals: [
      { label: "Nuevo dispositivo", level: "warning" },
      { label: "Cambio de email", level: "danger" },
      { label: "IP de VPN conocida", level: "warning" },
    ],
  },
  {
    id: "ALR-48177", txType: "Retiro ATM", arrival: "09:58", queueMinutes: 9,
    verdict: "Probable fraude", confidence: 88, type: "Fraude tarjeta",
    amount: "$ 800.00 USD", channel: "ATM", merchant: "ATM #4521 Miami", device: "Card-Present",
    userId: "USR-***7788", segment: "Premium",
    signals: [
      { label: "País distinto a residencia", level: "danger" },
      { label: "Velocidad de uso", level: "warning" },
      { label: "PIN reintentado", level: "warning" },
    ],
  },
  {
    id: "ALR-48165", txType: "Apertura cuenta", arrival: "09:42", queueMinutes: 6,
    verdict: "Incierto", confidence: 58, type: "Identidad",
    amount: "—", channel: "Web", merchant: "—", device: "Chrome / Mac",
    userId: "USR-***NEW01", segment: "Nuevo",
    signals: [
      { label: "Documento de baja calidad", level: "warning" },
      { label: "Email desechable", level: "warning" },
      { label: "Coincidencia parcial con lista", level: "neutral" },
    ],
  },
  {
    id: "ALR-48150", txType: "Transferencia", arrival: "09:21", queueMinutes: 4,
    verdict: "Revisar señales", confidence: 36, type: "Cuenta mula",
    amount: "$ 1,200.00 USD", channel: "Web", merchant: "P2P – USR-***5566", device: "Edge / Win",
    userId: "USR-***2233", segment: "Estándar",
    signals: [
      { label: "Patrón pass-through", level: "warning" },
      { label: "Beneficiario reciente", level: "neutral" },
      { label: "Sin historia previa", level: "neutral" },
    ],
  },
];

const slaRows = [
  { id: "ALR-48201", stage: "Agente ARIA", elapsed: "07:42", pct: 92, level: "danger" as const },
  { id: "ALR-48198", stage: "Analista", elapsed: "06:15", pct: 78, level: "warning" as const },
  { id: "ALR-48190", stage: "Voicebot", elapsed: "05:03", pct: 65, level: "warning" as const },
  { id: "ALR-48177", stage: "Analista", elapsed: "04:48", pct: 58, level: "warning" as const },
  { id: "ALR-48165", stage: "Agente ARIA", elapsed: "03:21", pct: 42, level: "success" as const },
  { id: "ALR-48150", stage: "Voicebot", elapsed: "02:58", pct: 36, level: "success" as const },
];
const slaMap = Object.fromEntries(slaRows.map((r) => [r.id, r]));

const taxonomyColors: Record<string, string> = {
  "Fraude tarjeta": "bg-[#fee2e2] text-[#991b1b]",
  "Lavado": "bg-[#fef3c7] text-[#92400e]",
  "Phishing": "bg-[#ede9fe] text-[#5b21b6]",
  "Identidad": "bg-[#dbeafe] text-[#1e40af]",
  "Cuenta mula": "bg-[#fce7f3] text-[#9d174d]",
};
const verdictBadges: Record<string, string> = {
  "Auto-resuelto": "bg-[#dcfce7] text-[#166534]",
  "Derivado a analista": "bg-primary-light text-primary",
  "Sospechoso re-evaluado": "bg-[#fef3c7] text-[#92400e]",
};
const verdictStyles: Record<Verdict, string> = {
  "Probable fraude": "bg-[#fee2e2] text-[#991b1b]",
  "Incierto": "bg-[#fef3c7] text-[#92400e]",
  "Revisar señales": "bg-[#f3f4f6] text-[#374151]",
};
const signalColors = {
  danger: "bg-[#fee2e2] text-[#991b1b]",
  warning: "bg-[#fef3c7] text-[#92400e]",
  neutral: "bg-[#f3f4f6] text-[#374151]",
};

const activity = Array.from({ length: 14 }).map((_, i) => {
  const samples = [
    { type: "Fraude tarjeta", verdict: "Auto-resuelto", agent: "Sub-agente FRAUD-01" },
    { type: "Phishing", verdict: "Derivado a analista", agent: "Sub-agente PHISH-02" },
    { type: "Lavado", verdict: "Sospechoso re-evaluado", agent: "Sub-agente AML-03" },
    { type: "Identidad", verdict: "Auto-resuelto", agent: "Sub-agente IDV-01" },
    { type: "Cuenta mula", verdict: "Derivado a analista", agent: "Sub-agente MULE-02" },
  ];
  const s = samples[i % samples.length];
  return { id: `ALR-${48210 - i}`, time: `Hace ${i * 3 + 2} min`, ...s };
});

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-danger" : value >= 50 ? "bg-warning" : "bg-neutral";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="h-1.5 flex-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-text-secondary w-9 text-right">{value}%</span>
    </div>
  );
}

function ColaPage() {
  const [mainTab, setMainTab] = useState<"pending" | "proceso" | "historico">("pending");
  const [sort, setSort] = useState<SortKey>("oldest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [histSearch, setHistSearch] = useState("");

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "oldest") copy.sort((a, b) => b.queueMinutes - a.queueMinutes);
    if (sort === "confidence") copy.sort((a, b) => b.confidence - a.confidence);
    if (sort === "type") copy.sort((a, b) => a.type.localeCompare(b.type));
    return copy;
  }, [sort]);

  const filteredActivity = useMemo(() =>
    histSearch.trim()
      ? activity.filter(r => r.id.toLowerCase().includes(histSearch.toLowerCase()))
      : activity,
    [histSearch]
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-text-primary">In Progress</h1>
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold tabular-nums">
              {rows.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-text-secondary">Ordenar</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="oldest">Más antiguas primero</option>
              <option value="confidence">Por confianza del agente</option>
              <option value="type">Por tipo de caso</option>
            </select>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {([["pending", "Pending Alerts for Analyst"], ["proceso", "Alertas en proceso"], ["historico", "Histórico de Fraude"]] as const).map(([id, label]) => (
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

        {(mainTab === "pending" || mainTab === "proceso") && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">
                {mainTab === "pending" ? "Pending Alerts for Analyst" : "Alertas en proceso"}
              </h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="text-left font-normal py-3 w-[110px]">ID alerta</th>
                  <th className="text-left font-normal py-3">Tipo de transacción</th>
                  <th className="text-left font-normal py-3 w-[110px]">Llegada</th>
                  <th className="text-left font-normal py-3 w-[130px]">Tiempo en cola</th>
                  <th className="text-left font-normal py-3 w-[170px]">Veredicto</th>
                  <th className="text-left font-normal py-3 w-[180px]">Confianza</th>
                  <th className="text-left font-normal py-3 w-[160px]">SLA</th>
                  <th className="text-right font-normal px-4 py-3 w-[110px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const overdue = row.queueMinutes >= QUEUE_THRESHOLD;
                  const sla = slaMap[row.id];
                  return (
                    <tr key={row.id} className={`border-t border-border transition-colors ${i % 2 === 1 ? "bg-surface" : "bg-card"} hover:bg-primary-light/60`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="h-4 w-4 rounded border-border accent-[rgb(0,17,148)]" />
                      </td>
                      <td className="py-3 text-[13px] font-medium text-text-primary tabular-nums">{row.id}</td>
                      <td className="py-3 text-[13px] text-text-primary">{row.txType}</td>
                      <td className="py-3 text-[12px] text-text-secondary tabular-nums">{row.arrival}</td>
                      <td className={`py-3 text-[13px] tabular-nums font-medium ${overdue ? "text-danger" : "text-text-secondary"}`}>{row.queueMinutes} min</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdictStyles[row.verdict]}`}>{row.verdict}</span>
                      </td>
                      <td className="py-3 pr-4"><ConfidenceBar value={row.confidence} /></td>
                      <td className="py-3 pr-4">
                        {sla ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-border rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${sla.level === "danger" ? "bg-danger" : sla.level === "warning" ? "bg-warning" : "bg-success"}`} style={{ width: `${sla.pct}%` }} />
                            </div>
                            <span className="text-[11px] tabular-nums text-text-secondary w-9 text-right">{sla.elapsed}</span>
                          </div>
                        ) : <span className="text-text-secondary text-[12px]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/alerta/$id" params={{ id: row.id }}
                          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90">
                          Abrir <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {mainTab === "historico" && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-5 pt-4 pb-3 border-b border-border space-y-3">
              <h2 className="text-[14px] font-semibold text-text-primary">Histórico de Fraude</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
                <input
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  placeholder="Buscar por código de alerta (ej. ALR-48205)…"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="text-left font-normal px-5 py-3 w-[140px]">Timestamp</th>
                  <th className="text-left font-normal py-3 w-[120px]">Alerta</th>
                  <th className="text-left font-normal py-3">Tipo</th>
                  <th className="text-left font-normal py-3">Veredicto</th>
                  <th className="text-left font-normal px-5 py-3">Sub-agente</th>
                  <th className="text-right font-normal px-5 py-3 w-[110px]">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivity.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[13px] text-text-secondary">
                      No se encontraron alertas con ese código.
                    </td>
                  </tr>
                ) : filteredActivity.map((row, i) => (
                  <tr key={row.id} className={`border-t border-border ${i % 2 === 1 ? "bg-surface" : "bg-card"}`}>
                    <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums">{row.time}</td>
                    <td className="py-3 text-[13px] font-medium text-text-primary tabular-nums">{row.id}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${taxonomyColors[row.type]}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdictBadges[row.verdict]}`}>
                        {row.verdict}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-text-secondary">{row.agent}</td>
                    <td className="px-5 py-3 text-right">
                      <Link to="/alerta/$id" params={{ id: row.id }}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface">
                        Ver <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-border flex justify-between items-center">
              <span className="text-[11px] text-text-secondary">
                {filteredActivity.length} resultado{filteredActivity.length !== 1 ? "s" : ""}
              </span>
              {!histSearch && (
                <button className="text-[12px] font-medium text-primary hover:underline">Cargar más</button>
              )}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
