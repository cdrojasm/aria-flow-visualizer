import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ChevronRight, Search, ArrowUp, ArrowDown, ArrowUpDown, Upload, Download,
  Loader2, X, FileSpreadsheet, CalendarRange,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RefreshControl } from "@/components/RefreshControl";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { ChannelFilter } from "@/components/ChannelFilter";
import { subcanalesFor, SEGMENTO_BADGES, type Canal, type Segmento } from "@/data/channels";
import { MONTO_TIERS, matchesMonto, type MontoTier } from "@/lib/montoTiers";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/historico-fraude")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Histórico de gestión de fraude — alertas ya resueltas por el agente." },
    ],
  }),
  component: HistoricoFraudePage,
});

type TipoAlerta = "Fraude tarjeta" | "Phishing" | "Lavado" | "Identidad" | "Cuenta mula";
type Veredicto = "Auto-resuelto" | "Derivado a analista" | "Sospechoso re-evaluado";
type EstadoFraude = "Fraude" | "No Fraude";

type HistRow = {
  id: string;
  time: string;
  minutesAgo: number;
  usuario: string;
  tipoAlerta: TipoAlerta;
  segmento: Exclude<Segmento, "Todos">;
  canal: string;
  canalFiltro: Canal;
  subcanalFiltro: string;
  monto: number;
  analista: string;
  verdict: Veredicto;
  agent: string;
  estado: EstadoFraude;
  nota?: string;
};

// mapea el canal de despliegue (texto libre en la tabla) al canal del filtro compartido con el Dashboard
const CANAL_FILTER_MAP: Record<string, Canal> = {
  "POS": "Tarjeta",
  "ATM": "ATM",
  "Página Web": "Web",
  "GLOMO": "Web",
  "App Móvil": "Mobile App",
};

function pickSubcanal(canal: Canal, seedIndex: number): string {
  const opts = subcanalesFor(canal);
  return opts.length ? opts[seedIndex % opts.length] : "Todos";
}

const ESTADO_FILTERS = ["Todos", "Fraude", "No Fraude"] as const;

const taxonomyColors: Record<TipoAlerta, string> = {
  "Fraude tarjeta": "bg-[#fee2e2] text-[#991b1b]",
  "Lavado": "bg-[#fef3c7] text-[#92400e]",
  "Phishing": "bg-[#ede9fe] text-[#5b21b6]",
  "Identidad": "bg-[#dbeafe] text-[#1e40af]",
  "Cuenta mula": "bg-[#fce7f3] text-[#9d174d]",
};
const verdictBadges: Record<Veredicto, string> = {
  "Auto-resuelto": "bg-[#dcfce7] text-[#166534]",
  "Derivado a analista": "bg-primary-light text-primary",
  "Sospechoso re-evaluado": "bg-[#fef3c7] text-[#92400e]",
};
const estadoBadges: Record<EstadoFraude, string> = {
  "Fraude": "bg-[#fee2e2] text-[#991b1b]",
  "No Fraude": "bg-[#dcfce7] text-[#166534]",
};

const samples: Array<{ tipoAlerta: TipoAlerta; segmento: Exclude<Segmento, "Todos">; canal: string; agent: string; verdict: Veredicto }> = [
  { tipoAlerta: "Fraude tarjeta", segmento: "Tarjeta", canal: "POS", agent: "Sub-agente FRAUD-01", verdict: "Auto-resuelto" },
  { tipoAlerta: "Phishing", segmento: "Canales Digitales", canal: "Página Web", agent: "Sub-agente PHISH-02", verdict: "Derivado a analista" },
  { tipoAlerta: "Lavado", segmento: "Canales Digitales", canal: "GLOMO", agent: "Sub-agente AML-03", verdict: "Sospechoso re-evaluado" },
  { tipoAlerta: "Identidad", segmento: "Canales Digitales", canal: "App Móvil", agent: "Sub-agente IDV-01", verdict: "Auto-resuelto" },
  { tipoAlerta: "Cuenta mula", segmento: "Tarjeta", canal: "ATM", agent: "Sub-agente MULE-02", verdict: "Derivado a analista" },
];
const analistas = ["Laura Gómez", "Carlos Pérez", "Ana Martínez", "Diego Torres", "Sofía Ramírez"];
const montos = [2450, 9800, 620, 1200, 15300, 340, 780, 4200, 990, 5600, 210, 3300, 8700, 1450];

