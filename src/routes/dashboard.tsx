import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MetricsFilterBar } from "@/components/MetricsFilterBar";
import {
  CARD,
  ErrorBox,
  LoadingOverlay,
  MaturationBadge,
  MetricsNotices,
  RangeControl,
} from "@/components/metrics/MetricsShared";
import { initialRange, type RangeState } from "@/lib/api/metricsMapping";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getLiveAlertFunnel,
  getMetricsOverview,
  getVersionEvents,
  type ApiDimensionBucket,
  type ApiMetricsOverview,
  type ApiVersionEvent,
} from "@/lib/api/metrics.functions";
import {
  averageSeconds,
  bucketLabel,
  falsePositiveRate,
  formatAmount,
  formatCount,
  formatDuration,
  formatPct,
  ratio,
  resolutionMethodLabel,
  STATUS_COLORS,
  statusLabel,
  toMetricsQuery,
  undetectedFraudRate,
  worstMaturation,
  type FilterSelection,
} from "@/lib/api/metricsMapping";
import { getOperationsCapacity } from "@/lib/api/operations.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Dashboard operacional ARIA — monitoreo en tiempo real de alertas, agente y SLA.",
      },
    ],
  }),
  component: DashboardPage,
});

type GaugeStatus = "ok" | "warn" | "danger";
const GAUGE_STYLES: Record<GaugeStatus, string> = {
  ok: "bg-[#dcfce7] text-[#166534]",
  warn: "bg-[#fef3c7] text-[#92400e]",
  danger: "bg-[#fee2e2] text-[#991b1b]",
};

const SLA_TARGET_MINUTES = 5;
const LIVE_POLL_MS = 20_000;

const DISTRIBUTION_DIMENSIONS: { key: string; label: string; format?: (v: string) => string }[] = [
  { key: "segment", label: "Segmento" },
  { key: "channel", label: "Canal" },
  { key: "subchannel", label: "Subcanal" },
  { key: "amount_tier", label: "Rango de monto" },
  { key: "resolution_method", label: "Método de resolución", format: resolutionMethodLabel },
  { key: "origin", label: "Origen" },
  { key: "configuration_id", label: "Configuración" },
];

const DISTRIBUTION_HELP =
  '"Tiempo real" muestra cuántas alertas hay ahora mismo en cada estado vivo (no depende del rango ni de los filtros). "Histórico" muestra cómo se distribuyó el volumen del rango seleccionado.';
const LIVE_NOTE =
  "Foto del estado actual del pipeline de alertas — no depende del rango de fechas ni de los filtros. Se actualiza cada 20 s.";
const PROCESSING_TIME_HELP =
  "Tiempo medio de resolución por hora del día (00h–23h, hora de Bogotá) = suma de tiempos / alertas resueltas en esa franja, para identificar franjas que incumplen el SLA de 5 minutos.";
const INDICATORS_HELP =
  "Indicadores del rango seleccionado: volumen, calidad de detección (falsos positivos y fraude no detectado sobre alertas decididas — las pendientes se excluyen) y cumplimiento de SLA (<5 min). Reaccionan a los filtros.";

function StatCard({
  label,
  value,
  help,
  detail,
  badge,
}: {
  label: string;
  value: string;
  help: string;
  detail?: string;
  badge?: ReactNode;
}) {
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
        <div className="absolute top-8 right-3 z-10 bg-card border border-border rounded-lg p-3 text-[12px] text-text-secondary max-w-[220px] shadow-md">
          {help}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2 pr-6">
        <span className="text-[30px] font-bold leading-none text-primary tabular-nums">
          {value}
        </span>
        {badge}
      </div>
      <div className="mt-3 text-[13px] text-text-secondary">{label}</div>
      {detail && <div className="mt-1 text-[11px] text-text-secondary tabular-nums">{detail}</div>}
    </div>
  );
}

