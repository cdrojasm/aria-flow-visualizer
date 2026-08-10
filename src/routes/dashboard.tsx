import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, HelpCircle, CalendarRange, Loader2, Download } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChannelFilter } from "@/components/ChannelFilter";
import type { Canal, Segmento } from "@/data/channels";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Dashboard operacional ARIA — monitoreo en tiempo real de alertas, agente y SLA." },
    ],
  }),
  component: DashboardPage,
});

type Trend = "up" | "down";
type GaugeStatus = "ok" | "warn" | "danger";
type StatDef = { label: string; help: string } & (
  | { kind: "count"; raw: number; trend: Trend; delta: string }
  | { kind: "fixed"; value: string; trend: Trend; delta: string }
  | { kind: "gauge"; value: string; status: GaugeStatus; statusLabel: string }
);

const DEFAULT_STATS: StatDef[] = [
  {
    kind: "count", raw: 1248, label: "Alertas procesadas", trend: "up", delta: "+18%",
    help: "Total de alertas ARIC procesadas por el agente en el período seleccionado.",
  },
  {
    kind: "fixed", value: "12.7%", label: "Ratio falsos positivos", trend: "down", delta: "−3.1pp",
    help: "Porcentaje de alertas incorrectamente clasificadas como positivas desde la última configuración.",
  },
];

const ANALYST_COUNT = 15;
const CAPACITY_PER_ANALYST = 4;
const GAUGE_STYLES: Record<GaugeStatus, string> = {
  ok: "bg-[#dcfce7] text-[#166534]",
  warn: "bg-[#fef3c7] text-[#92400e]",
  danger: "bg-[#fee2e2] text-[#991b1b]",
};

function computeSlaPct(avgMinutes: number) {
  return Math.round(Math.max(30, Math.min(99, 100 - (avgMinutes - 3) * 12)));
}

const DEFAULT_FUNNEL = [
  { id: "cola", name: "En cola sin procesar", count: 412, color: "#60a5fa" },
  { id: "aria", name: "En proceso por ARIA", count: 96, color: "#fbbf24" },
  { id: "analista", name: "Referidas a analista", count: 12, color: "#a78bfa" },
  { id: "voicebot", name: "Referidas a Voicebot", count: 41, color: "#34d399" },
];

const HISTORICAL_STAGE_LABELS: Partial<Record<string, string>> = { aria: "Manejadas por ARIA" };

// Histórico can't show "en cola sin procesar" (nothing is pending in a historical view) or
// the live "en proceso" wording for ARIA — it's already handled.
function toHistoricalStages(funnel: typeof DEFAULT_FUNNEL) {
  return funnel
    .filter((stage) => stage.id !== "cola")
    .map((stage) => ({ ...stage, name: HISTORICAL_STAGE_LABELS[stage.id] ?? stage.name }));
}

const CHANNEL_WEIGHTS: Record<string, number> = { Tarjeta: 0.35, Web: 0.4, "Mobile App": 0.15, ATM: 0.1 };
const SEGMENTO_WEIGHTS: Record<string, number> = { Tarjeta: 0.55, "Canales Digitales": 0.45 };

const MONTO_TIERS = ["Todos", "> 3M", "1M - 3M", "< 1M"] as const;
const MONTO_WEIGHTS: Record<string, number> = { "> 3M": 0.15, "1M - 3M": 0.35, "< 1M": 0.5 };

const ESTADOS = ["Todos", ...DEFAULT_FUNNEL.map((s) => s.id)] as const;

const MONTHLY_SPIKES: Record<number, number> = { 15: 135, 20: 110, 30: 150 };
const DEFAULT_MONTHLY = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const wave = 42 + Math.round(10 * Math.sin(day / 2.3));
  return { day, alertas: MONTHLY_SPIKES[day] ?? wave };
});

const HOURLY_STEPS = [
  { from: 0, to: 6, value: 18 },
  { from: 6, to: 11, value: 32 },
  { from: 11, to: 20, value: 68 },
  { from: 20, to: 24, value: 20 },
];
const DEFAULT_HOURLY = Array.from({ length: 24 }, (_, hour) => {
  const step = HOURLY_STEPS.find((s) => hour >= s.from && hour < s.to)!;
  return { hour, alertas: step.value };
});