const initialActivity: HistRow[] = Array.from({ length: 14 }).map((_, i) => {
  const s = samples[i % samples.length];
  const minutesAgo = i * 3 + 2;
  const canalFiltro = CANAL_FILTER_MAP[s.canal] ?? "Tarjeta";
  return {
    id: `ALR-${48210 - i}`,
    time: `Hace ${minutesAgo} min`,
    minutesAgo,
    usuario: `ALT-${(482910 - i * 137).toString().padStart(6, "0")}`,
    monto: montos[i % montos.length],
    analista: analistas[i % analistas.length],
    estado: (i % 3 === 0 ? "No Fraude" : "Fraude") as EstadoFraude,
    canalFiltro,
    subcanalFiltro: pickSubcanal(canalFiltro, i),
    ...s,
  };
});

// mock: genera un lote nuevo de filas al cambiar el rango de fechas / granularidad —
// simula que el backend trae otro recorte de histórico, no hay data real detrás.
function randomHistRows(count: number): HistRow[] {
  return Array.from({ length: count }).map((_, i) => {
    const s = samples[Math.floor(Math.random() * samples.length)];
    const minutesAgo = Math.floor(Math.random() * 60 * 24 * 7);
    const canalFiltro = CANAL_FILTER_MAP[s.canal] ?? "Tarjeta";
    return {
      id: `ALR-${48000 + Math.floor(Math.random() * 900)}`,
      time: minutesAgo < 60 ? `Hace ${minutesAgo} min` : `Hace ${Math.floor(minutesAgo / 60)} h`,
      minutesAgo,
      usuario: `ALT-${Math.floor(400000 + Math.random() * 99999)}`,
      monto: montos[Math.floor(Math.random() * montos.length)],
      analista: analistas[Math.floor(Math.random() * analistas.length)],
      estado: (Math.random() < 0.3 ? "No Fraude" : "Fraude") as EstadoFraude,
      canalFiltro,
      subcanalFiltro: pickSubcanal(canalFiltro, i),
      ...s,
    };
  });
}

const GRANULARITIES = ["Último día", "Semana", "Mes"] as const;
type Granularity = typeof GRANULARITIES[number];
const GRANULARITY_COUNTS: Record<Granularity, number> = { "Último día": 14, "Semana": 30, "Mes": 60 };

type ColKey = "estado" | "time" | "id" | "usuario" | "segmento" | "canal" | "monto" | "tipoAlerta" | "verdict" | "analista" | "agent";

const columns: { key: ColKey; label: string; align?: "right" }[] = [
  { key: "estado", label: "Estado" },
  { key: "time", label: "Timestamp" },
  { key: "id", label: "Alerta" },
  { key: "usuario", label: "Usuario (Altamira)" },
  { key: "tipoAlerta", label: "Categoría" },
  { key: "segmento", label: "Segmento" },
  { key: "canal", label: "Canal" },
  { key: "monto", label: "Monto", align: "right" },
  { key: "verdict", label: "Veredicto" },
  { key: "analista", label: "Analista" },
  { key: "agent", label: "Sub-agente" },
];

function sortValue(row: HistRow, key: ColKey): string | number {
  if (key === "time") return row.minutesAgo;
  if (key === "id") return Number(row.id.replace(/\D/g, ""));
  if (key === "monto") return row.monto;
  return row[key];
}

