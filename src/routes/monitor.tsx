import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  AlertTriangle, TrendingDown, TrendingUp,
  CheckCircle2, Brain, Zap, ShieldAlert, Users, Bot,
  Radio, CalendarRange, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChannelFilter } from "@/components/ChannelFilter";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INITIAL_CONFIGS, RUNNING_DEFAULT, type AgentConfig } from "@/data/configs";
import type { Canal, Segmento } from "@/data/channels";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Telemetría y log de decisiones del agente ARIA." },
    ],
  }),
  component: MonitorPage,
});

// ─── KPI data per config ─────────────────────────────────────────────────────

type ConfigKPIs = {
  latencia: string;
  errores: string;
  avgTokens: string;
  fraudeNoDetectado: string;
  falsosPositivos: string;
  procesados: string;
  fallos: string;
  disponibilidad: string;
  caidas: number;
  alucinaciones: string;
  usoCorrectoData: string;
  recAceptadas: number;
  recIgnoradas: number;
  tiempoAhorrado: string;
  casosHumano: number;
  casosAI: number;
  procesadoAnalistas: string;
  procesadoVoicebot: string;
  contactabilidadVoicebot: string;
  contactabilidadAnalista: string;
  latenciaVoicebot: string;
  latenciaAnalista: string;
};

const KPIS: Record<string, ConfigKPIs> = {
  "cfg-prod": {
    latencia: "842 ms", errores: "6.4%", avgTokens: "2,340",
    fraudeNoDetectado: "1.2%", falsosPositivos: "8.7%",
    procesados: "97.3%", fallos: "2.7%",
    disponibilidad: "99.1%", caidas: 2,
    alucinaciones: "0.3%", usoCorrectoData: "98.7%",
    recAceptadas: 73, recIgnoradas: 27,
    tiempoAhorrado: "14.2 h", casosHumano: 48, casosAI: 312,
    procesadoAnalistas: "312", procesadoVoicebot: "586",
    contactabilidadVoicebot: "58.4%", contactabilidadAnalista: "89.1%",
    latenciaVoicebot: "2.6 min", latenciaAnalista: "6.4 min",
  },
  "cfg-staging": {
    latencia: "1,120 ms", errores: "11.2%", avgTokens: "3,810",
    fraudeNoDetectado: "3.1%", falsosPositivos: "14.5%",
    procesados: "88.9%", fallos: "11.1%",
    disponibilidad: "97.4%", caidas: 7,
    alucinaciones: "2.1%", usoCorrectoData: "91.4%",
    recAceptadas: 58, recIgnoradas: 42,
    tiempoAhorrado: "8.6 h", casosHumano: 61, casosAI: 188,
    procesadoAnalistas: "188", procesadoVoicebot: "402",
    contactabilidadVoicebot: "47.9%", contactabilidadAnalista: "76.3%",
    latenciaVoicebot: "4.1 min", latenciaAnalista: "9.8 min",
  },
  "cfg-canary": {
    latencia: "910 ms", errores: "7.8%", avgTokens: "2,650",
    fraudeNoDetectado: "1.9%", falsosPositivos: "10.2%",
    procesados: "92.1%", fallos: "7.9%",
    disponibilidad: "98.5%", caidas: 3,
    alucinaciones: "0.8%", usoCorrectoData: "96.2%",
    recAceptadas: 68, recIgnoradas: 32,
    tiempoAhorrado: "11.4 h", casosHumano: 54, casosAI: 247,
    procesadoAnalistas: "247", procesadoVoicebot: "498",
    contactabilidadVoicebot: "53.2%", contactabilidadAnalista: "83.5%",
    latenciaVoicebot: "3.3 min", latenciaAnalista: "7.6 min",
  },
};

// ─── Filters ────────────────────────────────────────────────────────────────

const MONTO_TIERS = ["Todos", "> 3M", "1M - 3M", "< 1M"] as const;
const GRANULARITIES = ["Último día", "Semana", "Mes"] as const;
type Granularity = typeof GRANULARITIES[number];
type FilterState = { canal: Canal; subcanal: string; segmento: Segmento; monto: typeof MONTO_TIERS[number] };