const SLA_TARGET_MINUTES = 5;
const STAGE_TIME_IDS = ["aria", "analista", "voicebot"] as const;
type StageTimeId = typeof STAGE_TIME_IDS[number];
const STAGE_TIME_PROFILES: Record<StageTimeId, { from: number; to: number; value: number }[]> = {
  aria: [{ from: 0, to: 6, value: 1 }, { from: 6, to: 11, value: 1.3 }, { from: 11, to: 20, value: 2 }, { from: 20, to: 24, value: 1.2 }],
  analista: [{ from: 0, to: 6, value: 5 }, { from: 6, to: 11, value: 6.5 }, { from: 11, to: 20, value: 9 }, { from: 20, to: 24, value: 6 }],
  voicebot: [{ from: 0, to: 6, value: 2.5 }, { from: 6, to: 11, value: 3.2 }, { from: 11, to: 20, value: 4.5 }, { from: 20, to: 24, value: 3 }],
};
const DEFAULT_HOURLY_TIME = Array.from({ length: 24 }, (_, hour) => {
  const entry = { hour } as { hour: number } & Record<StageTimeId, number>;
  for (const id of STAGE_TIME_IDS) {
    entry[id] = STAGE_TIME_PROFILES[id].find((s) => hour >= s.from && hour < s.to)!.value;
  }
  return entry;
});

const TIME_CHANNEL_ADJUST: Record<string, number> = { Tarjeta: 0.9, Web: 1.1, "Mobile App": 1.15, ATM: 0.85 };
const TIME_MONTO_ADJUST: Record<string, number> = { "> 3M": 1.35, "1M - 3M": 1.1, "< 1M": 0.9 };
const TIME_SEGMENTO_ADJUST: Record<string, number> = { Tarjeta: 0.95, "Canales Digitales": 1.05 };

type DashboardData = {
  stats: StatDef[];
  avgMinutes: number;
  funnel: typeof DEFAULT_FUNNEL;
  monthly: typeof DEFAULT_MONTHLY;
  hourly: typeof DEFAULT_HOURLY;
  hourlyTime: typeof DEFAULT_HOURLY_TIME;
};

const DEFAULT_DATA: DashboardData = {
  stats: DEFAULT_STATS,
  avgMinutes: 4 + 32 / 60,
  funnel: DEFAULT_FUNNEL,
  monthly: DEFAULT_MONTHLY,
  hourly: DEFAULT_HOURLY,
  hourlyTime: DEFAULT_HOURLY_TIME,
};

// ponytail: fake PRNG so a given date range always "recomputes" to the same numbers
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateRangeData(from: Date, to: Date): DashboardData {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const rand = mulberry32(Math.round(from.getTime() / 1000) + Math.round(to.getTime() / 1000) + days);
  const scale = days * (0.7 + rand() * 0.6);

  const total = Math.round(280 * scale);
  const falsePositives = 9 + rand() * 10;
  const minutes = 3 + Math.floor(rand() * 3);
  const seconds = Math.floor(rand() * 60);

  const stats: StatDef[] = [
    {
      kind: "count", raw: total, label: "Alertas procesadas",
      trend: rand() > 0.3 ? "up" : "down", delta: `${rand() > 0.5 ? "+" : "−"}${(rand() * 25).toFixed(0)}%`,
      help: "Total de alertas ARIC procesadas por el agente en el período seleccionado.",
    },
    {
      kind: "fixed", value: `${falsePositives.toFixed(1)}%`, label: "Ratio falsos positivos",
      trend: rand() > 0.6 ? "up" : "down", delta: `${rand() > 0.5 ? "+" : "−"}${(rand() * 5).toFixed(1)}pp`,
      help: "Porcentaje de alertas incorrectamente clasificadas como positivas desde la última configuración.",
    },
  ];

  const funnel = DEFAULT_FUNNEL.map((stage) => ({
    ...stage,
    count: Math.max(1, Math.round(stage.count * scale * (0.85 + rand() * 0.3))),
  }));

  const monthly = Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const wave = 30 + Math.round(20 * scale * Math.sin(day / (2 + rand())));
    const spike = rand() > 0.9 ? Math.round(40 * scale) : 0;
    return { day, alertas: Math.max(5, wave + spike) };
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const step = HOURLY_STEPS.find((s) => hour >= s.from && hour < s.to)!;
    return { hour, alertas: Math.max(2, Math.round(step.value * scale * (0.85 + rand() * 0.3))) };
  });

  const hourlyTime = Array.from({ length: 24 }, (_, hour) => {
    const entry = { hour } as { hour: number } & Record<StageTimeId, number>;
    for (const id of STAGE_TIME_IDS) {
      const step = STAGE_TIME_PROFILES[id].find((s) => hour >= s.from && hour < s.to)!;
      entry[id] = Math.round(step.value * (0.85 + rand() * 0.3) * 10) / 10;
    }
    return entry;
  });

  return { stats, avgMinutes: minutes + seconds / 60, funnel, monthly, hourly, hourlyTime };
}