function formatMonto(monto: number) {
  return `$ ${monto.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;
}

type BatchStatus = "Fraudulenta" | "Falso positivo" | "No encontrada";
type BatchResult = { id: string; status: BatchStatus };

const batchStatusBadges: Record<BatchStatus, string> = {
  "Fraudulenta": "bg-[#fee2e2] text-[#991b1b]",
  "Falso positivo": "bg-[#dcfce7] text-[#166534]",
  "No encontrada": "bg-[#f3f4f6] text-[#374151]",
};

// mock: no real backend — picks random existing IDs (marked Fraudulenta/Falso positivo)
// and invents a few IDs that don't exist in la tabla (marked "No encontrada")
function generateMockBatch(): BatchResult[] {
  const count = 4 + Math.floor(Math.random() * 5);
  const pool = [...initialActivity];
  const results: BatchResult[] = [];
  for (let i = 0; i < count; i++) {
    const notFound = pool.length === 0 || Math.random() < 0.25;
    if (notFound) {
      results.push({ id: `ALR-${48300 + Math.floor(Math.random() * 900)}`, status: "No encontrada" });
    } else {
      const idx = Math.floor(Math.random() * pool.length);
      const [row] = pool.splice(idx, 1);
      results.push({ id: row.id, status: Math.random() < 0.6 ? "Fraudulenta" : "Falso positivo" });
    }
  }
  return results;
}

// mock: content is plain text, not a valid zip archive — placeholder for the demo download
function buildMockReportContent(fileName: string, results: BatchResult[]): string {
  const lines = [
    `INFORME DE ANÁLISIS DE FRAUDE (MOCK)`,
    `Archivo origen: ${fileName}`,
    `Fecha: ${new Date().toLocaleString("es-CO")}`,
    `Alertas procesadas: ${results.length}`,
    "",
    ...results.map((r, i) =>
      [
        `--- Alerta ${i + 1}/${results.length} ---`,
        `ID: ${r.id}`,
        `Estado: ${r.status}`,
        r.status === "No encontrada"
          ? "Nota: esta alerta no fue encontrada en el histórico de ARIA."
          : "Nota: revisado por ARIA, ver detalle completo en la plataforma.",
        "",
      ].join("\n")
    ),
  ];
  return lines.join("\n");
}

// mock: content is plain text, not a valid zip archive — placeholder for the demo download
function buildSelectionReportContent(rows: HistRow[]): string {
  const lines = [
    `INFORME DE ALERTAS SELECCIONADAS (MOCK)`,
    `Fecha: ${new Date().toLocaleString("es-CO")}`,
    `Alertas incluidas: ${rows.length}`,
    "",
    ...rows.map((r, i) =>
      [
        `--- Alerta ${i + 1}/${rows.length} ---`,
        `ID: ${r.id}`,
        `Estado: ${r.estado}`,
        `Categoría: ${r.tipoAlerta}`,
        `Usuario (Altamira): ${r.usuario}`,
        `Monto: ${formatMonto(r.monto)}`,
        `Analista: ${r.analista}`,
        "",
      ].join("\n")
    ),
  ];
  return lines.join("\n");
}

function HistoricoFraudePage() {
  const [histSearch, setHistSearch] = useState("");
  const [sortKey, setSortKey] = useState<ColKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [batchState, setBatchState] = useState<"idle" | "processing" | "done">("idle");
  const [batchFileName, setBatchFileName] = useState("");
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [rows, setRows] = useState<HistRow[]>(initialActivity);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingMark, setPendingMark] = useState<"fraude" | "fp" | null>(null);
  const tableRefresh = useAutoRefresh();

  const [filters, setFilters] = useState<{ canal: Canal; subcanal: string; segmento: Segmento; monto: MontoTier; estado: typeof ESTADO_FILTERS[number] }>({
    canal: "Todos", subcanal: "Todos", segmento: "Todos", monto: "Todos", estado: "Todos",
  });
  const [granularity, setGranularity] = useState<Granularity | null>("Último día");
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [appliedRange, setAppliedRange] = useState<DateRange | undefined>(undefined);
  const [datepickerOpen, setDatepickerOpen] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false);
  const loadingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const selectPreset = (g: Granularity) => {
    clearTimeout(loadingTimeout.current);
    setGranularity(g);
    setAppliedRange(undefined);
    setRangeLoading(true);
    loadingTimeout.current = setTimeout(() => {
      setRows(g === "Último día" ? initialActivity : randomHistRows(GRANULARITY_COUNTS[g]));
      setRangeLoading(false);
    }, 600);
  };

  const applyCustomRange = () => {
    if (!pendingRange?.from || !pendingRange?.to) return;
    const days = Math.max(1, Math.round((pendingRange.to.getTime() - pendingRange.from.getTime()) / 86_400_000) + 1);
    setDatepickerOpen(false);
    setGranularity(null);
    setAppliedRange(pendingRange);
    setRangeLoading(true);
    clearTimeout(loadingTimeout.current);
    loadingTimeout.current = setTimeout(() => {
      setRows(randomHistRows(Math.min(120, days * 5)));
      setRangeLoading(false);
    }, 900);
  };

  const rangeLabel = appliedRange?.from && appliedRange?.to
    ? `${format(appliedRange.from, "d MMM", { locale: es })} – ${format(appliedRange.to, "d MMM", { locale: es })}`
    : "Rango personalizado";

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const canMarkFraude = selectedRows.length > 0 && selectedRows.every((r) => r.estado === "No Fraude");
  const canMarkFalsoPositivo = selectedRows.length > 0 && selectedRows.every((r) => r.estado === "Fraude");

  const confirmMark = (note: string) => {
    const estado: EstadoFraude = pendingMark === "fraude" ? "Fraude" : "No Fraude";
    setRows((prev) => prev.map((r) => (selected.has(r.id) ? { ...r, estado, nota: note } : r)));
    setSelected(new Set());
    setPendingMark(null);
  };
  const generarInforme = () => {
    const content = buildSelectionReportContent(selectedRows);
    const blob = new Blob([content], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "informe-alertas.zip";
    a.click();
    URL.revokeObjectURL(url);
    setSelected(new Set());
  };

  const handleFileSelected = (file: File) => {
    setBatchFileName(file.name);
    setBatchState("processing");
    setTimeout(() => {
      setBatchResults(generateMockBatch());
      setBatchState("done");
    }, 1400);
  };

  const closeBatchPanel = () => {
    setBatchState("idle");
    setBatchFileName("");
    setBatchResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadMockReport = () => {
    const content = buildMockReportContent(batchFileName, batchResults);
    const blob = new Blob([content], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "informe-fraude.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: ColKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredActivity = useMemo(() => rows.filter((r) => {
    if (histSearch.trim() && !r.id.toLowerCase().includes(histSearch.toLowerCase())) return false;
    if (filters.canal !== "Todos" && r.canalFiltro !== filters.canal) return false;
    if (filters.subcanal !== "Todos" && r.subcanalFiltro !== filters.subcanal) return false;
    if (filters.segmento !== "Todos" && r.segmento !== filters.segmento) return false;
    if (!matchesMonto(r.monto, filters.monto)) return false;
    if (filters.estado !== "Todos" && r.estado !== filters.estado) return false;
    return true;
  }), [rows, histSearch, filters]);

  const sortedActivity = useMemo(() => {
    const copy = [...filteredActivity];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filteredActivity, sortKey, sortDir]);

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-[20px] font-bold text-text-primary">Histórico de Gestión de Fraude</h1>
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
            <Select value={filters.estado} onValueChange={(v) => setFilters((f) => ({ ...f, estado: v as typeof ESTADO_FILTERS[number] }))}>
              <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                {ESTADO_FILTERS.map((e) => <SelectItem key={e} value={e}>{e === "Todos" ? "Todos los estados" : e}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-lg border border-border bg-surface p-1">
              {GRANULARITIES.map((g) => (
                <button
                  key={g}
                  onClick={() => selectPreset(g)}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    granularity === g ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <Popover open={datepickerOpen} onOpenChange={setDatepickerOpen}>
              <PopoverTrigger asChild>
                <Button variant={appliedRange ? "default" : "outline"} size="sm" className="h-[30px] text-[11px] gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5" />
                  {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={pendingRange}
                  onSelect={setPendingRange}
                  defaultMonth={pendingRange?.from}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  locale={es}
                />
                <div className="flex justify-end gap-2 p-3 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={() => setDatepickerOpen(false)}>Cancelar</Button>
                  <Button size="sm" disabled={!pendingRange?.from || !pendingRange?.to} onClick={applyCustomRange}>Aplicar</Button>
                </div>
              </PopoverContent>
            </Popover>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={batchState === "processing"}
              className="inline-flex items-center gap-2 h-[30px] px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              Cargar archivo de alertas marcadas
            </button>
          </div>
        </div>

        {batchState !== "idle" && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-6">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
                <FileSpreadsheet className="h-4 w-4 text-text-secondary" />
                {batchFileName}
              </div>
              <button onClick={closeBatchPanel} className="p-1 rounded-md hover:bg-surface text-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            {batchState === "processing" ? (
              <div className="px-5 py-8 flex items-center justify-center gap-2 text-[13px] text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando archivo…
              </div>
            ) : (
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-text-primary">
                    Se detectaron <span className="font-semibold">{batchResults.length}</span> alertas
                  </span>
                  <button
                    onClick={downloadMockReport}
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Descargar informe (.zip)
                  </button>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {batchResults.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-3 py-2 bg-card">
                      <span className="text-[13px] font-medium text-text-primary tabular-nums">{r.id}</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${batchStatusBadges[r.status]}`}>
                        {r.status === "No encontrada" ? "Esta alerta no fue encontrada" : r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="relative bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          {rangeLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-card/80 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-[12px] text-text-secondary">Cargando histórico para el rango seleccionado…</span>
            </div>
          )}
          <div className="px-5 pt-4 pb-3 border-b border-border space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-text-primary">Histórico de Gestión de Fraude</h2>
              <RefreshControl lastRefresh={tableRefresh.lastRefresh} onRefresh={tableRefresh.refresh} />
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
              <input
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                placeholder="Buscar por código de alerta (ej. ALR-48205)…"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          {selected.size > 0 && (
            <div className="px-5 py-3 border-b border-border bg-surface flex items-center gap-2">
              <span className="text-[12px] text-text-secondary mr-2">
                {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setPendingMark("fraude")}
                disabled={!canMarkFraude}
                className="h-8 px-3 rounded-lg bg-danger text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Marcar fraude
              </button>
              <button
                onClick={() => setPendingMark("fp")}
                disabled={!canMarkFalsoPositivo}
                className="h-8 px-3 rounded-lg bg-success text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Marcar falso positivo
              </button>
              <button
                onClick={generarInforme}
                className="h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-card"
              >
                Generar informe
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="w-10 px-5 py-3"></th>
                  {columns.map((col) => (
                    <th key={col.key} className={`font-normal py-3 px-5 whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}>
                      <button
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 hover:text-text-primary transition-colors ${sortKey === col.key ? "text-text-primary font-medium" : ""} ${col.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="text-right font-normal px-5 py-3 w-[110px]">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {sortedActivity.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-5 py-8 text-center text-[13px] text-text-secondary">
                      No se encontraron alertas con ese código.
                    </td>
                  </tr>
                ) : sortedActivity.map((row, i) => (
                  <tr key={row.id} className={`border-t border-border ${i % 2 === 1 ? "bg-surface" : "bg-card"}`}>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="h-4 w-4 rounded border-border accent-[rgb(0,17,148)]"
                      />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${estadoBadges[row.estado]}`}>
                        {row.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">{row.time}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-text-primary tabular-nums whitespace-nowrap">{row.id}</td>
                    <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">{row.usuario}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${taxonomyColors[row.tipoAlerta]}`}>
                        {row.tipoAlerta}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${SEGMENTO_BADGES[row.segmento]}`}>
                        {row.segmento}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-text-primary whitespace-nowrap">{row.canal}</td>
                    <td className="px-5 py-3 text-[13px] text-text-primary tabular-nums text-right whitespace-nowrap">{formatMonto(row.monto)}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdictBadges[row.verdict]}`}>
                        {row.verdict}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-text-primary whitespace-nowrap">{row.analista}</td>
                    <td className="px-5 py-3 text-[12px] text-text-secondary whitespace-nowrap">{row.agent}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Link to="/alerta/$id" params={{ id: row.id }}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface">
                        Ver <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-between items-center">
            <span className="text-[11px] text-text-secondary">
              {sortedActivity.length} resultado{sortedActivity.length !== 1 ? "s" : ""}
            </span>
            {!histSearch && (
              <button className="text-[12px] font-medium text-primary hover:underline">Cargar más</button>
            )}
          </div>
        </section>
      </div>

      {pendingMark && (
        <MarkModal
          action={pendingMark}
          count={selectedRows.length}
          onClose={() => setPendingMark(null)}
          onConfirm={confirmMark}
        />
      )}
    </DashboardLayout>
  );
}

/* ── Mark modal ─────────────────────────────────────── */

const MARK_META: Record<"fraude" | "fp", { title: string; cta: string; tone: string; placeholder: string }> = {
  fraude: {
    title: "Marcar como fraude",
    cta: "Marcar fraude",
    tone: "bg-danger",
    placeholder: "Describe qué ocurrió y por qué se confirma como fraude…",
  },
  fp: {
    title: "Marcar como falso positivo",
    cta: "Marcar falso positivo",
    tone: "bg-success",
    placeholder: "Describe qué ocurrió y por qué se marca como falso positivo…",
  },
};

function MarkModal({
  action,
  count,
  onClose,
  onConfirm,
}: {
  action: "fraude" | "fp";
  count: number;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const meta = MARK_META[action];
  const disabled = note.trim().length < 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-xl border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-[15px] font-bold text-text-primary">{meta.title}</div>
            <div className="text-[12px] text-text-secondary mt-0.5">
              {count} alerta{count !== 1 ? "s" : ""} seleccionada{count !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          <label className="text-[11px] uppercase tracking-wider text-text-secondary">
            Qué ocurrió <span className="text-danger normal-case tracking-normal">(mín. 20 caracteres)</span>
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4}
            placeholder={meta.placeholder}
            className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="mt-1 flex justify-between text-[11px] text-text-secondary tabular-nums">
            <span>{note.trim().length} / 20 mínimo</span>
            <span>{note.length} / 500</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface">Cancelar</button>
          <button disabled={disabled} onClick={() => onConfirm(note.trim())}
            className={`h-9 px-4 rounded-lg text-white text-[13px] font-medium transition-opacity ${meta.tone} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}>
            {meta.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