function GaugeBadge({ status, label }: { status: GaugeStatus; label: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${GAUGE_STYLES[status]}`}>
      {label}
    </span>
  );
}

function SectionHeader({ title, help, extra }: { title: string; help: string; extra?: ReactNode }) {
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
          <div className="absolute left-0 top-6 z-10 bg-card border border-border rounded-lg p-3 text-[12px] text-text-secondary max-w-[260px] shadow-md">
            {help}
          </div>
        )}
      </div>
      {extra}
    </div>
  );
}

function LiveFunnelPanel() {
  const liveQuery = useQuery({
    queryKey: ["metrics", "live"],
    queryFn: getLiveAlertFunnel,
    refetchInterval: LIVE_POLL_MS,
  });
  const capacityQuery = useQuery({
    queryKey: ["operationsCapacity"],
    queryFn: getOperationsCapacity,
    refetchInterval: LIVE_POLL_MS,
  });
  if (liveQuery.isError)
    return <ErrorBox error={liveQuery.error} what="el estado en tiempo real" />;
  const live = liveQuery.data;
  const stages = [
    {
      id: "received",
      name: "En cola sin procesar",
      count: live?.received,
      color: STATUS_COLORS.RECEIVED,
    },
    {
      id: "processing",
      name: "En proceso por ARIA",
      count: live?.processing,
      color: STATUS_COLORS.PROCESSING,
    },
    {
      id: "escalated",
      name: "Referidas a analista",
      count: live?.escalated,
      color: STATUS_COLORS.ESCALATED,
    },
    {
      id: "voicebot",
      name: "En llamada con Voicebot",
      count: live?.voicebot_in_call,
      color: "#34d399",
    },
  ];
  const total = live
    ? live.received + live.processing + live.escalated + live.voicebot_in_call
    : undefined;
  const analysts = capacityQuery.data?.analysts;
  const overflow = live && analysts?.total ? ratio(live.escalated, analysts.total) : null;
  const overflowStatus: GaugeStatus =
    overflow === null ? "ok" : overflow < 0.7 ? "ok" : overflow <= 1 ? "warn" : "danger";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-lg border border-border p-4">
          <div className="text-[24px] font-bold tabular-nums text-text-primary">
            {total === undefined ? "—" : formatCount(total)}
          </div>
          <div className="mt-1 text-[12px] text-text-secondary">Total alertas vivas</div>
        </div>
        {stages.map((stage) => (
          <div key={stage.id} className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-[24px] font-bold tabular-nums text-text-primary">
                {stage.count === undefined ? "—" : formatCount(stage.count)}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-text-secondary">{stage.name}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-secondary">
        <span>Medido: {live ? format(new Date(live.measured_at), "HH:mm:ss") : "—"}</span>
        <span className="text-border">|</span>
        <span>
          Desbordamiento de analistas:{" "}
          {live && analysts?.total ? (
            <>
              <span className="font-semibold text-text-primary tabular-nums">
                {live.escalated}/{analysts.total}
              </span>{" "}
              <GaugeBadge
                status={overflowStatus}
                label={
                  overflowStatus === "ok"
                    ? "Carga normal"
                    : overflowStatus === "warn"
                      ? "Carga alta"
                      : "Desbordado"
                }
              />
            </>
          ) : (
            "sin datos de capacidad"
          )}
        </span>
      </div>
    </div>
  );
}

function DistributionTable({
  buckets,
  total,
  formatValue,
}: {
  buckets: ApiDimensionBucket[];
  total: number;
  formatValue?: (v: string) => string;
}) {
  if (buckets.length === 0)
    return <p className="text-[12px] text-text-secondary py-4">Sin datos en el rango.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-text-secondary text-left">
            <th className="font-normal py-2 pr-3">Valor</th>
            <th className="font-normal py-2 pr-3 text-right">Alertas</th>
            <th className="font-normal py-2 pr-3 text-right">% del total</th>
            <th className="font-normal py-2 pr-3 text-right">Monto</th>
            <th className="font-normal py-2 pr-3 text-right">Falsos positivos</th>
            <th className="font-normal py-2 text-right">Fraude no detectado</th>
          </tr>
        </thead>
        <tbody>
          {[...buckets]
            .sort((a, b) => b.alerts - a.alerts)
            .map((b) => (
              <tr key={b.value} className="border-t border-border">
                <td className="py-2 pr-3 text-text-primary">
                  {b.value === "unknown"
                    ? "Sin dato"
                    : formatValue
                      ? formatValue(b.value)
                      : b.value}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatCount(b.alerts)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatPct(ratio(b.alerts, total))}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {b.amount_count > 0 ? formatAmount(b.amount_sum) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {formatPct(ratio(b.false_positives, b.decided))}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatPct(ratio(b.undetected_fraud, b.decided))}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function csvEscape(value: string | number) {
  const s = String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(values: (string | number)[]) {
  return values.map(csvEscape).join(",");
}

function buildDashboardReportCsv(data: ApiMetricsOverview, filters: FilterSelection) {
  const q = data.fraud_quality;
  const lines: string[] = [];
  lines.push("REPORTE DE DASHBOARD ARIA");
  lines.push(csvRow(["Generado", format(new Date(), "yyyy-MM-dd HH:mm")]));
  lines.push(csvRow(["Desde", data.range.from]));
  lines.push(csvRow(["Hasta", data.range.to]));
  lines.push(csvRow(["Zona horaria", data.range.timezone]));
  lines.push("");
  lines.push("FILTROS APLICADOS");
  for (const [name, value] of Object.entries(filters)) if (value) lines.push(csvRow([name, value]));
  lines.push("");
  lines.push("INDICADORES (sólo medidas acumulativas sobre el periodo)");
  lines.push(csvRow(["Indicador", "Numerador", "Denominador", "Valor"]));
  lines.push(csvRow(["Alertas", data.totals.alerts, "", data.totals.alerts]));
  lines.push(
    csvRow(["Falsos positivos", q.false_positives, q.decided, formatPct(falsePositiveRate(q))]),
  );
  lines.push(
    csvRow([
      "Fraude no detectado",
      q.undetected_fraud,
      q.decided,
      formatPct(undetectedFraudRate(q)),
    ]),
  );
  lines.push(
    csvRow([
      "SLA <5 min",
      data.resolution_time.within_sla_count,
      data.resolution_time.count,
      formatPct(ratio(data.resolution_time.within_sla_count, data.resolution_time.count)),
    ]),
  );
  lines.push(csvRow(["Monto total", data.totals.amount_sum, data.totals.amount_count, ""]));
  lines.push("");
  lines.push("ALERTAS POR ESTADO");
  lines.push(csvRow(["Estado", "Alertas"]));
  for (const b of data.funnel_by_status) lines.push(csvRow([statusLabel(b.value), b.alerts]));
  lines.push("");
  lines.push("PERIODOS");
  lines.push(
    csvRow([
      "Periodo",
      "Nivel",
      "Parcial",
      "Maduración",
      "Alertas",
      "Decididas",
      "Falsos positivos",
      "Fraude no detectado",
      "Revisadas",
    ]),
  );
  for (const p of data.periods) {
    lines.push(
      csvRow([
        p.period,
        p.level,
        p.partial ? "sí" : "no",
        p.maturation,
        p.alerts,
        p.decided,
        p.false_positives,
        p.undetected_fraud,
        p.reviewed,
      ]),
    );
  }
  lines.push("");
  lines.push("PERFIL HORARIO");
  lines.push(csvRow(["Hora", "Alertas", "Resueltas", "Tiempo total (s)", "Dentro de SLA"]));
  for (const h of data.hourly_profile) {
    lines.push(
      csvRow([
        h.hour,
        h.alerts,
        h.resolution_time_count,
        h.resolution_time_sum_seconds,
        h.within_sla_count,
      ]),
    );
  }
  for (const dim of DISTRIBUTION_DIMENSIONS) {
    lines.push("");
    lines.push(`DISTRIBUCIÓN · ${dim.label.toUpperCase()}`);
    lines.push(
      csvRow(["Valor", "Alertas", "Monto", "Decididas", "Falsos positivos", "Fraude no detectado"]),
    );
    for (const b of data.distributions[dim.key] ?? []) {
      lines.push(
        csvRow([b.value, b.alerts, b.amount_sum, b.decided, b.false_positives, b.undetected_fraud]),
      );
    }
  }
  return lines.join("\n");
}

const hourTick = (h: number) => `${String(h).padStart(2, "0")}h`;
const hourLabel = (h: unknown) => `${String(h).padStart(2, "0")}:00`;
const AXIS = { tick: { fontSize: 11, fill: "#6b7280" }, tickLine: false } as const;
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, borderColor: "#e2e5ef" };

function versionEventLabel(event: ApiVersionEvent): string {
  return event.kind === "schema"
    ? `${event.label} v${event.version}`
    : `Config ${event.label} v${event.version}`;
}

function VersionEventLines({
  events,
  x,
}: {
  events: ApiVersionEvent[];
  x: (event: ApiVersionEvent) => number | string;
}) {
  return (
    <>
      {events.map((event) => (
        <ReferenceLine
          key={`${event.kind}-${event.configuration_id ?? "schema"}-${event.version}-${event.at}`}
          x={x(event)}
          stroke="#f59e0b"
          strokeDasharray="3 3"
          label={{
            value: versionEventLabel(event),
            position: "insideTop",
            fill: "#92400e",
            fontSize: 10,
          }}
        >
          <title>{`${versionEventLabel(event)} · ${format(new Date(event.at), "yyyy-MM-dd HH:mm")}`}</title>
        </ReferenceLine>
      ))}
    </>
  );
}

function DashboardPage() {
  const [range, setRange] = useState<RangeState>(() => initialRange());
  const [filters, setFilters] = useState<FilterSelection>({});
  const query = toMetricsQuery({ from: range.from, to: range.to }, filters);
  const overviewQuery = useQuery({
    queryKey: ["metrics", "overview", { from: range.from, to: range.to }, query.filters],
    queryFn: () => getMetricsOverview({ data: query }),
  });
  const versionEventsQuery = useQuery({
    queryKey: ["metrics", "version-events", { from: range.from, to: range.to }],
    queryFn: () => getVersionEvents({ data: { from: range.from, to: range.to } }),
  });
  const data = overviewQuery.data;
  const versionEvents = versionEventsQuery.data ?? [];

  const q = data?.fraud_quality;
  const rt = data?.resolution_time;
  const maturation = data ? worstMaturation(data.periods) : null;
  const slaRate = rt ? ratio(rt.within_sla_count, rt.count) : null;
  const slaStatus: GaugeStatus =
    slaRate === null ? "ok" : slaRate >= 0.8 ? "ok" : slaRate >= 0.6 ? "warn" : "danger";

  const hourly = (data?.hourly_profile ?? []).map((h) => {
    const avg = averageSeconds(h.resolution_time_sum_seconds, h.resolution_time_count);
    return {
      hour: h.hour,
      alertas: h.alerts,
      minutos: avg === null ? null : Math.round((avg / 60) * 10) / 10,
    };
  });
  const periods = (data?.periods ?? []).map((p) => ({ ...p, label: p.period }));
  const funnel = (data?.funnel_by_status ?? []).map((b) => ({
    ...b,
    name: statusLabel(b.value),
    fill: STATUS_COLORS[b.value] ?? STATUS_COLORS.unknown,
  }));

  const downloadReport = () => {
    if (!data) return;
    const blob = new Blob(["﻿" + buildDashboardReportCsv(data, filters)], {
      type: "text/csv;charset=utf-8",
    });
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
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-[20px] font-bold text-text-primary">Dashboard</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <MetricsFilterBar
              value={filters}
              onChange={setFilters}
              dimensions={["segment", "channel", "subchannel", "amount_tier", "status"]}
              range={{ from: range.from, to: range.to }}
              canReadObservedValues
            />
            <RangeControl value={range} onChange={setRange} />
            <Button
              variant="outline"
              size="sm"
              className="h-[30px] text-[11px] gap-1.5"
              onClick={downloadReport}
              disabled={!data}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar reporte
            </Button>
          </div>
        </div>

        {overviewQuery.isError && (
          <ErrorBox error={overviewQuery.error} what="los indicadores del dashboard" />
        )}
        <MetricsNotices warnings={data?.warnings ?? []} />

        <div className="relative">
          {overviewQuery.isFetching && (
            <LoadingOverlay label="Calculando analíticas para el rango seleccionado…" />
          )}

          <section className={`${CARD} p-5 mb-6`}>
            <SectionHeader title="Indicadores generales" help={INDICATORS_HELP} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Alertas procesadas"
                value={data ? formatCount(data.totals.alerts) : "—"}
                help="Total de alertas recibidas en el rango (todas las etapas y estados), según la hora de llegada."
                detail={
                  data && data.totals.amount_count > 0
                    ? `Monto total ${formatAmount(data.totals.amount_sum)}`
                    : undefined
                }
              />
              <StatCard
                label="Ratio falsos positivos"
                value={q ? formatPct(falsePositiveRate(q)) : "—"}
                help="Alertas marcadas como fraude que el equipo de fraude confirmó como no fraude, sobre las alertas decididas (las pendientes se excluyen)."
                detail={
                  q
                    ? `${formatCount(q.false_positives)} de ${formatCount(q.decided)} decididas · ${formatCount(q.pending)} pendientes`
                    : undefined
                }
                badge={<MaturationBadge maturation={maturation} />}
              />
              <StatCard
                label="Fraude no detectado"
                value={q ? formatPct(undetectedFraudRate(q)) : "—"}
                help="Alertas marcadas como no fraude que resultaron ser fraude, sobre las alertas decididas (las pendientes se excluyen)."
                detail={
                  q
                    ? `${formatCount(q.undetected_fraud)} de ${formatCount(q.decided)} · ${formatAmount(q.undetected_fraud_amount_sum)}`
                    : undefined
                }
                badge={<MaturationBadge maturation={maturation} />}
              />
              <StatCard
                label={`SLA cumplido (<${SLA_TARGET_MINUTES} min)`}
                value={rt ? formatPct(slaRate) : "—"}
                help="Alertas resueltas dentro de 5 minutos sobre las alertas con tiempo de resolución medido en el rango."
                detail={
                  rt
                    ? `${formatCount(rt.within_sla_count)} de ${formatCount(rt.count)} · medio ${formatDuration(averageSeconds(rt.sum_seconds, rt.count))}`
                    : undefined
                }
                badge={
                  rt && slaRate !== null ? (
                    <GaugeBadge
                      status={slaStatus}
                      label={
                        slaStatus === "ok"
                          ? "Cumple SLA"
                          : slaStatus === "warn"
                            ? "En riesgo"
                            : "Incumple SLA"
                      }
                    />
                  ) : undefined
                }
              />
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <SectionHeader title="Distribución de alertas" help={DISTRIBUTION_HELP} />
            <Tabs defaultValue="tiempo-real">
              <TabsList className="mb-5">
                <TabsTrigger value="tiempo-real">Tiempo real</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
                <TabsTrigger value="dimensiones">Por dimensión</TabsTrigger>
              </TabsList>

              <TabsContent value="tiempo-real">
                <p className="text-[12px] text-text-secondary mb-4">{LIVE_NOTE}</p>
                <LiveFunnelPanel />
              </TabsContent>

              <TabsContent value="historico">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary mb-3">
                      Alertas por estado · rango
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={funnel}
                        layout="vertical"
                        margin={{ top: 5, right: 12, bottom: 0, left: 40 }}
                      >
                        <CartesianGrid stroke="#e2e5ef" horizontal={false} />
                        <XAxis
                          type="number"
                          {...AXIS}
                          axisLine={{ stroke: "#e2e5ef" }}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          {...AXIS}
                          axisLine={false}
                          width={120}
                        />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number) => [formatCount(v), "Alertas"]}
                        />
                        <Bar dataKey="alerts" isAnimationActive={false}>
                          {funnel.map((b) => (
                            <Cell key={b.value} fill={b.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-text-primary mb-3">
                      Alertas por periodo
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={periods} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="#e2e5ef" vertical={false} />
                        <XAxis dataKey="label" {...AXIS} axisLine={{ stroke: "#e2e5ef" }} />
                        <YAxis {...AXIS} axisLine={false} width={40} allowDecimals={false} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number, name: string) => [
                            formatCount(v),
                            name === "alerts"
                              ? "Alertas"
                              : name === "false_positives"
                                ? "Falsos positivos"
                                : "Fraude no detectado",
                          ]}
                        />
                        <VersionEventLines
                          events={versionEvents}
                          x={(event) => format(new Date(event.at), "yyyy-MM-dd")}
                        />
                        <Bar dataKey="alerts" fill="rgb(0,17,148)" />
                        <Bar dataKey="false_positives" fill="#fbbf24" />
                        <Bar dataKey="undetected_fraud" fill="#f87171" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="lg:col-span-2">
                    <h3 className="text-[13px] font-semibold text-text-primary mb-3">
                      Perfil horario · alertas por hora del día
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={hourly} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                        <CartesianGrid stroke="#e2e5ef" vertical={false} />
                        <XAxis
                          dataKey="hour"
                          {...AXIS}
                          axisLine={{ stroke: "#e2e5ef" }}
                          ticks={[0, 6, 11, 16, 20, 23]}
                          tickFormatter={hourTick}
                        />
                        <YAxis {...AXIS} axisLine={false} width={40} allowDecimals={false} />
                        <Tooltip
                          labelFormatter={hourLabel}
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number) => [formatCount(v), "Alertas"]}
                        />
                        <Bar dataKey="alertas" fill="#60a5fa" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="dimensiones">
                <Tabs defaultValue={DISTRIBUTION_DIMENSIONS[0].key}>
                  <TabsList className="mb-4 flex-wrap h-auto">
                    {DISTRIBUTION_DIMENSIONS.map((d) => (
                      <TabsTrigger key={d.key} value={d.key}>
                        {d.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {DISTRIBUTION_DIMENSIONS.map((d) => (
                    <TabsContent key={d.key} value={d.key}>
                      <DistributionTable
                        buckets={data?.distributions[d.key] ?? []}
                        total={data?.totals.alerts ?? 0}
                        formatValue={d.format}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </TabsContent>
            </Tabs>
          </section>

          <section className={`${CARD} p-5 mt-6`}>
            <SectionHeader
              title="Tiempos de resolución · Horario diario"
              help={PROCESSING_TIME_HELP}
            />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={hourly} margin={{ top: 5, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#e2e5ef" vertical={false} />
                <XAxis
                  dataKey="hour"
                  {...AXIS}
                  axisLine={{ stroke: "#e2e5ef" }}
                  ticks={[0, 6, 11, 16, 20, 23]}
                  tickFormatter={hourTick}
                />
                <YAxis {...AXIS} axisLine={false} width={40} />
                <Tooltip
                  formatter={(value) => [
                    value === null || value === undefined ? "sin datos" : `${value} min`,
                    "Tiempo medio",
                  ]}
                  labelFormatter={hourLabel}
                  contentStyle={TOOLTIP_STYLE}
                />
                <VersionEventLines
                  events={versionEvents}
                  x={(event) => new Date(event.at).getHours()}
                />
                <ReferenceLine
                  y={SLA_TARGET_MINUTES}
                  stroke="#991b1b"
                  strokeDasharray="4 4"
                  label={{
                    value: `SLA (${SLA_TARGET_MINUTES} min)`,
                    position: "insideTopRight",
                    fill: "#991b1b",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="minutos"
                  stroke="rgb(0,17,148)"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
            {rt && rt.histogram.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-text-secondary">
                <span className="font-medium text-text-primary">Histograma:</span>
                {rt.histogram.map((b) => (
                  <span
                    key={b.bucket}
                    className="rounded-md border border-border px-2 py-0.5 tabular-nums"
                  >
                    {bucketLabel(b)}: {formatCount(b.count)}
                  </span>
                ))}
              </div>
            )}
          </section>

          {q && (
            <section className={`${CARD} p-5 mt-6`}>
              <SectionHeader
                title="Revisión del equipo de fraude"
                help="Correcciones del fraud_label hechas por el equipo de fraude (UI o carga CSV). La maduración agrupa cuánto tardó en llegar la revisión desde la marca."
                extra={<MaturationBadge maturation={maturation} />}
              />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-[12px]">
                <div className="rounded-lg border border-border p-4">
                  <div className="text-[20px] font-bold tabular-nums">
                    {formatCount(q.reviewed)}
                  </div>
                  <div className="text-text-secondary">Alertas revisadas</div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-[20px] font-bold tabular-nums">
                    {formatCount(q.reviewed_changed)}
                  </div>
                  <div className="text-text-secondary">Revisadas con cambio</div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-[20px] font-bold tabular-nums">
                    {formatCount(q.reviewed_confirmed)}
                  </div>
                  <div className="text-text-secondary">Revisadas confirmadas</div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="text-[20px] font-bold tabular-nums">
                    {formatAmount(q.false_positive_amount_sum)}
                  </div>
                  <div className="text-text-secondary">Monto en falsos positivos</div>
                </div>
              </div>
              {q.maturation_histogram.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-text-secondary">
                  <span className="font-medium text-text-primary">Tiempo hasta la revisión:</span>
                  {q.maturation_histogram.map((b) => (
                    <span
                      key={b.bucket}
                      className="rounded-md border border-border px-2 py-0.5 tabular-nums"
                    >
                      {bucketLabel(b)}: {formatCount(b.count)}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
