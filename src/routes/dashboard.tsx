import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, HelpCircle } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";

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
type StatDef = {
  value: string;
  label: string;
  trend: Trend;
  delta: string;
  help: string;
};

const stats: StatDef[] = [
  {
    value: "1,248", label: "Alertas procesadas", trend: "up", delta: "+18%",
    help: "Total de alertas ARIC procesadas por el agente en el período seleccionado.",
  },
  {
    value: "4m 32s", label: "Tiempo prom. procesamiento", trend: "up", delta: "−12%",
    help: "Tiempo promedio desde la recepción de la alerta hasta su resolución o escalado.",
  },
  {
    value: "1,089", label: "Alertas bien gestionadas", trend: "up", delta: "+21%",
    help: "Alertas cerradas satisfactoriamente sin escalado a analista, desde el último cambio de configuración.",
  },
  {
    value: "12.7%", label: "Ratio falsos positivos", trend: "down", delta: "−3.1pp",
    help: "Porcentaje de alertas incorrectamente clasificadas como positivas desde la última configuración.",
  },
];

const funnel = [
  { name: "Entrada ARIC", count: 412, warn: false, color: "#60a5fa" },
  { name: "Agente ARIA", count: 96, warn: true, color: "#fbbf24" },
  { name: "Voicebot", count: 41, warn: false, color: "#34d399" },
  { name: "Analista", count: 12, warn: false, color: "#a78bfa" },
];

const MONTHLY_SPIKES: Record<number, number> = { 15: 135, 20: 110, 30: 150 };
const monthlyData = Array.from({ length: 30 }, (_, i) => {
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
const hourlyData = Array.from({ length: 24 }, (_, hour) => {
  const step = HOURLY_STEPS.find((s) => hour >= s.from && hour < s.to)!;
  return { hour, alertas: step.value };
});

const GRANULARITIES = ["Último día", "Semana", "Mes"] as const;
type Granularity = typeof GRANULARITIES[number];
const DISTRIBUTION_HELP = "Distribución de alertas activas en cada etapa del flujo de gestión, según el período seleccionado.";

function StatCard({ value, label, trend, delta, help }: StatDef) {
  const [helpOpen, setHelpOpen] = useState(false);

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
        <span className={`flex items-center gap-1 text-[12px] font-medium ${trend === "up" ? "text-success" : "text-danger"}`}>
          {trend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {delta}
        </span>
      </div>
      <div className="mt-3 text-[13px] text-text-secondary">{label}</div>
    </div>
  );
}

const RING_GAP_DEG = 5;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function FunnelRing({ stages }: { stages: typeof funnel }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const [hovered, setHovered] = useState<number | null>(null);

  const arcs = useMemo(() => {
    const availableDeg = 360 - RING_GAP_DEG * stages.length;
    let cumulative = 0;
    return stages.map((stage) => {
      const sweep = (stage.count / total) * availableDeg;
      const arc = { start: cumulative, end: cumulative + sweep };
      cumulative += sweep + RING_GAP_DEG;
      return arc;
    });
  }, [stages, total]);

  const active = hovered !== null ? stages[hovered] : null;

  return (
    <div className="flex items-center gap-8 flex-wrap">
      <div className="relative w-[190px] h-[190px] shrink-0">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {stages.map((stage, i) => (
            <path
              key={stage.name}
              d={describeArc(100, 100, 82, arcs[i].start, arcs[i].end)}
              fill="none"
              stroke={stage.color}
              strokeWidth={22}
              strokeLinecap="round"
              opacity={hovered === null || hovered === i ? 1 : 0.35}
              className="transition-opacity cursor-pointer"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[26px] font-bold tabular-nums text-text-primary">
            {(active ?? { count: total }).count.toLocaleString("es-ES")}
          </span>
          <span className="text-[12px] text-text-secondary text-center px-4">
            {active ? active.name : "Alertas en la distribución"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 min-w-[200px]">
        {stages.map((stage, i) => (
          <div
            key={stage.name}
            className="flex items-center gap-2.5 cursor-pointer"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
            <span className="text-[13px] text-text-primary flex-1">{stage.name}</span>
            <span className="text-[13px] font-semibold tabular-nums text-text-primary">{stage.count}</span>
            {stage.warn && <AlertTriangle className="h-3.5 w-3.5 text-[#92400e]" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardPage() {
  const [granularity, setGranularity] = useState<Granularity>("Último día");
  const [distributionHelpOpen, setDistributionHelpOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[20px] font-bold text-text-primary">Dashboard</h1>
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {GRANULARITIES.map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  granularity === g ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-[14px] font-semibold text-text-primary">Distribución en tiempo real</h2>
            <div className="relative">
              <button
                onClick={() => setDistributionHelpOpen(!distributionHelpOpen)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                aria-label="Ayuda"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              {distributionHelpOpen && (
                <div className="absolute left-0 top-6 z-10 bg-card border border-border rounded-lg p-3 text-[12px] text-text-secondary max-w-[220px] shadow-md">
                  {DISTRIBUTION_HELP}
                </div>
              )}
            </div>
          </div>
          <FunnelRing stages={funnel} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">Alertas procesadas · Mensual</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
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
                  formatter={(value: number) => [value, "Alertas"]}
                  labelFormatter={(day) => `Día ${day}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" }}
                />
                <Line
                  type="monotone"
                  dataKey="alertas"
                  stroke="rgb(0,17,148)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">Alertas procesadas · Horario diario</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={hourlyData} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
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
                  formatter={(value: number) => [value, "Alertas"]}
                  labelFormatter={(h) => `${String(h).padStart(2, "0")}:00`}
                  contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" }}
                />
                <Line
                  type="stepAfter"
                  dataKey="alertas"
                  stroke="rgb(0,17,148)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