// ponytail: fake PRNG so a given filter combo always "recomputes" to the same numbers
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function jitterNumeric(str: string, rand: () => number, pct: number) {
  const match = str.match(/[\d.,]+/);
  if (!match) return str;
  const raw = match[0];
  const numeric = parseFloat(raw.replace(/,/g, ""));
  if (Number.isNaN(numeric)) return str;
  const jittered = numeric * (1 + (rand() - 0.5) * 2 * pct);
  const decimals = (raw.split(".")[1] ?? "").length;
  const formatted = decimals > 0 ? jittered.toFixed(decimals) : Math.round(jittered).toLocaleString("en-US");
  return str.replace(raw, formatted);
}

function jitterKpis(base: ConfigKPIs, rand: () => number): ConfigKPIs {
  const recAceptadas = Math.min(95, Math.max(45, Math.round(base.recAceptadas * (1 + (rand() - 0.5) * 0.2))));
  return {
    latencia: jitterNumeric(base.latencia, rand, 0.15),
    errores: jitterNumeric(base.errores, rand, 0.2),
    avgTokens: jitterNumeric(base.avgTokens, rand, 0.15),
    fraudeNoDetectado: jitterNumeric(base.fraudeNoDetectado, rand, 0.25),
    falsosPositivos: jitterNumeric(base.falsosPositivos, rand, 0.2),
    procesados: jitterNumeric(base.procesados, rand, 0.04),
    fallos: jitterNumeric(base.fallos, rand, 0.2),
    disponibilidad: jitterNumeric(base.disponibilidad, rand, 0.02),
    caidas: Math.max(0, Math.round(base.caidas * (1 + (rand() - 0.5) * 0.6))),
    alucinaciones: jitterNumeric(base.alucinaciones, rand, 0.3),
    usoCorrectoData: jitterNumeric(base.usoCorrectoData, rand, 0.04),
    recAceptadas,
    recIgnoradas: 100 - recAceptadas,
    tiempoAhorrado: jitterNumeric(base.tiempoAhorrado, rand, 0.25),
    casosHumano: Math.max(1, Math.round(base.casosHumano * (1 + (rand() - 0.5) * 0.3))),
    casosAI: Math.max(1, Math.round(base.casosAI * (1 + (rand() - 0.5) * 0.3))),
    procesadoAnalistas: jitterNumeric(base.procesadoAnalistas, rand, 0.2),
    procesadoVoicebot: jitterNumeric(base.procesadoVoicebot, rand, 0.2),
    contactabilidadVoicebot: jitterNumeric(base.contactabilidadVoicebot, rand, 0.15),
    contactabilidadAnalista: jitterNumeric(base.contactabilidadAnalista, rand, 0.08),
    latenciaVoicebot: jitterNumeric(base.latenciaVoicebot, rand, 0.2),
    latenciaAnalista: jitterNumeric(base.latenciaAnalista, rand, 0.2),
  };
}

const defaultVersionFor = (c: AgentConfig): number | "draft" =>
  c.dirtyTabs.length > 0 || c.versions.length === 0 ? "draft" : c.versions[c.versions.length - 1].version;

// ─── Component ───────────────────────────────────────────────────────────────