const GRANULARITIES = ["Último día", "Semana", "Mes"] as const;
type Granularity = typeof GRANULARITIES[number];
const DISTRIBUTION_HELP = "\"Tiempo real\" muestra el snapshot actual del pipeline (no depende del rango de fechas). \"Histórico\" muestra cómo se distribuyó el volumen procesado por etapa durante el rango seleccionado.";
const LIVE_NOTE = "Snapshot del estado actual del pipeline de alertas — no depende del rango de fechas seleccionado, sí de los filtros de canal, monto y estado.";
const PROCESSING_TIME_HELP = "Tiempo promedio de procesamiento por hora del día (00h–23h), para identificar franjas horarias que incumplen el SLA objetivo de 5 minutos.";
const INDICATORS_HELP = "Indicadores operativos generales: volumen de alertas, calidad de detección, cumplimiento de SLA (<5 min) y alerta de desbordamiento de carga para el equipo de 15 analistas. Reaccionan a los filtros de canal, monto, estado y rango de fecha.";

function StatCard({ stat, scale }: { stat: StatDef; scale: number }) {
  const { label, help } = stat;
  const [helpOpen, setHelpOpen] = useState(false);
  const value = stat.kind === "count" ? Math.round(stat.raw * scale).toLocaleString("es-ES") : stat.value;

  return (
    <div className="relative bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
      <button
        onClick={() => setHelpOpen(!helpOpen)}
        className="absolute top-3 right-3 text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Ayuda"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {helpOpen && (
        <div className="absolute top-8 right-3 z-10 bg-card border border-border rounded-lg p-3 text-[12px] text-text-secondary max-w-[190px] shadow-md">
          {help}
        </div>
      )}
      <div className="flex items-baseline justify-between pr-6">
        <span className="text-[32px] font-bold leading-none text-primary tabular-nums">{value}</span>
        {stat.kind === "gauge" ? (
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${GAUGE_STYLES[stat.status]}`}>
            {stat.statusLabel}
          </span>
        ) : (
          <span className={`flex items-center gap-1 text-[12px] font-medium ${stat.trend === "up" ? "text-success" : "text-danger"}`}>
            {stat.trend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {stat.delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-[13px] text-text-secondary">{label}</div>
    </div>
  );
}

function SectionHeader({ title, help }: { title: string; help: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 mb-5">
      <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Ayuda"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute left-0 top-6 z-10 bg-card border border-border rounded-lg p-3 text-[12px] text-text-secondary max-w-[220px] shadow-md">
            {help}
          </div>
        )}
      </div>
    </div>
  );
}

type FilterState = { canal: Canal; subcanal: string; segmento: Segmento; monto: typeof MONTO_TIERS[number]; estado: typeof ESTADOS[number] };

function computeStageCounts(stages: typeof DEFAULT_FUNNEL, filters: FilterState) {
  const chWeight = filters.canal === "Todos" ? 1 : CHANNEL_WEIGHTS[filters.canal];
  const segWeight = filters.segmento === "Todos" ? 1 : SEGMENTO_WEIGHTS[filters.segmento];
  const moWeight = filters.monto === "Todos" ? 1 : MONTO_WEIGHTS[filters.monto];

  return stages.map((stage) => {
    const included = filters.estado === "Todos" || filters.estado === stage.id;
    const count = included ? Math.max(0, Math.round(stage.count * chWeight * segWeight * moWeight)) : 0;
    return { ...stage, count };
  });
}

function AlertDetailPanel({ stages, filters }: {
  stages: typeof DEFAULT_FUNNEL;
  filters: FilterState;
}) {
  const counts = computeStageCounts(stages, filters);
  const total = counts.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <div className="rounded-lg border border-border p-4">
        <div className="text-[24px] font-bold tabular-nums text-text-primary">{total.toLocaleString("es-ES")}</div>
        <div className="mt-1 text-[12px] text-text-secondary">Total alertas</div>
      </div>
      {counts.map((stage) => (
        <div key={stage.id} className="rounded-lg border border-border p-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
            <span className="text-[24px] font-bold tabular-nums text-text-primary">{stage.count.toLocaleString("es-ES")}</span>
          </div>
          <div className="mt-1 text-[12px] text-text-secondary">{stage.name}</div>
        </div>
      ))}
    </div>
  );
}

function computeStackedSeries<T extends { alertas: number }>(
  series: T[],
  funnel: typeof DEFAULT_FUNNEL,
  filters: FilterState,
) {
  const chWeight = filters.canal === "Todos" ? 1 : CHANNEL_WEIGHTS[filters.canal];
  const segWeight = filters.segmento === "Todos" ? 1 : SEGMENTO_WEIGHTS[filters.segmento];
  const moWeight = filters.monto === "Todos" ? 1 : MONTO_WEIGHTS[filters.monto];
  const totalFunnel = funnel.reduce((sum, s) => sum + s.count, 0);

  return series.map((point) => {
    const byStage: Record<string, number> = {};
    for (const stage of funnel) {
      const included = filters.estado === "Todos" || filters.estado === stage.id;
      const proportion = totalFunnel > 0 ? stage.count / totalFunnel : 0;
      byStage[stage.id] = included ? Math.max(0, Math.round(point.alertas * proportion * chWeight * segWeight * moWeight)) : 0;
    }
    return { ...point, ...byStage };
  });
}

function computeStageTimeSeries(
  series: ({ hour: number } & Record<StageTimeId, number>)[],
  funnel: typeof DEFAULT_FUNNEL,
  filters: FilterState,
) {
  const chAdjust = filters.canal === "Todos" ? 1 : TIME_CHANNEL_ADJUST[filters.canal];
  const segAdjust = filters.segmento === "Todos" ? 1 : TIME_SEGMENTO_ADJUST[filters.segmento];
  const moAdjust = filters.monto === "Todos" ? 1 : TIME_MONTO_ADJUST[filters.monto];
  const weights = Object.fromEntries(
    STAGE_TIME_IDS.map((id) => [id, funnel.find((s) => s.id === id)?.count ?? 0]),
  ) as Record<StageTimeId, number>;
  const includedWeight = STAGE_TIME_IDS.reduce(
    (sum, id) => sum + (filters.estado === "Todos" || filters.estado === id ? weights[id] : 0),
    0,
  );

  return series.map((point) => {
    const byStage = {} as Record<StageTimeId, number>;
    for (const id of STAGE_TIME_IDS) {
      const included = filters.estado === "Todos" || filters.estado === id;
      byStage[id] = included ? Math.round(point[id] * chAdjust * segAdjust * moAdjust * 10) / 10 : 0;
    }
    const total = includedWeight > 0
      ? STAGE_TIME_IDS.reduce((sum, id) => sum + byStage[id] * weights[id], 0) / includedWeight
      : 0;
    return { hour: point.hour, ...byStage, total: Math.round(total * 10) / 10 };
  });
}

function computeScale(filters: FilterState, funnel: typeof DEFAULT_FUNNEL) {
  const chWeight = filters.canal === "Todos" ? 1 : CHANNEL_WEIGHTS[filters.canal];
  const segWeight = filters.segmento === "Todos" ? 1 : SEGMENTO_WEIGHTS[filters.segmento];
  const moWeight = filters.monto === "Todos" ? 1 : MONTO_WEIGHTS[filters.monto];
  let estWeight = 1;
  if (filters.estado !== "Todos") {
    const totalFunnel = funnel.reduce((sum, s) => sum + s.count, 0);
    const stage = funnel.find((s) => s.id === filters.estado);
    estWeight = totalFunnel > 0 && stage ? stage.count / totalFunnel : 0;
  }
  return chWeight * segWeight * moWeight * estWeight;
}

function csvEscape(value: string | number) {
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values: (string | number)[]) {
  return values.map(csvEscape).join(",");
}

function buildDashboardReportCsv(opts: {
  filters: FilterState;
  granularity: Granularity | null;
  appliedRange: DateRange | undefined;
  indicatorStats: StatDef[];
  stageCounts: ReturnType<typeof computeStageCounts>;
  historicalFunnel: ReturnType<typeof toHistoricalStages>;
  stackedMonthly: ReturnType<typeof computeStackedSeries>;
  stackedHourly: ReturnType<typeof computeStackedSeries>;
  stageTime: ReturnType<typeof computeStageTimeSeries>;
}) {
  const {
    filters, granularity, appliedRange, indicatorStats, stageCounts, historicalFunnel, stackedMonthly, stackedHourly, stageTime,
  } = opts;
  const dateRangeLabel = appliedRange?.from && appliedRange?.to
    ? `${format(appliedRange.from, "yyyy-MM-dd")} a ${format(appliedRange.to, "yyyy-MM-dd")}`
    : granularity ?? "N/A";

  const lines: string[] = [];
  lines.push("REPORTE DE DASHBOARD ARIA");
  lines.push(csvRow(["Generado", format(new Date(), "yyyy-MM-dd HH:mm")]));
  lines.push("");
  lines.push("FILTROS APLICADOS");
  lines.push(csvRow(["Rango de fechas", dateRangeLabel]));
  lines.push(csvRow(["Canal", filters.canal]));
  lines.push(csvRow(["Subcanal", filters.subcanal]));
  lines.push(csvRow(["Segmento", filters.segmento]));
  lines.push(csvRow(["Monto", filters.monto]));
  lines.push(csvRow(["Estado", filters.estado]));
  lines.push("");

  lines.push("DATOS GENERALES");
  lines.push(csvRow(["Indicador", "Valor", "Detalle"]));
  for (const stat of indicatorStats) {
    const val = stat.kind === "count" ? Math.round(stat.raw).toLocaleString("es-ES") : stat.value;
    const detail = stat.kind === "gauge" ? stat.statusLabel : `${stat.trend === "up" ? "+" : "-"} ${stat.delta}`;
    lines.push(csvRow([stat.label, val, detail]));
  }
  lines.push("");

  lines.push("DISTRIBUCIÓN POR ETAPA (snapshot actual)");
  lines.push(csvRow(["Etapa", "Alertas"]));
  for (const stage of stageCounts) lines.push(csvRow([stage.name, stage.count]));
  lines.push("");

  lines.push("DISTRIBUCIÓN MENSUAL (por día del rango histórico)");
  lines.push(csvRow(["Día", ...historicalFunnel.map((s) => s.name)]));
  for (const point of stackedMonthly) {
    lines.push(csvRow([point.day, ...historicalFunnel.map((s) => (point as Record<string, number>)[s.id] ?? 0)]));
  }
  lines.push("");

  lines.push("DISTRIBUCIÓN HORARIA (por hora del día)");
  lines.push(csvRow(["Hora", ...historicalFunnel.map((s) => s.name)]));
  for (const point of stackedHourly) {
    lines.push(csvRow([point.hour, ...historicalFunnel.map((s) => (point as Record<string, number>)[s.id] ?? 0)]));
  }
  lines.push("");

  lines.push("TIEMPOS DE PROCESAMIENTO POR HORA (minutos)");
  lines.push(csvRow(["Hora", "Total", ...STAGE_TIME_IDS.map((id) => DEFAULT_FUNNEL.find((s) => s.id === id)?.name ?? id)]));
  for (const point of stageTime) {
    lines.push(csvRow([point.hour, point.total, ...STAGE_TIME_IDS.map((id) => point[id])]));
  }

  return lines.join("\n");
}

function DashboardPage() {
  const [granularity, setGranularity] = useState<Granularity | null>("Último día");

  const [data, setData] = useState<DashboardData>(DEFAULT_DATA);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(undefined);
  const [appliedRange, setAppliedRange] = useState<DateRange | undefined>(undefined);
  const [datepickerOpen, setDatepickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [filters, setFilters] = useState<FilterState>({ canal: "Todos", subcanal: "Todos", segmento: "Todos", monto: "Todos", estado: "Todos" });

  const selectPreset = (g: Granularity) => {
    clearTimeout(loadingTimeout.current);
    setLoading(false);
    setGranularity(g);
    setAppliedRange(undefined);
    setData(DEFAULT_DATA);
  };

  const applyCustomRange = () => {
    if (!pendingRange?.from || !pendingRange?.to) return;
    const { from, to } = pendingRange;
    setDatepickerOpen(false);
    setGranularity(null);
    setAppliedRange(pendingRange);
    setLoading(true);
    clearTimeout(loadingTimeout.current);
    loadingTimeout.current = setTimeout(() => {
      setData(generateRangeData(from, to));
      setLoading(false);
    }, 10_000 + Math.random() * 5_000);
  };

  const rangeLabel = appliedRange?.from && appliedRange?.to
    ? `${format(appliedRange.from, "d MMM", { locale: es })} – ${format(appliedRange.to, "d MMM", { locale: es })}`
    : "Rango personalizado";

  const scale = computeScale(filters, data.funnel);
  const historicalFunnel = toHistoricalStages(data.funnel);
  const stackedMonthly = computeStackedSeries(data.monthly, historicalFunnel, filters);
  const stackedHourly = computeStackedSeries(data.hourly, historicalFunnel, filters);
  const stageTime = computeStageTimeSeries(data.hourlyTime, data.funnel, filters);

  const slaPct = computeSlaPct(data.avgMinutes);
  const slaStatus: GaugeStatus = slaPct >= 80 ? "ok" : slaPct >= 60 ? "warn" : "danger";

  const analistaCount = computeStageCounts(data.funnel, filters).find((s) => s.id === "analista")?.count ?? 0;
  const capacity = ANALYST_COUNT * CAPACITY_PER_ANALYST;
  const overflowRatio = capacity > 0 ? analistaCount / capacity : 0;
  const overflowStatus: GaugeStatus = overflowRatio < 0.7 ? "ok" : overflowRatio <= 1 ? "warn" : "danger";

  const indicatorStats: StatDef[] = [
    data.stats[0],
    {
      kind: "gauge", label: "SLA cumplido (<5 min)", value: `${slaPct}%`, status: slaStatus,
      statusLabel: slaStatus === "ok" ? "Cumple SLA" : slaStatus === "warn" ? "En riesgo" : "Incumple SLA",
      help: "Porcentaje de alertas resueltas o escaladas dentro de los 5 minutos definidos como objetivo de SLA.",
    },
    {
      kind: "gauge", label: "Alerta de desbordamiento", value: `${analistaCount}/${capacity}`, status: overflowStatus,
      statusLabel: overflowStatus === "ok" ? "Carga normal" : overflowStatus === "warn" ? "Carga alta" : "Desbordado",
      help: `Alertas referidas a analista vs. capacidad estimada del equipo (${ANALYST_COUNT} analistas × ${CAPACITY_PER_ANALYST} casos c/u).`,
    },
    data.stats[1],
  ];

  const downloadReport = () => {
    const content = buildDashboardReportCsv({
      filters, granularity, appliedRange, indicatorStats,
      stageCounts: computeStageCounts(data.funnel, filters),
      historicalFunnel,
      stackedMonthly, stackedHourly, stageTime,
    });
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-dashboard-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-text-primary">Dashboard</h1>
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
            <Select value={filters.estado} onValueChange={(v) => setFilters((f) => ({ ...f, estado: v as FilterState["estado"] }))}>
              <SelectTrigger className="h-[30px] w-[150px] text-[11px]"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos los estados</SelectItem>
                {DEFAULT_FUNNEL.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
                <Button
                  variant={appliedRange ? "default" : "outline"}
                  size="sm"
                  className="h-[30px] text-[11px] gap-1.5"
                >
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
                  <Button variant="ghost" size="sm" onClick={() => setDatepickerOpen(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={!pendingRange?.from || !pendingRange?.to} onClick={applyCustomRange}>
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-[30px] text-[11px] gap-1.5" onClick={downloadReport}>
              <Download className="h-3.5 w-3.5" />
              Exportar reporte
            </Button>
          </div>
        </div>

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-card/80 backdrop-blur-sm">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-[12px] text-text-secondary">
                Calculando analíticas para el rango seleccionado…
              </span>
            </div>
          )}

          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 mb-6">
            <SectionHeader title="Indicadores generales" help={INDICATORS_HELP} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {indicatorStats.map((s) => <StatCard key={s.label} stat={s} scale={scale} />)}
            </div>
          </section>

          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <SectionHeader title="Distribución de alertas" help={DISTRIBUTION_HELP} />
            <Tabs defaultValue="tiempo-real">
              <TabsList className="mb-5">
                <TabsTrigger value="tiempo-real">Tiempo real</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="tiempo-real">
                <p className="text-[12px] text-text-secondary mb-4">{LIVE_NOTE}</p>
                <AlertDetailPanel stages={DEFAULT_FUNNEL} filters={filters} />
              </TabsContent>

              <TabsContent value="historico">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary mb-3">Alertas procesadas · Mensual</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stackedMonthly} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="#e2e5ef" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickLine={false}
                          axisLine={{ stroke: "#e2e5ef" }}
                          ticks={[1, 5, 10, 15, 20, 25, 30]}
                        />
                        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={32} />
                        <Tooltip
                          labelFormatter={(day) => `Día ${day}`}
                          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(id: string) => historicalFunnel.find((s) => s.id === id)?.name ?? id}
                        />
                        {historicalFunnel.map((stage) => (
                          <Bar key={stage.id} dataKey={stage.id} stackId="stack" fill={stage.color} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary mb-3">Alertas procesadas · Horario diario</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stackedHourly} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="#e2e5ef" vertical={false} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickLine={false}
                          axisLine={{ stroke: "#e2e5ef" }}
                          ticks={[0, 6, 11, 20, 23]}
                          tickFormatter={(h) => `${String(h).padStart(2, "0")}h`}
                        />
                        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={32} />
                        <Tooltip
                          labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                          contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(id: string) => historicalFunnel.find((s) => s.id === id)?.name ?? id}
                        />
                        {historicalFunnel.map((stage) => (
                          <Bar key={stage.id} dataKey={stage.id} stackId="stack" fill={stage.color} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 mt-6">
            <SectionHeader title="Tiempos de procesamiento · Horario diario" help={PROCESSING_TIME_HELP} />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={stageTime} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#e2e5ef" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e5ef" }}
                  ticks={[0, 6, 11, 20, 23]}
                  tickFormatter={(h) => `${String(h).padStart(2, "0")}h`}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  formatter={(value: number) => `${value} min`}
                  labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(id: string) => id === "total" ? "Total" : DEFAULT_FUNNEL.find((s) => s.id === id)?.name ?? id}
                />
                <ReferenceLine
                  y={SLA_TARGET_MINUTES}
                  stroke="#991b1b"
                  strokeDasharray="4 4"
                  label={{ value: `SLA (${SLA_TARGET_MINUTES} min)`, position: "insideTopRight", fill: "#991b1b", fontSize: 11 }}
                />
                <Line type="monotone" dataKey="total" stroke="rgb(0,17,148)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                {STAGE_TIME_IDS.map((id) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={DEFAULT_FUNNEL.find((s) => s.id === id)?.color}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