function MonitorPage() {
  const agentStatus: "ok" | "degraded" = "degraded";

  const [selectedConfigId, setSelectedConfigId] = useState(RUNNING_DEFAULT.configId);
  const [selectedVersion, setSelectedVersion] = useState<number | "draft">(RUNNING_DEFAULT.version);
  const [filters, setFilters] = useState<FilterState>({ canal: "Todos", subcanal: "Todos", segmento: "Todos", monto: "Todos" });
  const [granularity, setGranularity] = useState<Granularity | null>("Último día");
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [appliedRange, setAppliedRange] = useState<DateRange | undefined>(undefined);
  const [datepickerOpen, setDatepickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const selectedConfig = INITIAL_CONFIGS.find((c) => c.id === selectedConfigId)!;
  const showDraftRow = selectedConfig.dirtyTabs.length > 0 || selectedConfig.versions.length === 0;

  const selectConfigRow = (c: AgentConfig) => { setSelectedConfigId(c.id); setSelectedVersion(defaultVersionFor(c)); };

  const selectPreset = (g: Granularity) => {
    clearTimeout(loadingTimeout.current);
    setLoading(false);
    setGranularity(g);
    setAppliedRange(undefined);
  };

  const applyCustomRange = () => {
    if (!pendingRange?.from || !pendingRange?.to) return;
    setDatepickerOpen(false);
    setGranularity(null);
    setAppliedRange(pendingRange);
    setLoading(true);
    clearTimeout(loadingTimeout.current);
    loadingTimeout.current = setTimeout(() => setLoading(false), 1200 + Math.random() * 800);
  };

  const rangeLabel = appliedRange?.from && appliedRange?.to
    ? `${format(appliedRange.from, "d MMM", { locale: es })} – ${format(appliedRange.to, "d MMM", { locale: es })}`
    : "Rango personalizado";

  const seed = seedFromString(
    `${selectedConfigId}|${selectedVersion}|${filters.canal}|${filters.subcanal}|${filters.segmento}|${filters.monto}|${granularity ?? ""}|${appliedRange?.from?.toISOString() ?? ""}|${appliedRange?.to?.toISOString() ?? ""}`,
  );
  const kpi = jitterKpis(KPIS[selectedConfigId], mulberry32(seed));

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1400px] space-y-6">
        {agentStatus === "degraded" && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-[13px] text-text-primary">
              <span className="font-semibold">Agente degradado.</span> Latencia de enriquecimiento por encima del umbral y un sub-agente reportando timeouts intermitentes.
            </div>
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 bg-background border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="text-[20px] font-semibold text-text-primary">Monitor del Agente</h1>
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-warning/10 text-warning text-[12px] font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
              </span>
              Degradado
            </span>
          </div>

          {/* Filtros temporales y de características */}
          <div className="flex items-center gap-2">
            <ChannelFilter
              value={{ canal: filters.canal, subcanal: filters.subcanal, segmento: filters.segmento }}
              onChange={(v) => setFilters((f) => ({ ...f, canal: v.canal, subcanal: v.subcanal, segmento: v.segmento }))}
            />
            <Select value={filters.monto} onValueChange={(v) => setFilters((f) => ({ ...f, monto: v as FilterState["monto"] }))}>
              <SelectTrigger className="h-[30px] w-[130px] text-[11px]"><SelectValue placeholder="Monto" /></SelectTrigger>
              <SelectContent>
                {MONTO_TIERS.map((m) => <SelectItem key={m} value={m}>{m === "Todos" ? "Todos los montos" : m}</SelectItem>)}
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
          </div>
        </div>

        {/* ── Config + versión — estandarizado con /testing y /configuracion ─── */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Configuración monitoreada</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Configuración</div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {INITIAL_CONFIGS.map((c) => {
                  const selected = c.id === selectedConfigId;
                  const isRunning = RUNNING_DEFAULT.configId === c.id;
                  return (
                    <button key={c.id} onClick={() => selectConfigRow(c)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}>
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate">{c.name}</span>
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">{c.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.dirtyTabs.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Cambios sin guardar" />}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                            <Radio className="h-3.5 w-3.5" /> Producción
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Versión</div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {showDraftRow && (
                  <button onClick={() => setSelectedVersion("draft")}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${selectedVersion === "draft" ? "bg-primary/5" : "hover:bg-surface"}`}>
                    <div>
                      <span className="text-[13px] font-medium text-warning">Cambios sin guardar</span>
                      <p className="text-[11px] text-text-secondary">Borrador editable, aún no validado.</p>
                    </div>
                  </button>
                )}
                {[...selectedConfig.versions].reverse().map((v) => {
                  const isRunningVersion = RUNNING_DEFAULT.configId === selectedConfig.id && RUNNING_DEFAULT.version === v.version;
                  const isSelected = selectedVersion === v.version;
                  return (
                    <div key={v.version} role="button" tabIndex={0} onClick={() => setSelectedVersion(v.version)}
                      onKeyDown={(e) => { if (e.key === "Enter") setSelectedVersion(v.version); }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-surface"}`}>
                      <div>
                        <span className="text-[13px] font-medium text-text-primary">v{v.version}</span>
                        <p className="text-[11px] text-text-secondary">{v.testRun.date} · {v.testRun.accuracy.toFixed(1)}% precisión</p>
                      </div>
                      {isRunningVersion && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                          <Radio className="h-3.5 w-3.5" /> Producción
                        </span>
                      )}
                    </div>
                  );
                })}
                {selectedConfig.versions.length === 0 && !showDraftRow && (
                  <p className="px-3 py-3 text-[12px] text-text-secondary">Sin versiones registradas.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="relative space-y-6">
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-card/80 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-[12px] text-text-secondary">Calculando indicadores para el rango seleccionado…</span>
            </div>
          )}

          {/* ── KPIs operativos ───────────────────────────────────────────── */}
          <section className="space-y-4">
            <h2 className="text-[13px] font-semibold text-text-primary uppercase tracking-wider">Indicadores operativos</h2>

            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">General</h3>
              <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Fraude no detectado" value={kpi.fraudeNoDetectado} tone="danger" trend="down" delta="-0.2pp vs ayer" icon={<ShieldAlert className="h-4 w-4" />} />
                <KpiCard label="Falsos positivos" value={kpi.falsosPositivos} tone="warning" trend="up" delta="+1.1pp vs ayer" icon={<AlertTriangle className="h-4 w-4" />} />
                <KpiCard label="Errores de ejecución" value={kpi.errores} tone="danger" trend="up" delta="umbral 4%" icon={<AlertTriangle className="h-4 w-4" />} />
                <KpiCard label="Fallos" value={kpi.fallos} tone="danger" trend="up" delta="sobre total" icon={<AlertTriangle className="h-4 w-4" />} />
                <KpiCard label="Disponibilidad" value={kpi.disponibilidad} tone="primary" trend="down" delta={`${kpi.caidas} caída(s) hoy`} icon={<CheckCircle2 className="h-4 w-4" />} />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">ARIA</h3>
              <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Procesado por ARIA" value={kpi.procesados} tone="primary" trend="up" delta="sobre total" icon={<CheckCircle2 className="h-4 w-4" />} />
                <KpiCard label="Latencia por ARIA" value={kpi.latencia} tone="warning" trend="up" delta="+18% vs 1h" icon={<Zap className="h-4 w-4" />} />
                <KpiCard label="Avg token usage" value={kpi.avgTokens} unit="tok" tone="primary" trend="down" delta="-120 vs turno previo" icon={<Brain className="h-4 w-4" />} />
              </div>

              {/* Explicabilidad subsection */}
              <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="text-[13px] font-semibold text-text-primary">Explicabilidad</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ExplainCard
                    label="Alucinaciones"
                    value={kpi.alucinaciones}
                    description="Porcentaje de decisiones con razonamiento factualmente incorrecto detectado."
                    tone={parseFloat(kpi.alucinaciones) > 1 ? "warning" : "primary"}
                  />
                  <ExplainCard
                    label="Uso correcto de datos"
                    value={kpi.usoCorrectoData}
                    description="Decisiones donde el agente citó y aplicó correctamente los datos disponibles."
                    tone={parseFloat(kpi.usoCorrectoData) >= 95 ? "primary" : "warning"}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Analistas</h3>
              <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Procesado por analistas" value={kpi.procesadoAnalistas} tone="primary" trend="up" delta="alertas en el período" icon={<Users className="h-4 w-4" />} />
                <KpiCard label="Contactabilidad analista" value={kpi.contactabilidadAnalista} tone="primary" trend="up" delta="clientes contactados" icon={<CheckCircle2 className="h-4 w-4" />} />
                <KpiCard label="Latencia promedio analista" value={kpi.latenciaAnalista} tone="warning" trend="down" delta="vs turno previo" icon={<Zap className="h-4 w-4" />} />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Voicebot</h3>
              <div className="grid grid-cols-4 gap-4">
                <KpiCard label="Procesado por voicebot" value={kpi.procesadoVoicebot} tone="primary" trend="up" delta="alertas en el período" icon={<Bot className="h-4 w-4" />} />
                <KpiCard label="Contactabilidad voicebot" value={kpi.contactabilidadVoicebot} tone="warning" trend="up" delta="clientes contactados" icon={<CheckCircle2 className="h-4 w-4" />} />
                <KpiCard label="Latencia promedio voicebot" value={kpi.latenciaVoicebot} tone="primary" trend="down" delta="vs turno previo" icon={<Zap className="h-4 w-4" />} />
              </div>
            </div>
          </section>

          {/* ── Recomendaciones ───────────────────────────────────────────── */}
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center gap-2 mb-5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <h2 className="text-[13px] font-semibold text-text-primary uppercase tracking-wider">% Recomendaciones</h2>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {/* Acceptance donut-style bars */}
              <div className="col-span-1 space-y-3">
                <RecBar label="Aceptadas" pct={kpi.recAceptadas} tone="success" />
                <RecBar label="Ignoradas" pct={kpi.recIgnoradas} tone="warning" />
                <div className="pt-1 flex items-center justify-between text-[11px] text-text-secondary border-t border-border">
                  <span>Total recomendaciones emitidas</span>
                  <span className="font-semibold text-text-primary">{kpi.casosAI + kpi.casosHumano}</span>
                </div>
              </div>

              {/* Human vs AI */}
              <div className="col-span-1 flex flex-col gap-3">
                <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1">Revisión de casos</p>
                <div className="flex items-end gap-6 h-24">
                  <CasesBar label="Por humano" value={kpi.casosHumano} max={kpi.casosAI} icon={<Users className="h-3.5 w-3.5" />} tone="warning" />
                  <CasesBar label="Por AI" value={kpi.casosAI} max={kpi.casosAI} icon={<Bot className="h-3.5 w-3.5" />} tone="primary" />
                </div>
                <p className="text-[11px] text-text-secondary">
                  Ratio AI/humano: <span className="font-semibold text-text-primary">{(kpi.casosAI / kpi.casosHumano).toFixed(1)}x</span>
                </p>
              </div>

              {/* Tiempo ahorrado */}
              <div className="col-span-1 bg-surface rounded-lg border border-border p-4 flex flex-col justify-center items-center text-center">
                <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-2">Tiempo ahorrado</span>
                <span className="text-[38px] font-bold text-primary leading-none">{kpi.tiempoAhorrado}</span>
                <span className="text-[11px] text-text-secondary mt-2">estimado en turno actual<br />vs revisión 100% manual</span>
              </div>
            </div>
          </section>
        </div>

      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, trend, delta, tone, icon,
}: {
  label: string; value: string; unit?: string;
  trend: "up" | "down"; delta: string;
  tone: "primary" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "text-danger" :
    tone === "warning" ? "text-warning" :
    "text-primary";
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</div>
        <span className={`${toneClass} opacity-60`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[28px] font-bold leading-none ${toneClass}`}>{value}</span>
        {unit && <span className="text-[12px] text-text-secondary">{unit}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-secondary">
        <TrendIcon className={`h-3.5 w-3.5 ${toneClass}`} />
        <span>{delta}</span>
      </div>
    </div>
  );
}

function ExplainCard({
  label, value, description, tone,
}: {
  label: string; value: string; description: string;
  tone: "primary" | "warning";
}) {
  const toneClass = tone === "warning" ? "text-warning" : "text-primary";
  const bgClass = tone === "warning" ? "bg-warning/5 border-warning/20" : "bg-primary/5 border-primary/20";
  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        <span className={`text-[22px] font-bold ${toneClass}`}>{value}</span>
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

function RecBar({ label, pct, tone }: { label: string; pct: number; tone: "success" | "warning" }) {
  const fill = tone === "success" ? "bg-success" : "bg-warning";
  const text = tone === "success" ? "text-success" : "text-warning";
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-text-primary font-medium">{label}</span>
        <span className={`font-bold ${text}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden border border-border">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CasesBar({
  label, value, max, icon, tone,
}: { label: string; value: number; max: number; icon: React.ReactNode; tone: "primary" | "warning" }) {
  const fill = tone === "primary" ? "bg-primary" : "bg-warning";
  const text = tone === "primary" ? "text-primary" : "text-warning";
  const pct = (value / max) * 100;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className={`text-[20px] font-bold ${text}`}>{value}</span>
      <div className="w-full bg-surface border border-border rounded-sm overflow-hidden" style={{ height: `${pct}%`, minHeight: 8 }}>
        <div className={`w-full h-full ${fill} opacity-80`} />
      </div>
      <div className={`flex items-center gap-1 text-[11px] ${text}`}>{icon}<span>{label}</span></div>
    </div>
  );
}
